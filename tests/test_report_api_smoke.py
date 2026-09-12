"""Tests for the live Report Artifact smoke contract."""

import tempfile
import unittest
from datetime import UTC, datetime
from hashlib import sha256

from apps.api.contract_models import ReportResult
from spikes.report_api_smoke import ReportApiSmokeError, run_smoke


class ReportApiSmokeTests(unittest.TestCase):
    def test_creates_downloads_validates_and_saves_docx(self) -> None:
        content = b"PK-valid-docx"
        calls: list[tuple[str, object, int]] = []

        def post_json(url: str, payload: dict, timeout_seconds: int) -> dict:
            calls.append((url, payload, timeout_seconds))
            return ReportResult(
                contract_version="0.1.0",
                project_id=payload["project_id"],
                report_id="report_smoke",
                source_module_ids=payload["source_module_ids"],
                title=payload["title"],
                status="ready",
                output_format="docx",
                media_type=(
                    "application/vnd.openxmlformats-officedocument."
                    "wordprocessingml.document"
                ),
                file_name="report_smoke.docx",
                file_size_bytes=len(content),
                artifact_sha256=sha256(content).hexdigest(),
                download_url=(
                    "/v1/projects/project_frontend_demo/reports/"
                    "report_smoke/download"
                ),
                created_at=datetime(2026, 9, 10, 12, 0, tzinfo=UTC),
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

        self.assertEqual(calls[0][0], "http://127.0.0.1:8123/v1/reports")
        self.assertEqual(calls[0][2], 42)
        self.assertEqual(
            calls[1][0],
            "http://127.0.0.1:8123"
            "/v1/projects/project_frontend_demo/reports/"
            "report_smoke/download",
        )

    def test_rejects_download_with_wrong_checksum(self) -> None:
        content = b"PK-actual"

        def post_json(_url: str, payload: dict, _timeout: int) -> dict:
            return {
                "contract_version": "0.1.0",
                "project_id": payload["project_id"],
                "report_id": "report_smoke",
                "source_module_ids": payload["source_module_ids"],
                "title": payload["title"],
                "status": "ready",
                "output_format": "docx",
                "media_type": (
                    "application/vnd.openxmlformats-officedocument."
                    "wordprocessingml.document"
                ),
                "file_name": "report_smoke.docx",
                "file_size_bytes": len(content),
                "artifact_sha256": "a" * 64,
                "download_url": "/download",
                "created_at": "2026-09-10T12:00:00Z",
                "warnings": [],
            }

        with (
            tempfile.TemporaryDirectory() as directory,
            self.assertRaisesRegex(ReportApiSmokeError, "checksum"),
        ):
            run_smoke(
                "http://127.0.0.1:8000",
                directory,
                post_json=post_json,
                get_bytes=lambda _url, _timeout: content,
            )


if __name__ == "__main__":
    unittest.main()
