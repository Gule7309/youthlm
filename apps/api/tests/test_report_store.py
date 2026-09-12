"""Tests for project-scoped local report artifact storage."""

import tempfile
import unittest

from report_store import LocalReportArtifactStore, ReportArtifactStoreError


class LocalReportArtifactStoreTests(unittest.TestCase):
    def test_survives_recreation_without_exposing_identifiers_in_paths(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            stored = LocalReportArtifactStore(directory).save(
                "project_1",
                "report_1",
                b"PK-report",
            )
            loaded = LocalReportArtifactStore(directory).get(
                "project_1",
                "report_1",
            )

            self.assertEqual(loaded, stored)
            self.assertEqual(stored.path.read_bytes(), b"PK-report")
            self.assertEqual(stored.file_name, "report_1.docx")
            self.assertNotIn("project_1", str(stored.path))
            self.assertNotIn("report_1", str(stored.path))

    def test_same_report_id_is_isolated_by_project(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = LocalReportArtifactStore(directory)
            store.save("project_a", "report_1", b"PK-project-a")

            self.assertIsNone(store.get("project_b", "report_1"))

    def test_rejects_empty_artifact(self) -> None:
        with (
            tempfile.TemporaryDirectory() as directory,
            self.assertRaises(ReportArtifactStoreError),
        ):
            LocalReportArtifactStore(directory).save(
                "project_1",
                "report_1",
                b"",
            )


if __name__ == "__main__":
    unittest.main()
