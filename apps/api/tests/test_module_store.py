"""Persistence tests for project-scoped Module Context storage."""

import json
import tempfile
import unittest
from pathlib import Path

from contract_models import AnalysisResult, ModuleContext
from module_store import SQLiteModuleStore

REPOSITORY_ROOT = Path(__file__).parents[3]
RESULT_FIXTURE = (
    REPOSITORY_ROOT
    / "contracts/fixtures/frontend-integration/analysis-result.example.json"
)


def analysis_result() -> AnalysisResult:
    return AnalysisResult.model_validate(
        json.loads(RESULT_FIXTURE.read_text(encoding="utf-8"))
    )


class SQLiteModuleStoreTests(unittest.TestCase):
    def test_survives_store_recreation_and_returns_module_context(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "state" / "youthlm.sqlite3"
            result = analysis_result()

            SQLiteModuleStore(database_path).save(result)
            context = SQLiteModuleStore(database_path).get_context(
                result.project_id,
                result.module_id,
            )

            self.assertTrue(database_path.exists())
            self.assertIsInstance(context, ModuleContext)
            self.assertEqual(context.summary, result.summary)
            self.assertEqual(context.result_data, result.result_data)
            self.assertFalse(hasattr(context, "visualization"))
            self.assertFalse(hasattr(context, "analysis_plan"))

    def test_same_module_id_in_another_project_is_not_visible(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteModuleStore(Path(directory) / "youthlm.sqlite3")
            result = analysis_result()
            store.save(result)

            context = store.get_context("different_project", result.module_id)

            self.assertIsNone(context)

    def test_save_updates_only_the_same_project_module_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteModuleStore(Path(directory) / "youthlm.sqlite3")
            result = analysis_result()
            store.save(result)
            store.save(result.model_copy(update={"summary": "Updated summary"}))

            context = store.get_context(result.project_id, result.module_id)

            self.assertEqual(context.summary, "Updated summary")


if __name__ == "__main__":
    unittest.main()
