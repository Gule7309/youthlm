"""Tests for the live Presentation Artifact smoke contract."""

import tempfile
import unittest
from datetime import UTC, datetime
from hashlib import sha256

from apps.api.contract_models import PresentationResult
from spikes.presentation_api_smoke import (
    PresentationApiSmokeError,
    run_smoke,
)


class PresentationApiSmokeTests(unittest.TestCase):
    def test_creates_downloads_validates_and_saves_pptx(self) -> None:
        content = b"PK-valid-pptx"
        calls: list[tuple[str, object, int]] = []

        def post_json(url: str, payload: dict, timeout_seconds: int) -> dict:
            calls.append((url, payload, timeout_seconds))
            return PresentationResult(
                contract_version="0.1.0",
                project_id=payload["project_id"],
                presentation_id="presentation_smoke",
                source_module_ids=payload["source_module_ids"],
                title=payload["title"],
                status="ready",
                output_format="pptx",
                media_type=(
                    "application/vnd.openxmlformats-officedocument."
                    "presentationml.presentation"
                ),
                file_name="presentation_smoke.pptx",
                file_size_bytes=len(content),
                artifact_sha256=sha256(content).hexdigest(),
                download_url=(
                    "/v1/projects/project_frontend_demo/presentations/"
                    "presentation_smoke/download"
                ),
                created_at=datetime(2026, 9, 6, 12, 0, tzinfo=UTC),
                warnings=[],
            ).model_dump(mode="json")

        def get_bytes(url: str, timeout_seconds: int) -> bytes:
            calls.append((url, None, timeout_seconds))
            return content

        with tempfile.TemporaryDirectory() as directory:
            result, output_path = run_smoke(
                "http://127.0.0.1:8123/",
                directory,
                timeout_seconds=42,
                post_json=post_json,
                get_bytes=get_bytes,
            )

            self.assertEqual(output_path.read_bytes(), content)
            self.assertEqual(output_path.name, result.file_name)

        self.assertEqual(calls[0][0], "http://127.0.0.1:8123/v1/presentations")
        self.assertEqual(calls[0][2], 42)
        self.assertEqual(
            calls[1][0],
            "http://127.0.0.1:8123"
            "/v1/projects/project_frontend_demo/presentations/"
            "presentation_smoke/download",
        )

    def test_rejects_download_with_wrong_checksum(self) -> None:
        content = b"PK-actual"

        def post_json(_url: str, payload: dict, _timeout: int) -> dict:
            return {
                "contract_version": "0.1.0",
                "project_id": payload["project_id"],
                "presentation_id": "presentation_smoke",
                "source_module_ids": payload["source_module_ids"],
                "title": payload["title"],
                "status": "ready",
                "output_format": "pptx",
                "media_type": (
                    "application/vnd.openxmlformats-officedocument."
                    "presentationml.presentation"
                ),
                "file_name": "presentation_smoke.pptx",
                "file_size_bytes": len(content),
                "artifact_sha256": "a" * 64,
                "download_url": "/download",
                "created_at": "2026-09-06T12:00:00Z",
                "warnings": [],
            }

        with (
            tempfile.TemporaryDirectory() as directory,
            self.assertRaisesRegex(PresentationApiSmokeError, "checksum"),
        ):
            run_smoke(
                "http://127.0.0.1:8000",
                directory,
                post_json=post_json,
                get_bytes=lambda _url, _timeout: content,
            )


if __name__ == "__main__":
    unittest.main()
