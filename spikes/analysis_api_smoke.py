"""Exercise the live Contract v0 API with source and module context requests."""

import argparse
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from apps.api.contract_models import AnalysisResult

REPOSITORY_ROOT = Path(__file__).parents[1]
SOURCE_CHART_REQUEST = (
    REPOSITORY_ROOT
    / "contracts/fixtures/frontend-integration/analysis-request.example.json"
)

JsonObject = dict[str, Any]
JsonTransport = Callable[[str, JsonObject, int], JsonObject]


class AnalysisApiSmokeError(RuntimeError):
    """Raised when the live API does not satisfy the frozen contract."""


def run_smoke(
    base_url: str,
    *,
    timeout_seconds: int = 300,
    transport: JsonTransport | None = None,
) -> tuple[AnalysisResult, AnalysisResult]:
    """Run Source-to-Chart, then prove its stored context is resolvable."""
    post_json = transport or _post_json
    endpoint = f"{base_url.rstrip('/')}/v1/analysis"
    source_request = json.loads(SOURCE_CHART_REQUEST.read_text(encoding="utf-8"))

    source_result = _validate_source_chart(
        post_json(endpoint, source_request, timeout_seconds),
        source_request,
    )

    upstream_request = {
        "contract_version": "0.1.0",
        "project_id": source_result.project_id,
        "module_id": "analysis_population_followup",
        "query": (
            "根據上游分析結果，說明板橋區2022至2024年20至24歲人口趨勢；"
            "不要重新查詢資料。"
        ),
        "upstream_module_ids": [source_result.module_id],
        "source_selections": [],
    }
    upstream_result = _validate_upstream_result(
        post_json(endpoint, upstream_request, timeout_seconds),
        upstream_request,
    )
    return source_result, upstream_result


def _validate_source_chart(
    payload: JsonObject,
    request_payload: JsonObject,
) -> AnalysisResult:
    result = _parse_result(payload)
    if result.project_id != request_payload["project_id"]:
        raise AnalysisApiSmokeError("Source-to-Chart response changed project_id")
    if result.module_id != request_payload["module_id"]:
        raise AnalysisApiSmokeError("Source-to-Chart response changed module_id")
    if result.visualization is None:
        warnings = "; ".join(
            f"{warning.type}: {warning.message}"
            for warning in result.warnings
        ) or "none"
        raise AnalysisApiSmokeError(
            "Source-to-Chart response has no visualization "
            f"(status={result.status}; warnings={warnings})"
        )
    if not result.result_data.records:
        raise AnalysisApiSmokeError("Source-to-Chart response has no data records")

    selected_source_ids = {
        selection["source_id"]
        for selection in request_payload["source_selections"]
    }
    result_source_ids = {source.source_id for source in result.sources}
    if result_source_ids != selected_source_ids:
        raise AnalysisApiSmokeError(
            "Source-to-Chart response did not preserve selected sources"
        )
    if not result.dataset_versions or not result.provenance:
        raise AnalysisApiSmokeError(
            "Source-to-Chart response has incomplete provenance"
        )
    return result


def _validate_upstream_result(
    payload: JsonObject,
    request_payload: JsonObject,
) -> AnalysisResult:
    result = _parse_result(payload)
    if result.project_id != request_payload["project_id"]:
        raise AnalysisApiSmokeError("Upstream response changed project_id")
    if result.module_id != request_payload["module_id"]:
        raise AnalysisApiSmokeError("Upstream response changed module_id")
    if result.upstream_module_ids != request_payload["upstream_module_ids"]:
        raise AnalysisApiSmokeError("Upstream response lost its module dependency")
    return result


def _parse_result(payload: JsonObject) -> AnalysisResult:
    try:
        return AnalysisResult.model_validate(payload)
    except ValueError as error:
        raise AnalysisApiSmokeError(
            "API response is not a Contract v0 AnalysisResult"
        ) from error


def _post_json(
    url: str,
    payload: JsonObject,
    timeout_seconds: int,
) -> JsonObject:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:2_000]
        raise AnalysisApiSmokeError(
            f"YouthLM API returned HTTP {error.code}: {body}"
        ) from error
    except URLError as error:
        raise AnalysisApiSmokeError(
            f"Could not reach YouthLM API: {error.reason}"
        ) from error
    except TimeoutError as error:
        raise AnalysisApiSmokeError(
            f"YouthLM API timed out after {timeout_seconds} seconds"
        ) from error
    except json.JSONDecodeError as error:
        raise AnalysisApiSmokeError("YouthLM API returned invalid JSON") from error

    if not isinstance(parsed, dict):
        raise AnalysisApiSmokeError("YouthLM API response must be a JSON object")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--timeout-seconds", type=int, default=300)
    args = parser.parse_args()

    source_result, upstream_result = run_smoke(
        args.base_url,
        timeout_seconds=args.timeout_seconds,
    )
    print(
        json.dumps(
            {
                "source_chart": {
                    "module_id": source_result.module_id,
                    "status": source_result.status,
                    "record_count": len(source_result.result_data.records),
                    "source_ids": [source.source_id for source in source_result.sources],
                },
                "upstream_context": {
                    "module_id": upstream_result.module_id,
                    "status": upstream_result.status,
                    "upstream_module_ids": upstream_result.upstream_module_ids,
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    print("YouthLM Contract v0 HTTP smoke passed.")


if __name__ == "__main__":
    try:
        main()
    except AnalysisApiSmokeError as error:
        raise SystemExit(f"YouthLM HTTP smoke failed: {error}") from None
