"""Deterministic queries over versioned YouthLM public-data snapshots."""

import csv
import hashlib
import json
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

DATASET_ID = "ntpc_unemployment_by_age_sex"
DATA_ROOT = Path(__file__).resolve().parent.parent / "data"
DATA_PATH = DATA_ROOT / f"{DATASET_ID}.csv"
METADATA_PATH = DATA_ROOT / f"{DATASET_ID}.metadata.json"
EXPECTED_COLUMNS = [
    "year",
    "age_group",
    "sex",
    "unemployment_rate_percent",
]


class YouthDatasetQueryError(ValueError):
    """Raised when a deterministic youth-data query cannot be executed."""


def get_youth_dataset_metadata() -> dict[str, Any]:
    """Return an isolated copy of the installed shared-dataset metadata."""
    metadata, _ = _load_dataset()
    return deepcopy(metadata)


def query_youth_dataset(arguments: dict[str, Any]) -> dict[str, Any]:
    """Filter one versioned dataset without asking the model to calculate data."""
    dataset_id = arguments.get("dataset_id")
    if dataset_id != DATASET_ID:
        raise YouthDatasetQueryError(
            f"Unsupported dataset_id: {dataset_id!r}. Use {DATASET_ID!r}."
        )

    metadata, rows = _load_dataset()
    age_groups = _required_choices(
        arguments,
        "age_groups",
        set(metadata["available_age_groups"]),
    )
    sexes = _required_choices(
        arguments,
        "sexes",
        set(metadata["available_sexes"]),
    )
    start_year = _required_year(arguments, "start_year")
    end_year = _required_year(arguments, "end_year")

    if start_year > end_year:
        raise YouthDatasetQueryError("start_year must not be after end_year")

    available_start = metadata["available_years"]["start"]
    available_end = metadata["available_years"]["end"]
    if start_year < available_start or end_year > available_end:
        raise YouthDatasetQueryError(
            "Requested years are outside the available range "
            f"{available_start}-{available_end}"
        )

    selected_rows = [
        row
        for row in rows
        if start_year <= row["year"] <= end_year
        and row["age_group"] in age_groups
        and row["sex"] in sexes
    ]

    return {
        "dataset": {
            "dataset_id": metadata["dataset_id"],
            "title": metadata["title"],
            "indicator": metadata["indicator"],
            "agency": metadata["agency"],
            "geography": metadata["geography"],
            "unit": metadata["unit"],
            "update_frequency": metadata["update_frequency"],
            "available_years": metadata["available_years"],
        },
        "query": {
            "age_groups": age_groups,
            "sexes": sexes,
            "start_year": start_year,
            "end_year": end_year,
        },
        "rows": selected_rows,
        "row_count": len(selected_rows),
        "youth_definition_compatibility": metadata[
            "youth_definition_compatibility"
        ],
        "warnings": metadata["warnings"],
        "provenance": {
            "source_dataset_page": metadata["source_dataset_page"],
            "source_download_url": metadata["source_download_url"],
            "source_catalog_metadata_updated_at": metadata[
                "source_catalog_metadata_updated_at"
            ],
            "snapshot_retrieved_at": metadata["snapshot_retrieved_at"],
            "source_sha256": metadata["source_sha256"],
            "license": metadata["license"],
        },
    }


@lru_cache(maxsize=1)
def _load_dataset() -> tuple[dict[str, Any], tuple[dict[str, Any], ...]]:
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    snapshot_bytes = DATA_PATH.read_bytes()
    actual_hash = hashlib.sha256(snapshot_bytes).hexdigest()
    expected_hash = metadata["snapshot_sha256"]
    if not _matches_snapshot_hash(snapshot_bytes, expected_hash):
        raise RuntimeError(
            "Unemployment installed snapshot hash mismatch: "
            f"expected {expected_hash}, got {actual_hash}"
        )

    with DATA_PATH.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != EXPECTED_COLUMNS:
            raise RuntimeError(
                "Unexpected unemployment snapshot columns: "
                f"expected {EXPECTED_COLUMNS}, got {reader.fieldnames}"
            )
        rows = tuple(
            {
                "year": int(row["year"]),
                "age_group": row["age_group"],
                "sex": row["sex"],
                "unemployment_rate_percent": float(
                    row["unemployment_rate_percent"]
                ),
            }
            for row in reader
        )

    expected_count = metadata["snapshot_row_count"]
    if len(rows) != expected_count:
        raise RuntimeError(
            f"Dataset row count mismatch: expected {expected_count}, got {len(rows)}"
        )
    return metadata, rows


def _matches_snapshot_hash(snapshot_bytes: bytes, expected_hash: str) -> bool:
    """Accept the installed bytes or Git's Windows CRLF checkout equivalent."""
    actual_hash = hashlib.sha256(snapshot_bytes).hexdigest()
    if actual_hash == expected_hash:
        return True

    lf_normalized_bytes = snapshot_bytes.replace(b"\r\n", b"\n")
    normalized_hash = hashlib.sha256(lf_normalized_bytes).hexdigest()
    return normalized_hash == expected_hash


def _required_choices(
    arguments: dict[str, Any],
    name: str,
    allowed: set[str],
) -> list[str]:
    value = arguments.get(name)
    if not isinstance(value, list) or not value:
        raise YouthDatasetQueryError(f"{name} must be a non-empty list")
    if not all(isinstance(item, str) for item in value):
        raise YouthDatasetQueryError(f"{name} must contain only strings")

    unsupported = sorted(set(value) - allowed)
    if unsupported:
        raise YouthDatasetQueryError(
            f"Unsupported {name}: {unsupported}. Available: {sorted(allowed)}"
        )
    return list(dict.fromkeys(value))


def _required_year(arguments: dict[str, Any], name: str) -> int:
    value = arguments.get(name)
    if isinstance(value, bool) or not isinstance(value, int):
        raise YouthDatasetQueryError(f"{name} must be an integer")
    return value
