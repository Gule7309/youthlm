"""Exercise the live explicit-context Assistant HTTP boundary."""

import json
from collections.abc import Callable
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from apps.api.contract_models import AssistantResult

JsonObject = dict[str, Any]
JsonTransport = Callable[[str, JsonObject, int], JsonObject]


class AssistantApiSmokeError(RuntimeError):
    """Raised when the live Assistant boundary is not demo-ready."""


def run_smoke(
    base_url: str,
    *,
    project_id: str,
    analysis_id: str,
    presentation_id: str,
    timeout_seconds: int = 90,
    transport: JsonTransport | None = None,
) -> AssistantResult:
    """Ask the real model using Source, Analysis, and Presentation evidence."""
    payload = {
        "contract_version": "0.1.0",
        "project_id": project_id,
        "assistant_id": "assistant_demo_preflight",
        "message": (
            "根據已選來源、分析與簡報，列出決策者必須知道的資料範圍與限制。"
        ),
        "context_references": [
            {
                "kind": "source",
                "reference_id": "ntpc_population_by_age_sex_district",
                "filters": {
                    "geographies": ["板橋區"],
                    "age_groups": ["20-24"],
                    "sexes": ["all"],
                    "start_year": 2022,
                    "end_year": 2024,
                },
            },
            {"kind": "analysis", "reference_id": analysis_id},
            {"kind": "presentation", "reference_id": presentation_id},
        ],
    }
    post_json = transport or _post_json
    response = post_json(
        f"{base_url.rstrip('/')}/v1/assistant",
        payload,
        timeout_seconds,
    )
    try:
        result = AssistantResult.model_validate(response)
    except ValueError as error:
        raise AssistantApiSmokeError(
            "API response is not a Contract v0 AssistantResult"
        ) from error

    if result.project_id != project_id or result.assistant_id != payload["assistant_id"]:
        raise AssistantApiSmokeError("Assistant response changed request identity")
    expected_references = {
        (reference["kind"], reference["reference_id"])
        for reference in payload["context_references"]
    }
    actual_references = {
        (reference.kind, reference.reference_id)
        for reference in result.resolved_references
    }
    if actual_references != expected_references:
        raise AssistantApiSmokeError(
            "Assistant did not resolve the exact selected context"
        )
    return result


def _post_json(url: str, payload: JsonObject, timeout_seconds: int) -> JsonObject:
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
        raise AssistantApiSmokeError(
            f"YouthLM API returned HTTP {error.code}: {body}"
        ) from error
    except URLError as error:
        raise AssistantApiSmokeError(
            f"Could not reach YouthLM API: {error.reason}"
        ) from error
    except TimeoutError as error:
        raise AssistantApiSmokeError(
            f"YouthLM API timed out after {timeout_seconds} seconds"
        ) from error
    except json.JSONDecodeError as error:
        raise AssistantApiSmokeError("YouthLM API returned invalid JSON") from error

    if not isinstance(parsed, dict):
        raise AssistantApiSmokeError("YouthLM API response must be a JSON object")
    return parsed
