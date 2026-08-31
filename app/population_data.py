"""Deterministic queries over the versioned New Taipei population snapshot."""

import csv
import hashlib
import json
import re
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

DATASET_ID = "ntpc_population_by_age_sex_district"
DATA_ROOT = Path(__file__).resolve().parent.parent / "data"
DATA_PATH = DATA_ROOT / f"{DATASET_ID}.csv"
METADATA_PATH = DATA_ROOT / f"{DATASET_ID}.metadata.json"
MAX_QUERY_ROWS = 500

AGE_FIELD_BY_GROUP = {
    "0-4": "percent3",
    "5-9": "percent4",
    "10-14": "percent5",
    "15-19": "percent6",
    "20-24": "percent7",
    "25-29": "percent8",
    "30-34": "percent9",
    "35-39": "percent10",
    "40-44": "percent11",
    "45-49": "percent12",
    "50-54": "percent13",
    "55-59": "percent14",
    "60-64": "percent15",
    "65-69": "percent16",
    "70-74": "percent17",
    "75-79": "percent18",
    "80-84": "percent19",
    "85-89": "percent20",
    "90-94": "percent21",
    "95-99": "percent22",
    "100+": "percent23",
}
SEX_LABELS = {"計": "all", "男": "male", "女": "female"}
ROW_LABEL_PATTERN = re.compile(
    r"^(?P<year>\d{4})年 (?P<geography>.+?)0 (?P<sex>計|男|女)$"
)


class PopulationDatasetQueryError(ValueError):
    """Raised when a deterministic population query cannot be executed."""


def get_population_dataset_metadata() -> dict[str, Any]:
    """Return an isolated copy of the installed population metadata."""
    metadata, _ = _load_dataset()
    return deepcopy(metadata)


def query_population_dataset(arguments: dict[str, Any]) -> dict[str, Any]:
    """Filter official population counts into normalized long-form rows."""
    dataset_id = arguments.get("dataset_id")
    if dataset_id != DATASET_ID:
        raise PopulationDatasetQueryError(
            f"Unsupported dataset_id: {dataset_id!r}. Use {DATASET_ID!r}."
        )

    metadata, source_rows = _load_dataset()
    geographies = _required_choices(
        arguments,
        "geographies",
        set(metadata["available_geographies"]),
    )
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
        raise PopulationDatasetQueryError("start_year must not be after end_year")

    available_start = metadata["available_years"]["start"]
    available_end = metadata["available_years"]["end"]
    if start_year < available_start or end_year > available_end:
        raise PopulationDatasetQueryError(
            "Requested years are outside the available range "
            f"{available_start}-{available_end}"
        )

    estimated_rows = (
        (end_year - start_year + 1)
        * len(geographies)
        * len(age_groups)
        * len(sexes)
    )
    if estimated_rows > MAX_QUERY_ROWS:
        raise PopulationDatasetQueryError(
            f"Query would return {estimated_rows} rows; narrow it to at most "
            f"{MAX_QUERY_ROWS} rows"
        )

    selected_rows: list[dict[str, Any]] = []
    for source_row in source_rows:
        if not (
            start_year <= source_row["year"] <= end_year
            and source_row["geography"] in geographies
            and source_row["sex"] in sexes
        ):
            continue
        for age_group in age_groups:
            selected_rows.append(
                {
                    "year": source_row["year"],
                    "geography": source_row["geography"],
                    "age_group": age_group,
                    "sex": source_row["sex"],
                    "population_count": source_row["age_counts"][age_group],
                }
            )

    return {
        "dataset": {
            "dataset_id": metadata["dataset_id"],
            "title": metadata["title"],
            "indicator": metadata["indicator"],
            "agency": metadata["agency"],
            "geography": metadata["geography"],
            "geography_level": metadata["geography_level"],
            "unit": metadata["unit"],
            "update_frequency": metadata["update_frequency"],
            "available_years": metadata["available_years"],
        },
        "query": {
            "geographies": geographies,
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
            "snapshot_retrieved_at": metadata["snapshot_retrieved_at"],
            "source_sha256": metadata["source_sha256"],
            "license": metadata["license"],
        },
    }


@lru_cache(maxsize=1)
def _load_dataset() -> tuple[dict[str, Any], tuple[dict[str, Any], ...]]:
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    actual_hash = hashlib.sha256(DATA_PATH.read_bytes()).hexdigest()
    expected_hash = metadata["source_sha256"]
    if actual_hash != expected_hash:
        raise RuntimeError(
            "Population snapshot hash mismatch: "
            f"expected {expected_hash}, got {actual_hash}"
        )

    rows: list[dict[str, Any]] = []
    with DATA_PATH.open(encoding="utf-8-sig", newline="") as stream:
        for raw_row in csv.DictReader(stream):
            label_match = ROW_LABEL_PATTERN.fullmatch(raw_row["field1"])
            if label_match is None:
                raise RuntimeError(
                    f"Unexpected population row label: {raw_row['field1']!r}"
                )
            rows.append(
                {
                    "year": int(label_match["year"]),
                    "geography": label_match["geography"],
                    "sex": SEX_LABELS[label_match["sex"]],
                    "age_counts": {
                        age_group: int(raw_row[field])
                        for age_group, field in AGE_FIELD_BY_GROUP.items()
                    },
                }
            )

    expected_count = metadata["snapshot_row_count"]
    if len(rows) != expected_count:
        raise RuntimeError(
            f"Dataset row count mismatch: expected {expected_count}, got {len(rows)}"
        )
    return metadata, tuple(rows)


def _required_choices(
    arguments: dict[str, Any],
    name: str,
    allowed: set[str],
) -> list[str]:
    value = arguments.get(name)
    if not isinstance(value, list) or not value:
        raise PopulationDatasetQueryError(f"{name} must be a non-empty list")
    if not all(isinstance(item, str) for item in value):
        raise PopulationDatasetQueryError(f"{name} must contain only strings")

    unsupported = sorted(set(value) - allowed)
    if unsupported:
        raise PopulationDatasetQueryError(
            f"Unsupported {name}: {unsupported}. Available: {sorted(allowed)}"
        )
    return list(dict.fromkeys(value))


def _required_year(arguments: dict[str, Any], name: str) -> int:
    value = arguments.get(name)
    if isinstance(value, bool) or not isinstance(value, int):
        raise PopulationDatasetQueryError(f"{name} must be an integer")
    return value
