"""Tests for project-scoped local presentation artifact storage."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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

    def test_paths_stay_below_legacy_windows_limit_in_deep_checkout(self) -> None:
        root = Path(
            "C:/Users/kook1/OneDrive/桌面/youthlm/youthlm/var/demo-preflight/"
            "20260907-113000-12345678/artifacts"
        )
        store = LocalPresentationArtifactStore(root)

        path = store._artifact_path("project_frontend_demo", "presentation_1")
        with patch("presentation_store.uuid4") as fake_uuid:
            fake_uuid.return_value.hex = "c" * 32
            temporary_path = store._temporary_path(path)

        self.assertEqual(len(path.parent.name), 32)
        self.assertEqual(len(path.stem), 32)
        self.assertLess(len(str(temporary_path)), 260)

    def test_reads_artifact_saved_with_legacy_full_hash_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = LocalPresentationArtifactStore(directory)
            legacy_path = store._legacy_artifact_path(
                "project_1",
                "presentation_1",
            )
            legacy_path.parent.mkdir(parents=True)
            legacy_path.write_bytes(b"PK-legacy")

            artifact = store.get("project_1", "presentation_1")

            self.assertIsNotNone(artifact)
            assert artifact is not None
            self.assertEqual(artifact.path, legacy_path)

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
