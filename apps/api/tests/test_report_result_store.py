"""Tests for project-scoped ReportResult metadata persistence."""

import tempfile
import unittest
from pathlib import Path

from contract_models import ReportResult
from report_result_store import SQLiteReportResultStore

REPOSITORY_ROOT = Path(__file__).parents[3]
RESULT_FIXTURE = REPOSITORY_ROOT / "contracts/examples/report-result.json"


def report_result() -> ReportResult:
    return ReportResult.model_validate_json(RESULT_FIXTURE.read_text(encoding="utf-8"))


class ReportResultStoreTests(unittest.TestCase):
    def test_persists_metadata_across_store_instances(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "youthlm.sqlite3"
            result = report_result()

            SQLiteReportResultStore(database_path).save(result)
            loaded = SQLiteReportResultStore(database_path).get(
                result.project_id,
                result.report_id,
            )

            self.assertEqual(loaded, result)

    def test_same_report_id_is_isolated_by_project(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteReportResultStore(Path(directory) / "youthlm.sqlite3")
            result = report_result()
            store.save(result)

            self.assertIsNone(store.get("different_project", result.report_id))


if __name__ == "__main__":
    unittest.main()
