"""Persistence tests for project-scoped Module Context storage."""

import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from contract_models import AnalysisResult, ModuleContext
from module_store import ModuleStoreError, SQLiteModuleStore

REPOSITORY_ROOT = Path(__file__).parents[3]
RESULT_FIXTURE = (
    REPOSITORY_ROOT
    / "contracts/fixtures/frontend-integration/analysis-result.example.json"
)


def analysis_result() -> AnalysisResult:
    return AnalysisResult.model_validate(
        json.loads(RESULT_FIXTURE.read_text(encoding="utf-8"))
    )


class TrackingConnection(sqlite3.Connection):
    """Expose close state without changing SQLite transaction behaviour."""

    closed = False

    def close(self) -> None:
        self.closed = True
        super().close()


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

            full_result = SQLiteModuleStore(database_path).get_result(
                result.project_id,
                result.module_id,
            )
            self.assertEqual(full_result, result)
            self.assertIsNot(full_result, result)

    def test_same_module_id_in_another_project_is_not_visible(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteModuleStore(Path(directory) / "youthlm.sqlite3")
            result = analysis_result()
            store.save(result)

            context = store.get_context("different_project", result.module_id)
            full_result = store.get_result("different_project", result.module_id)

            self.assertIsNone(context)
            self.assertIsNone(full_result)

    def test_save_updates_only_the_same_project_module_key(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteModuleStore(Path(directory) / "youthlm.sqlite3")
            result = analysis_result()
            store.save(result)
            store.save(result.model_copy(update={"summary": "Updated summary"}))

            context = store.get_context(result.project_id, result.module_id)

            self.assertEqual(context.summary, "Updated summary")

    def test_closes_every_connection_after_successful_operations(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "youthlm.sqlite3"
            store = SQLiteModuleStore(database_path)
            result = analysis_result()
            real_connect = sqlite3.connect
            connections: list[TrackingConnection] = []

            def tracked_connect(*args, **kwargs):
                connection = real_connect(
                    *args,
                    **kwargs,
                    factory=TrackingConnection,
                )
                connections.append(connection)
                return connection

            with patch("module_store.sqlite3.connect", side_effect=tracked_connect):
                store.save(result)
                self.assertEqual(
                    store.get_result(result.project_id, result.module_id),
                    result,
                )
                self.assertIsNone(
                    store.get_context("another_project", result.module_id)
                )

            self.assertEqual(len(connections), 3)
            self.assertTrue(all(connection.closed for connection in connections))
            database_path.unlink()

    def test_closes_connection_when_schema_initialization_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "youthlm.sqlite3"
            real_connect = sqlite3.connect

            class FailingInitializationConnection(TrackingConnection):
                def execute(self, *args, **kwargs):
                    raise sqlite3.OperationalError("simulated schema failure")

            connection = real_connect(
                database_path,
                factory=FailingInitializationConnection,
            )
            with (
                patch("module_store.sqlite3.connect", return_value=connection),
                self.assertRaises(ModuleStoreError),
            ):
                SQLiteModuleStore(database_path).get_result(
                    "project_1",
                    "analysis_1",
                )

            self.assertTrue(connection.closed)
            database_path.unlink()

    def test_closes_connection_before_reporting_invalid_stored_row(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "youthlm.sqlite3"
            store = SQLiteModuleStore(database_path)
            result = analysis_result()
            store.save(result)

            with closing(sqlite3.connect(database_path)) as connection, connection:
                connection.execute(
                    """
                    UPDATE analysis_modules
                    SET result_json = ?
                    WHERE project_id = ? AND module_id = ?
                    """,
                    ("not-json", result.project_id, result.module_id),
                )

            real_connect = sqlite3.connect
            connections: list[TrackingConnection] = []

            def tracked_connect(*args, **kwargs):
                connection = real_connect(
                    *args,
                    **kwargs,
                    factory=TrackingConnection,
                )
                connections.append(connection)
                return connection

            with (
                patch("module_store.sqlite3.connect", side_effect=tracked_connect),
                self.assertRaises(ModuleStoreError),
            ):
                store.get_result(result.project_id, result.module_id)

            self.assertEqual(len(connections), 1)
            self.assertTrue(connections[0].closed)
            database_path.unlink()


if __name__ == "__main__":
    unittest.main()
