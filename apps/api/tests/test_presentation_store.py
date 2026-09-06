"""Tests for project-scoped local presentation artifact storage."""

import tempfile
import unittest
from pathlib import Path

from presentation_store import (
    LocalPresentationArtifactStore,
    PresentationArtifactStoreError,
)


class LocalPresentationArtifactStoreTests(unittest.TestCase):
    def test_survives_store_recreation_without_exposing_identifiers_in_paths(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "artifacts"
            stored = LocalPresentationArtifactStore(root).save(
                "project_1",
                "presentation_1",
                b"PK-presentation",
            )

            loaded = LocalPresentationArtifactStore(root).get(
                "project_1",
                "presentation_1",
            )

            self.assertEqual(loaded, stored)
            self.assertEqual(stored.path.read_bytes(), b"PK-presentation")
            self.assertEqual(stored.file_name, "presentation_1.pptx")
            self.assertNotIn("project_1", str(stored.path))
            self.assertNotIn("presentation_1", str(stored.path))

    def test_same_presentation_id_isolated_by_project(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = LocalPresentationArtifactStore(directory)
            store.save("project_a", "presentation_1", b"PK-project-a")

            self.assertIsNone(store.get("project_b", "presentation_1"))

    def test_rejects_empty_artifact(self) -> None:
        with (
            tempfile.TemporaryDirectory() as directory,
            self.assertRaises(PresentationArtifactStoreError),
        ):
            LocalPresentationArtifactStore(directory).save(
                "project_1",
                "presentation_1",
                b"",
            )


if __name__ == "__main__":
    unittest.main()
