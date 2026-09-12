"""Exercise the complete YouthLM demo path against a temporary live API."""

import argparse
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from apps.api.contract_models import (
    AnalysisResult,
    AssistantResult,
    PresentationResult,
    ReportResult,
)
from spikes.analysis_api_smoke import (
    AnalysisApiSmokeError,
)
from spikes.analysis_api_smoke import (
    run_smoke as run_analysis_smoke,
)
from spikes.assistant_api_smoke import AssistantApiSmokeError
from spikes.assistant_api_smoke import run_smoke as run_assistant_smoke
from spikes.presentation_api_smoke import (
    PresentationApiSmokeError,
)
from spikes.presentation_api_smoke import (
    run_smoke as run_presentation_smoke,
)
from spikes.report_api_smoke import ReportApiSmokeError
from spikes.report_api_smoke import run_smoke as run_report_smoke


class DemoPreflightError(RuntimeError):
    """Raised when the complete demo path is not ready."""


def run_preflight(
    base_url: str,
    output_directory: str | Path,
    *,
    timeout_seconds: int = 300,
    analysis_smoke: Callable[..., tuple[AnalysisResult, AnalysisResult]] | None = None,
    presentation_smoke: Callable[..., tuple[PresentationResult, Path]] | None = None,
    report_smoke: Callable[..., tuple[ReportResult, Path]] | None = None,
    assistant_smoke: Callable[..., AssistantResult] | None = None,
) -> dict[str, Any]:
    """Run Analysis, artifacts, and explicit-context Assistant through live HTTP."""
    run_analysis = analysis_smoke or run_analysis_smoke
    run_presentation = presentation_smoke or run_presentation_smoke
    run_report = report_smoke or run_report_smoke
    run_assistant = assistant_smoke or run_assistant_smoke

    try:
        source_result, upstream_result = run_analysis(
            base_url,
            timeout_seconds=timeout_seconds,
        )
        presentation_result, output_path = run_presentation(
            base_url,
            output_directory,
            timeout_seconds=timeout_seconds,
        )
        if source_result.module_id not in presentation_result.source_module_ids:
            raise DemoPreflightError(
                "Presentation did not use the Source-to-Chart analysis module"
            )
        report_result, report_output_path = run_report(
            base_url,
            output_directory,
            timeout_seconds=timeout_seconds,
        )
        assistant_result = run_assistant(
            base_url,
            project_id=source_result.project_id,
            analysis_id=source_result.module_id,
            presentation_id=presentation_result.presentation_id,
            timeout_seconds=timeout_seconds,
        )
    except (
        AnalysisApiSmokeError,
        AssistantApiSmokeError,
        PresentationApiSmokeError,
        ReportApiSmokeError,
    ) as error:
        raise DemoPreflightError(str(error)) from error

    if source_result.module_id not in report_result.source_module_ids:
        raise DemoPreflightError("Report did not use the Source-to-Chart analysis module")

    return {
        "source_chart": {
            "module_id": source_result.module_id,
            "status": source_result.status,
            "record_count": len(source_result.result_data.records),
        },
        "upstream_context": {
            "module_id": upstream_result.module_id,
            "status": upstream_result.status,
            "upstream_module_ids": upstream_result.upstream_module_ids,
        },
        "presentation": {
            "presentation_id": presentation_result.presentation_id,
            "status": presentation_result.status,
            "source_module_ids": presentation_result.source_module_ids,
            "file_size_bytes": presentation_result.file_size_bytes,
            "artifact_sha256": presentation_result.artifact_sha256,
            "saved_to": str(output_path),
        },
        "report": {
            "report_id": report_result.report_id,
            "status": report_result.status,
            "source_module_ids": report_result.source_module_ids,
            "file_size_bytes": report_result.file_size_bytes,
            "artifact_sha256": report_result.artifact_sha256,
            "saved_to": str(report_output_path),
        },
        "assistant": {
            "status": assistant_result.status,
            "model_steps": assistant_result.model_steps,
            "resolved_reference_count": len(assistant_result.resolved_references),
            "tool_execution_count": len(assistant_result.tool_executions),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output-directory", default="var/demo-preflight/output")
    parser.add_argument("--timeout-seconds", type=int, default=300)
    parser.add_argument(
        "--status-only",
        action="store_true",
        help="Hide IDs, hashes, and local paths from standard output.",
    )
    args = parser.parse_args()

    result = run_preflight(
        args.base_url,
        args.output_directory,
        timeout_seconds=args.timeout_seconds,
    )
    if not args.status_only:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    print("YouthLM end-to-end demo preflight passed.")


if __name__ == "__main__":
    try:
        main()
    except DemoPreflightError as error:
        raise SystemExit(f"YouthLM demo preflight failed: {error}") from None
