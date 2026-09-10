"""Tests for the complete live-demo preflight orchestration."""

import json
import tempfile
import unittest
from pathlib import Path

from apps.api.contract_models import AnalysisResult, PresentationResult, ReportResult
from spikes.analysis_api_smoke import AnalysisApiSmokeError
from spikes.demo_preflight import DemoPreflightError, run_preflight


def analysis_result(module_id: str) -> AnalysisResult:
    fixture_path = Path(
        "contracts/fixtures/frontend-integration/analysis-result.example.json"
    )
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    payload["module_id"] = module_id
    return AnalysisResult.model_validate(payload)


class DemoPreflightTests(unittest.TestCase):
    def test_runs_analysis_context_then_downloadable_artifacts(self) -> None:
        calls: list[tuple] = []
        source = analysis_result("analysis_population_chart")
        upstream = analysis_result("analysis_population_followup")
        upstream.upstream_module_ids = [source.module_id]

        def run_analysis(base_url: str, *, timeout_seconds: int):
            calls.append(("analysis", base_url, timeout_seconds))
            return source, upstream

        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "presentation.pptx"
            output_path.write_bytes(b"PK-test")
            presentation = PresentationResult.model_validate(
                {
                    "contract_version": "0.1.0",
                    "project_id": source.project_id,
                    "presentation_id": "presentation_1",
                    "source_module_ids": [source.module_id],
                    "title": "板橋區青年人口趨勢",
                    "status": "ready",
                    "output_format": "pptx",
                    "media_type": (
                        "application/vnd.openxmlformats-officedocument."
                        "presentationml.presentation"
                    ),
                    "file_name": "presentation.pptx",
                    "file_size_bytes": output_path.stat().st_size,
                    "artifact_sha256": "a" * 64,
                    "download_url": "/download",
                    "created_at": "2026-09-07T00:00:00Z",
                    "warnings": [],
                }
            )

            def run_presentation(
                base_url: str,
                output_directory: str | Path,
                *,
                timeout_seconds: int,
            ):
                calls.append(
                    (
                        "presentation",
                        base_url,
                        Path(output_directory),
                        timeout_seconds,
                    )
                )
                return presentation, output_path

            report_path = Path(directory) / "report.docx"
            report_path.write_bytes(b"PK-test-report")
            report = ReportResult.model_validate(
                {
                    "contract_version": "0.1.0",
                    "project_id": source.project_id,
                    "report_id": "report_1",
                    "source_module_ids": [source.module_id],
                    "title": "板橋區青年人口議題研析報告",
                    "status": "ready",
                    "output_format": "docx",
                    "media_type": (
                        "application/vnd.openxmlformats-officedocument."
                        "wordprocessingml.document"
                    ),
                    "file_name": "report.docx",
                    "file_size_bytes": report_path.stat().st_size,
                    "artifact_sha256": "b" * 64,
                    "download_url": "/report-download",
                    "created_at": "2026-09-10T00:00:00Z",
                    "warnings": [],
                }
            )

            def run_report(
                base_url: str,
                output_directory: str | Path,
                *,
                timeout_seconds: int,
            ):
                calls.append(
                    ("report", base_url, Path(output_directory), timeout_seconds)
                )
                return report, report_path

            result = run_preflight(
                "http://127.0.0.1:8123",
                directory,
                timeout_seconds=123,
                analysis_smoke=run_analysis,
                presentation_smoke=run_presentation,
                report_smoke=run_report,
            )

        self.assertEqual(calls[0], ("analysis", "http://127.0.0.1:8123", 123))
        self.assertEqual(calls[1][0], "presentation")
        self.assertEqual(calls[2][0], "report")
        self.assertEqual(result["source_chart"]["record_count"], 3)
        self.assertEqual(
            result["presentation"]["source_module_ids"],
            [source.module_id],
        )
        self.assertEqual(result["report"]["source_module_ids"], [source.module_id])

    def test_converts_component_smoke_failure_to_one_clear_error(self) -> None:
        def fail_analysis(_base_url: str, *, timeout_seconds: int):
            raise AnalysisApiSmokeError(f"failed after {timeout_seconds}")

        with self.assertRaisesRegex(DemoPreflightError, "failed after 42"):
            run_preflight(
                "http://127.0.0.1:8000",
                "var/output",
                timeout_seconds=42,
                analysis_smoke=fail_analysis,
            )

    def test_rejects_presentation_built_from_another_module(self) -> None:
        source = analysis_result("analysis_population_chart")
        upstream = analysis_result("analysis_population_followup")
        presentation = PresentationResult.model_validate(
            {
                "contract_version": "0.1.0",
                "project_id": source.project_id,
                "presentation_id": "presentation_1",
                "source_module_ids": ["analysis_other"],
                "title": "Other",
                "status": "ready",
                "output_format": "pptx",
                "media_type": (
                    "application/vnd.openxmlformats-officedocument."
                    "presentationml.presentation"
                ),
                "file_name": "other.pptx",
                "file_size_bytes": 7,
                "artifact_sha256": "a" * 64,
                "download_url": "/download",
                "created_at": "2026-09-07T00:00:00Z",
                "warnings": [],
            }
        )

        with self.assertRaisesRegex(
            DemoPreflightError,
            "did not use the Source-to-Chart",
        ):
            run_preflight(
                "http://127.0.0.1:8000",
                "var/output",
                analysis_smoke=lambda *_args, **_kwargs: (source, upstream),
                presentation_smoke=lambda *_args, **_kwargs: (
                    presentation,
                    Path("other.pptx"),
                ),
            )


if __name__ == "__main__":
    unittest.main()
