"""Repeatable quality audit for the installed YouthLM data snapshots.

The audit never rewrites source values.  Confirmed defects in an official
snapshot are reported as known warnings; new integrity or coverage problems
fail the command so they cannot silently reach an analysis.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from itertools import product
from pathlib import Path
from typing import Any, Literal

from app.population_data import (
    AGE_FIELD_BY_GROUP,
    KNOWN_UNRELIABLE_2013_AGE_5_9_DISTRICTS,
    ROW_LABEL_PATTERN,
    SEX_LABELS,
)
from app.population_data import (
    DATA_PATH as POPULATION_DATA_PATH,
)
from app.population_data import (
    DATASET_ID as POPULATION_DATASET_ID,
)
from app.population_data import (
    METADATA_PATH as POPULATION_METADATA_PATH,
)
from app.youth_data import (
    DATA_PATH as UNEMPLOYMENT_DATA_PATH,
)
from app.youth_data import (
    DATASET_ID as UNEMPLOYMENT_DATASET_ID,
)
from app.youth_data import (
    METADATA_PATH as UNEMPLOYMENT_METADATA_PATH,
)

Severity = Literal["warning", "error"]

POPULATION_COLUMNS = (
    "field1",
    *(f"percent{index}" for index in range(2, 34)),
)
POPULATION_COUNT_FIELDS = (
    "percent2",
    *AGE_FIELD_BY_GROUP.values(),
    "percent24",
    "percent26",
    "percent28",
)
POPULATION_NUMERIC_FIELDS = tuple(f"percent{index}" for index in range(2, 34))
POPULATION_DERIVED_GROUP_FIELDS = {
    "percent24": tuple(f"percent{index}" for index in range(3, 6)),
    "percent26": tuple(f"percent{index}" for index in range(6, 16)),
    "percent28": tuple(f"percent{index}" for index in range(16, 24)),
}
UNEMPLOYMENT_COLUMNS = (
    "year",
    "age_group",
    "sex",
    "unemployment_rate_percent",
)
KNOWN_POPULATION_AGE_TOTAL_MISMATCHES = frozenset(
    product(
        (2013,),
        KNOWN_UNRELIABLE_2013_AGE_5_9_DISTRICTS,
        ("all", "male", "female"),
    )
)


def audit_installed_datasets() -> dict[str, Any]:
    """Audit every versioned CSV shipped with the application."""
    datasets = [audit_population_dataset(), audit_unemployment_dataset()]
    error_count = sum(
        issue["severity"] == "error"
        for dataset in datasets
        for issue in dataset["issues"]
    )
    warning_count = sum(
        issue["severity"] == "warning"
        for dataset in datasets
        for issue in dataset["issues"]
    )
    return {
        "status": _status(error_count, warning_count),
        "summary": {
            "dataset_count": len(datasets),
            "error_count": error_count,
            "warning_count": warning_count,
        },
        "datasets": datasets,
    }


def audit_population_dataset(
    *,
    data_path: Path = POPULATION_DATA_PATH,
    metadata_path: Path = POPULATION_METADATA_PATH,
) -> dict[str, Any]:
    """Validate the population snapshot without correcting official values."""
    issues: list[dict[str, Any]] = []
    metadata = _read_metadata(metadata_path, POPULATION_DATASET_ID, issues)
    header, raw_rows = _read_csv(data_path, POPULATION_DATASET_ID, issues)
    if metadata is None or header is None:
        return _dataset_result(POPULATION_DATASET_ID, len(raw_rows), issues)

    _check_snapshot_hash(data_path, metadata, issues)
    if tuple(header) != POPULATION_COLUMNS:
        issues.append(
            _issue(
                "unexpected_schema",
                "error",
                "Population CSV columns do not match the installed parser contract.",
                expected=list(POPULATION_COLUMNS),
                actual=header,
            )
        )
        return _dataset_result(POPULATION_DATASET_ID, len(raw_rows), issues)

    parsed_rows: list[dict[str, Any]] = []
    invalid_rows: list[int] = []
    for line_number, raw_row in enumerate(raw_rows, start=2):
        label = raw_row.get("field1")
        match = ROW_LABEL_PATTERN.fullmatch(label) if isinstance(label, str) else None
        counts = _parse_population_counts(raw_row)
        numeric_values_ok = _population_numeric_values_are_valid(raw_row)
        if match is None or counts is None or not numeric_values_ok:
            invalid_rows.append(line_number)
            continue
        parsed_rows.append(
            {
                "year": int(match["year"]),
                "geography": match["geography"],
                "sex": SEX_LABELS[match["sex"]],
                "counts": counts,
            }
        )

    if invalid_rows:
        issues.append(
            _issue(
                "invalid_rows",
                "error",
                "Population CSV contains an invalid label, count, or numeric value.",
                line_numbers=invalid_rows[:20],
                affected_row_count=len(invalid_rows),
            )
        )

    _check_expected_row_count(metadata, raw_rows, issues)
    keys = [
        (row["year"], row["geography"], row["sex"])
        for row in parsed_rows
    ]
    _check_duplicate_keys(keys, issues)
    _check_population_coverage(metadata, keys, issues)
    _check_population_totals(parsed_rows, issues)
    _check_population_derived_groups(parsed_rows, issues)
    _check_population_sex_reconciliation(parsed_rows, issues)
    _check_population_city_reconciliation(metadata, parsed_rows, issues)
    return _dataset_result(POPULATION_DATASET_ID, len(raw_rows), issues)


def audit_unemployment_dataset(
    *,
    data_path: Path = UNEMPLOYMENT_DATA_PATH,
    metadata_path: Path = UNEMPLOYMENT_METADATA_PATH,
) -> dict[str, Any]:
    """Validate normalized unemployment rows, dimensions, and rates."""
    issues: list[dict[str, Any]] = []
    metadata = _read_metadata(metadata_path, UNEMPLOYMENT_DATASET_ID, issues)
    header, raw_rows = _read_csv(data_path, UNEMPLOYMENT_DATASET_ID, issues)
    if metadata is None or header is None:
        return _dataset_result(UNEMPLOYMENT_DATASET_ID, len(raw_rows), issues)

    _check_snapshot_hash(data_path, metadata, issues)
    if tuple(header) != UNEMPLOYMENT_COLUMNS:
        issues.append(
            _issue(
                "unexpected_schema",
                "error",
                "Unemployment CSV columns do not match the installed parser contract.",
                expected=list(UNEMPLOYMENT_COLUMNS),
                actual=header,
            )
        )
        return _dataset_result(UNEMPLOYMENT_DATASET_ID, len(raw_rows), issues)

    parsed_rows: list[dict[str, Any]] = []
    invalid_rows: list[int] = []
    for line_number, raw_row in enumerate(raw_rows, start=2):
        try:
            year = int(raw_row["year"])
            rate = Decimal(raw_row["unemployment_rate_percent"])
        except (TypeError, ValueError, InvalidOperation):
            invalid_rows.append(line_number)
            continue
        age_group = raw_row.get("age_group")
        sex = raw_row.get("sex")
        if (
            not rate.is_finite()
            or rate < 0
            or rate > 100
            or not isinstance(age_group, str)
            or not age_group.strip()
            or not isinstance(sex, str)
            or not sex.strip()
        ):
            invalid_rows.append(line_number)
            continue
        parsed_rows.append(
            {
                "year": year,
                "age_group": age_group,
                "sex": sex,
            }
        )

    if invalid_rows:
        issues.append(
            _issue(
                "invalid_rows",
                "error",
                "Unemployment CSV contains an invalid year or a rate outside 0–100%.",
                line_numbers=invalid_rows[:20],
                affected_row_count=len(invalid_rows),
            )
        )

    _check_expected_row_count(metadata, raw_rows, issues)
    keys = [
        (row["year"], row["age_group"], row["sex"])
        for row in parsed_rows
    ]
    _check_duplicate_keys(keys, issues)
    _check_unemployment_coverage(metadata, keys, issues)
    return _dataset_result(UNEMPLOYMENT_DATASET_ID, len(raw_rows), issues)


def _read_metadata(
    path: Path,
    dataset_id: str,
    issues: list[dict[str, Any]],
) -> dict[str, Any] | None:
    try:
        metadata = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        issues.append(
            _issue(
                "metadata_unreadable",
                "error",
                f"Could not read metadata for {dataset_id}: {error}",
            )
        )
        return None
    if metadata.get("dataset_id") != dataset_id:
        issues.append(
            _issue(
                "metadata_dataset_id_mismatch",
                "error",
                f"Metadata dataset_id does not match {dataset_id}.",
            )
        )
    return metadata


def _read_csv(
    path: Path,
    dataset_id: str,
    issues: list[dict[str, Any]],
) -> tuple[list[str] | None, list[dict[str, str]]]:
    try:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            rows = list(reader)
            header = reader.fieldnames
            malformed_lines = [
                line_number
                for line_number, row in enumerate(rows, start=2)
                if header is None
                or set(row) != set(header)
                or any(
                    value is None or not isinstance(value, str) or not value.strip()
                    for value in row.values()
                )
            ]
            if malformed_lines:
                issues.append(
                    _issue(
                        "malformed_csv_rows",
                        "error",
                        "CSV contains blank, missing, or extra cells.",
                        line_numbers=malformed_lines[:20],
                        affected_row_count=len(malformed_lines),
                    )
                )
            return header, rows
    except (OSError, UnicodeError, csv.Error) as error:
        issues.append(
            _issue(
                "csv_unreadable",
                "error",
                f"Could not read CSV for {dataset_id}: {error}",
            )
        )
        return None, []


def _check_snapshot_hash(
    data_path: Path,
    metadata: dict[str, Any],
    issues: list[dict[str, Any]],
) -> None:
    expected = metadata.get("snapshot_sha256")
    if not isinstance(expected, str) or len(expected) != 64:
        issues.append(
            _issue(
                "snapshot_hash_missing",
                "error",
                "Metadata must contain the SHA-256 of the installed CSV snapshot.",
            )
        )
        return
    snapshot_bytes = data_path.read_bytes()
    if not _matches_snapshot_hash(snapshot_bytes, expected):
        issues.append(
            _issue(
                "snapshot_hash_mismatch",
                "error",
                "Installed CSV bytes do not match metadata; stop before analysis.",
            )
        )


def _matches_snapshot_hash(snapshot_bytes: bytes, expected_hash: str) -> bool:
    actual_hash = hashlib.sha256(snapshot_bytes).hexdigest()
    if actual_hash == expected_hash:
        return True
    normalized_hash = hashlib.sha256(snapshot_bytes.replace(b"\r\n", b"\n")).hexdigest()
    return normalized_hash == expected_hash


def _parse_population_counts(raw_row: dict[str, str]) -> dict[str, int] | None:
    try:
        counts = {field: int(raw_row[field]) for field in POPULATION_COUNT_FIELDS}
    except (KeyError, TypeError, ValueError):
        return None
    if any(value < 0 for value in counts.values()):
        return None
    return counts


def _population_numeric_values_are_valid(raw_row: dict[str, str]) -> bool:
    try:
        values = [Decimal(raw_row[field]) for field in POPULATION_NUMERIC_FIELDS]
    except (KeyError, TypeError, InvalidOperation):
        return False
    return all(value.is_finite() and value >= 0 for value in values)


def _check_expected_row_count(
    metadata: dict[str, Any],
    rows: list[dict[str, str]],
    issues: list[dict[str, Any]],
) -> None:
    expected = metadata.get("snapshot_row_count")
    if len(rows) != expected:
        issues.append(
            _issue(
                "row_count_mismatch",
                "error",
                f"Expected {expected} rows but found {len(rows)}.",
            )
        )


def _check_duplicate_keys(
    keys: list[tuple[Any, ...]],
    issues: list[dict[str, Any]],
) -> None:
    duplicates = [key for key, count in Counter(keys).items() if count > 1]
    if duplicates:
        issues.append(
            _issue(
                "duplicate_keys",
                "error",
                "Dataset contains duplicate dimension keys.",
                affected_key_count=len(duplicates),
                keys=[list(key) for key in duplicates[:20]],
            )
        )


def _check_population_coverage(
    metadata: dict[str, Any],
    keys: list[tuple[int, str, str]],
    issues: list[dict[str, Any]],
) -> None:
    years = range(
        metadata["available_years"]["start"],
        metadata["available_years"]["end"] + 1,
    )
    expected = set(
        product(
            years,
            metadata["available_geographies"],
            metadata["available_sexes"],
        )
    )
    _record_coverage_difference(expected, set(keys), issues)


def _check_unemployment_coverage(
    metadata: dict[str, Any],
    keys: list[tuple[int, str, str]],
    issues: list[dict[str, Any]],
) -> None:
    years = range(
        metadata["available_years"]["start"],
        metadata["available_years"]["end"] + 1,
    )
    expected = set(
        product(
            years,
            metadata["available_age_groups"],
            metadata["available_sexes"],
        )
    )
    _record_coverage_difference(expected, set(keys), issues)


def _record_coverage_difference(
    expected: set[tuple[Any, ...]],
    actual: set[tuple[Any, ...]],
    issues: list[dict[str, Any]],
) -> None:
    missing = expected - actual
    unexpected = actual - expected
    if missing or unexpected:
        issues.append(
            _issue(
                "dimension_coverage_mismatch",
                "error",
                "Observed dimension keys do not match metadata coverage.",
                missing_key_count=len(missing),
                unexpected_key_count=len(unexpected),
                missing_keys=[list(key) for key in sorted(missing)[:20]],
                unexpected_keys=[list(key) for key in sorted(unexpected)[:20]],
            )
        )


def _check_population_totals(
    rows: list[dict[str, Any]],
    issues: list[dict[str, Any]],
) -> None:
    mismatches: list[dict[str, Any]] = []
    for row in rows:
        counts = row["counts"]
        age_sum = sum(counts[field] for field in AGE_FIELD_BY_GROUP.values())
        total = counts["percent2"]
        if age_sum != total:
            mismatches.append(
                {
                    "year": row["year"],
                    "geography": row["geography"],
                    "sex": row["sex"],
                    "published_total": total,
                    "published_age_sum": age_sum,
                    "age_sum_minus_total": age_sum - total,
                }
            )

    mismatch_keys = {
        (item["year"], item["geography"], item["sex"])
        for item in mismatches
    }
    unexpected = mismatch_keys - KNOWN_POPULATION_AGE_TOTAL_MISMATCHES
    if unexpected:
        issues.append(
            _issue(
                "unexpected_population_age_total_mismatch",
                "error",
                "Population age bands do not reconcile to totals in new rows.",
                keys=[list(key) for key in sorted(unexpected)],
            )
        )

    known = [
        item
        for item in mismatches
        if (item["year"], item["geography"], item["sex"])
        in KNOWN_POPULATION_AGE_TOTAL_MISMATCHES
    ]
    if known:
        issues.append(
            _issue(
                "known_population_2013_age_total_mismatch",
                "warning",
                (
                    "Official 2013 population rows for 樹林區、鶯歌區、汐止區 "
                    "do not reconcile across published age bands; keep the original "
                    "values and disclose the limitation."
                ),
                affected_row_count=len(known),
                rows=known,
            )
        )


def _check_population_derived_groups(
    rows: list[dict[str, Any]],
    issues: list[dict[str, Any]],
) -> None:
    group_mismatches: list[dict[str, Any]] = []
    total_mismatches: list[dict[str, Any]] = []
    for row in rows:
        counts = row["counts"]
        for total_field, component_fields in POPULATION_DERIVED_GROUP_FIELDS.items():
            difference = sum(counts[field] for field in component_fields) - counts[total_field]
            if difference:
                group_mismatches.append(
                    {
                        "year": row["year"],
                        "geography": row["geography"],
                        "sex": row["sex"],
                        "field": total_field,
                        "component_sum_minus_total": difference,
                    }
                )

        broad_group_sum = sum(
            counts[field] for field in POPULATION_DERIVED_GROUP_FIELDS
        )
        if broad_group_sum != counts["percent2"]:
            total_mismatches.append(
                {
                    "year": row["year"],
                    "geography": row["geography"],
                    "sex": row["sex"],
                    "broad_group_sum_minus_total": broad_group_sum - counts["percent2"],
                }
            )

    unexpected_group_mismatches = [
        item
        for item in group_mismatches
        if item["field"] != "percent24"
        or (item["year"], item["geography"], item["sex"])
        not in KNOWN_POPULATION_AGE_TOTAL_MISMATCHES
    ]
    if unexpected_group_mismatches:
        issues.append(
            _issue(
                "population_derived_group_mismatch",
                "error",
                "Published broad age totals do not match their component age bands.",
                affected_cell_count=len(unexpected_group_mismatches),
                cells=unexpected_group_mismatches[:20],
            )
        )
    if total_mismatches:
        issues.append(
            _issue(
                "population_broad_groups_total_mismatch",
                "error",
                "Published 0–14, 15–64, and 65+ totals do not match total population.",
                affected_row_count=len(total_mismatches),
                rows=total_mismatches[:20],
            )
        )


def _check_population_sex_reconciliation(
    rows: list[dict[str, Any]],
    issues: list[dict[str, Any]],
) -> None:
    grouped: dict[tuple[int, str], dict[str, dict[str, int]]] = defaultdict(dict)
    for row in rows:
        grouped[(row["year"], row["geography"])][row["sex"]] = row["counts"]

    mismatches: list[dict[str, Any]] = []
    for (year, geography), sexes in grouped.items():
        if not {"all", "male", "female"} <= sexes.keys():
            continue
        for field in POPULATION_COUNT_FIELDS:
            difference = sexes["male"][field] + sexes["female"][field] - sexes["all"][field]
            if difference:
                mismatches.append(
                    {
                        "year": year,
                        "geography": geography,
                        "field": field,
                        "male_plus_female_minus_all": difference,
                    }
                )
    if mismatches:
        issues.append(
            _issue(
                "population_sex_reconciliation_mismatch",
                "error",
                "Published male and female counts do not reconcile to all-sex counts.",
                affected_cell_count=len(mismatches),
                cells=mismatches[:20],
            )
        )


def _check_population_city_reconciliation(
    metadata: dict[str, Any],
    rows: list[dict[str, Any]],
    issues: list[dict[str, Any]],
) -> None:
    districts = set(metadata["available_geographies"]) - {"新北市"}
    grouped: dict[tuple[int, str], dict[str, dict[str, int]]] = defaultdict(dict)
    for row in rows:
        grouped[(row["year"], row["sex"])][row["geography"]] = row["counts"]

    mismatches: list[dict[str, Any]] = []
    for (year, sex), geographies in grouped.items():
        if "新北市" not in geographies or not districts <= geographies.keys():
            continue
        city = geographies["新北市"]
        for field in POPULATION_COUNT_FIELDS:
            district_sum = sum(geographies[district][field] for district in districts)
            difference = district_sum - city[field]
            if difference:
                mismatches.append(
                    {
                        "year": year,
                        "sex": sex,
                        "field": field,
                        "district_sum_minus_city": difference,
                    }
                )

    unexpected = [
        item
        for item in mismatches
        if item["year"] != 2013 or item["field"] != "percent4"
    ]
    if unexpected:
        issues.append(
            _issue(
                "population_city_district_reconciliation_mismatch",
                "error",
                "District totals do not reconcile to the published city value in new cells.",
                affected_cell_count=len(unexpected),
                cells=unexpected[:20],
            )
        )


def _issue(
    code: str,
    severity: Severity,
    message: str,
    **details: Any,
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "details": details,
    }


def _dataset_result(
    dataset_id: str,
    row_count: int,
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    error_count = sum(issue["severity"] == "error" for issue in issues)
    warning_count = sum(issue["severity"] == "warning" for issue in issues)
    return {
        "dataset_id": dataset_id,
        "status": _status(error_count, warning_count),
        "row_count": row_count,
        "error_count": error_count,
        "warning_count": warning_count,
        "issues": issues,
    }


def _status(error_count: int, warning_count: int) -> str:
    if error_count:
        return "failed"
    if warning_count:
        return "passed_with_warnings"
    return "passed"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Audit installed YouthLM CSV snapshots without modifying them."
    )
    parser.add_argument("--json", action="store_true", help="Print the full JSON report.")
    args = parser.parse_args(argv)

    report = audit_installed_datasets()
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for dataset in report["datasets"]:
            print(
                f"[{dataset['status']}] {dataset['dataset_id']}: "
                f"{dataset['row_count']} rows, {dataset['error_count']} errors, "
                f"{dataset['warning_count']} warnings"
            )
            for issue in dataset["issues"]:
                print(f"  - {issue['severity']}: {issue['message']}")
        print(
            "YouthLM data audit "
            + ("passed." if report["status"] != "failed" else "failed.")
        )
    return 1 if report["status"] == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
