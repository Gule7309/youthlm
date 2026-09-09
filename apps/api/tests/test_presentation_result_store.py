"""Tests for project-scoped PresentationResult metadata persistence."""

import tempfile
import unittest
from pathlib import Path

from contract_models import PresentationResult
from presentation_result_store import SQLitePresentationResultStore

REPOSITORY_ROOT = Path(__file__).parents[3]
RESULT_FIXTURE = REPOSITORY_ROOT / "contracts/examples/presentation-result.json"


def presentation_result() -> PresentationResult:
    return PresentationResult.model_validate_json(
        RESULT_FIXTURE.read_text(encoding="utf-8")
    )


class PresentationResultStoreTests(unittest.TestCase):
    def test_persists_metadata_across_store_instances(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "youthlm.sqlite3"
            result = presentation_result()

            SQLitePresentationResultStore(database_path).save(result)
            loaded = SQLitePresentationResultStore(database_path).get(
                result.project_id,
                result.presentation_id,
            )

            self.assertEqual(loaded, result)

    def test_same_presentation_id_is_isolated_by_project(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLitePresentationResultStore(
                Path(directory) / "youthlm.sqlite3"
            )
            result = presentation_result()
            store.save(result)

            self.assertIsNone(
                store.get("different_project", result.presentation_id)
            )


if __name__ == "__main__":
    unittest.main()
