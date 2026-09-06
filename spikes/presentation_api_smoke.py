"""Generate and download a real PPTX through the live YouthLM API."""

import argparse
import json
from collections.abc import Callable
from hashlib import sha256
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from apps.api.contract_models import PresentationResult

JsonObject = dict[str, Any]
JsonTransport = Callable[[str, JsonObject, int], JsonObject]
BinaryTransport = Callable[[str, int], bytes]


class PresentationApiSmokeError(RuntimeError):
    """Raised when the live presentation boundary is not demo-ready."""


def run_smoke(
    base_url: str,
    output_directory: str | Path,
    *,
    timeout_seconds: int = 60,
    post_json: JsonTransport | None = None,
    get_bytes: BinaryTransport | None = None,
) -> tuple[PresentationResult, Path]:
    """Create a deck from the canonical stored Analysis module and download it."""
    base = base_url.rstrip("/")
    payload = {
        "contract_version": "0.1.0",
        "project_id": "project_frontend_demo",
        "source_module_ids": ["analysis_population_chart"],
        "title": "板橋區青年人口趨勢",
        "audience": "新北市青年政策規劃人員",
        "language": "zh-TW",
        "template_id": "youthlm_default",
        "output_format": "pptx",
        "instructions": "使用清楚的政策簡報語氣，保留所有資料限制與來源。",
    }
    create = post_json or _post_json
    download = get_bytes or _get_bytes

    response = create(f"{base}/v1/presentations", payload, timeout_seconds)
    try:
        result = PresentationResult.model_validate(response)
    except ValueError as error:
        raise PresentationApiSmokeError(
            "API response is not a Contract v0 PresentationResult"
        ) from error

    if result.project_id != payload["project_id"]:
        raise PresentationApiSmokeError("Presentation response changed project_id")
    if result.source_module_ids != payload["source_module_ids"]:
        raise PresentationApiSmokeError("Presentation response changed source modules")

    content = download(f"{base}{result.download_url}", timeout_seconds)
    if len(content) != result.file_size_bytes:
        raise PresentationApiSmokeError("Downloaded PPTX size does not match result")
    if sha256(content).hexdigest() != result.artifact_sha256:
        raise PresentationApiSmokeError("Downloaded PPTX checksum does not match result")
    if not content.startswith(b"PK"):
        raise PresentationApiSmokeError("Downloaded artifact is not a PPTX package")

    output_path = Path(output_directory) / result.file_name
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(content)
    except OSError as error:
        raise PresentationApiSmokeError("Could not save downloaded PPTX") from error
    return result, output_path


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
        raise PresentationApiSmokeError(
            f"YouthLM API returned HTTP {error.code}: {body}"
        ) from error
    except URLError as error:
        raise PresentationApiSmokeError(
            f"Could not reach YouthLM API: {error.reason}"
        ) from error
    except TimeoutError as error:
        raise PresentationApiSmokeError(
            f"YouthLM API timed out after {timeout_seconds} seconds"
        ) from error
    except json.JSONDecodeError as error:
        raise PresentationApiSmokeError("YouthLM API returned invalid JSON") from error

    if not isinstance(parsed, dict):
        raise PresentationApiSmokeError("YouthLM API response must be a JSON object")
    return parsed


def _get_bytes(url: str, timeout_seconds: int) -> bytes:
    try:
        with urlopen(url, timeout=timeout_seconds) as response:
            return response.read()
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:2_000]
        raise PresentationApiSmokeError(
            f"YouthLM download returned HTTP {error.code}: {body}"
        ) from error
    except URLError as error:
        raise PresentationApiSmokeError(
            f"Could not download YouthLM presentation: {error.reason}"
        ) from error
    except TimeoutError as error:
        raise PresentationApiSmokeError(
            f"YouthLM download timed out after {timeout_seconds} seconds"
        ) from error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output-directory", default="var/smoke")
    parser.add_argument("--timeout-seconds", type=int, default=60)
    args = parser.parse_args()

    result, output_path = run_smoke(
        args.base_url,
        args.output_directory,
        timeout_seconds=args.timeout_seconds,
    )
    print(
        json.dumps(
            {
                "presentation_id": result.presentation_id,
                "source_module_ids": result.source_module_ids,
                "file_name": result.file_name,
                "file_size_bytes": result.file_size_bytes,
                "artifact_sha256": result.artifact_sha256,
                "saved_to": str(output_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    print("YouthLM Presentation Artifact HTTP smoke passed.")


if __name__ == "__main__":
    try:
        main()
    except PresentationApiSmokeError as error:
        raise SystemExit(f"YouthLM presentation smoke failed: {error}") from None
