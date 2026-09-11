"""Exercise the complete YouthLM demo path against a temporary live API."""

import argparse
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from apps.api.contract_models import AnalysisResult, PresentationResult
from spikes.analysis_api_smoke import (
    AnalysisApiSmokeError,
)
from spikes.analysis_api_smoke import (
    run_smoke as run_analysis_smoke,
)
from spikes.presentation_api_smoke import (
    PresentationApiSmokeError,
)
from spikes.presentation_api_smoke import (
    run_smoke as run_presentation_smoke,
)


class DemoPreflightError(RuntimeError):
    """Raised when the complete demo path is not ready."""


def run_preflight(
    base_url: str,
    output_directory: str | Path,
    *,
    timeout_seconds: int = 300,
    analysis_smoke: Callable[..., tuple[AnalysisResult, AnalysisResult]] | None = None,
    presentation_smoke: Callable[..., tuple[PresentationResult, Path]] | None = None,
) -> dict[str, Any]:
    """Run Analysis, stored context, and Presentation through live HTTP."""
    run_analysis = analysis_smoke or run_analysis_smoke
    run_presentation = presentation_smoke or run_presentation_smoke

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
    except (AnalysisApiSmokeError, PresentationApiSmokeError) as error:
        raise DemoPreflightError(str(error)) from error

    if source_result.module_id not in presentation_result.source_module_ids:
        raise DemoPreflightError(
            "Presentation did not use the Source-to-Chart analysis module"
        )

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
