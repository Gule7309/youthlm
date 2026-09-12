"""Generate and download a real DOCX through the live YouthLM API."""

import argparse
import json
from collections.abc import Callable
from hashlib import sha256
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from apps.api.contract_models import ReportResult

JsonObject = dict[str, Any]
JsonTransport = Callable[[str, JsonObject, int], JsonObject]
BinaryTransport = Callable[[str, int], bytes]


class ReportApiSmokeError(RuntimeError):
    """Raised when the live report boundary is not demo-ready."""


def run_smoke(
    base_url: str,
    output_directory: str | Path,
    *,
    timeout_seconds: int = 60,
    post_json: JsonTransport | None = None,
    get_bytes: BinaryTransport | None = None,
) -> tuple[ReportResult, Path]:
    """Create a report from the canonical stored Analysis module and download it."""
    base = base_url.rstrip("/")
    payload = {
        "contract_version": "0.1.0",
        "project_id": "project_frontend_demo",
        "source_module_ids": ["analysis_population_chart"],
        "title": "板橋區青年人口議題研析報告",
        "audience": "新北市青年政策規劃人員",
        "language": "zh-TW",
        "template_id": "youthlm_default",
        "output_format": "docx",
        "instructions": "以政策研析格式整理，保留資料限制、來源與版本。",
    }
    create = post_json or _post_json
    download = get_bytes or _get_bytes

    response = create(f"{base}/v1/reports", payload, timeout_seconds)
    try:
        result = ReportResult.model_validate(response)
    except ValueError as error:
        raise ReportApiSmokeError(
            "API response is not a Contract v0 ReportResult"
        ) from error

    if result.project_id != payload["project_id"]:
        raise ReportApiSmokeError("Report response changed project_id")
    if result.source_module_ids != payload["source_module_ids"]:
        raise ReportApiSmokeError("Report response changed source modules")

    content = download(f"{base}{result.download_url}", timeout_seconds)
    if len(content) != result.file_size_bytes:
        raise ReportApiSmokeError("Downloaded DOCX size does not match result")
    if sha256(content).hexdigest() != result.artifact_sha256:
        raise ReportApiSmokeError("Downloaded DOCX checksum does not match result")
    if not content.startswith(b"PK"):
        raise ReportApiSmokeError("Downloaded artifact is not a DOCX package")

    output_path = Path(output_directory) / result.file_name
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(content)
    except OSError as error:
        raise ReportApiSmokeError("Could not save downloaded DOCX") from error
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
        raise ReportApiSmokeError(
            f"YouthLM API returned HTTP {error.code}: {body}"
        ) from error
    except URLError as error:
        raise ReportApiSmokeError(
            f"Could not reach YouthLM API: {error.reason}"
        ) from error
    except TimeoutError as error:
        raise ReportApiSmokeError(
            f"YouthLM API timed out after {timeout_seconds} seconds"
        ) from error
    except json.JSONDecodeError as error:
        raise ReportApiSmokeError("YouthLM API returned invalid JSON") from error

    if not isinstance(parsed, dict):
        raise ReportApiSmokeError("YouthLM API response must be a JSON object")
    return parsed


def _get_bytes(url: str, timeout_seconds: int) -> bytes:
    try:
        with urlopen(url, timeout=timeout_seconds) as response:
            return response.read()
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")[:2_000]
        raise ReportApiSmokeError(
            f"YouthLM download returned HTTP {error.code}: {body}"
        ) from error
    except URLError as error:
        raise ReportApiSmokeError(
            f"Could not download YouthLM report: {error.reason}"
        ) from error
    except TimeoutError as error:
        raise ReportApiSmokeError(
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
                "report_id": result.report_id,
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
    print("YouthLM Report Artifact HTTP smoke passed.")


if __name__ == "__main__":
    try:
        main()
    except ReportApiSmokeError as error:
        raise SystemExit(f"YouthLM report smoke failed: {error}") from None
