"""Reproducibly normalize the official unemployment wide table."""

import argparse
import csv
import io
import json
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from pathlib import Path

from app.youth_data import DATA_PATH, METADATA_PATH

RAW_COLUMNS = ("field1",) + tuple(f"item value{index}" for index in range(2, 22))
OUTPUT_COLUMNS = (
    "year",
    "age_group",
    "sex",
    "unemployment_rate_percent",
)
COLUMN_MAPPING = (
    ("25-29", "male", "item value4"),
    ("25-29", "female", "item value5"),
    ("30-34", "male", "item value6"),
    ("30-34", "female", "item value7"),
)
COLUMN_ORDER = {
    (age_group, sex): index
    for index, (age_group, sex, _column) in enumerate(COLUMN_MAPPING)
}


class UnemploymentNormalizationError(RuntimeError):
    """Raised when an official snapshot cannot be normalized safely."""


def normalize_unemployment_csv(raw_text: str) -> str:
    """Convert the reviewed official wide schema to YouthLM's long schema."""
    reader = csv.DictReader(io.StringIO(raw_text.lstrip("\ufeff")))
    if tuple(reader.fieldnames or ()) != RAW_COLUMNS:
        raise UnemploymentNormalizationError(
            "Official unemployment columns changed; review the mapping before refresh"
        )

    output_rows: list[tuple[int, str, str, str]] = []
    seen_years: set[int] = set()
    for row_number, row in enumerate(reader, start=2):
        if None in row or any(value is None for value in row.values()):
            raise UnemploymentNormalizationError(
                f"Official unemployment row {row_number} has extra or missing cells"
            )
        try:
            year = int(row["field1"].strip())
        except (AttributeError, TypeError, ValueError) as error:
            raise UnemploymentNormalizationError(
                f"Official unemployment row {row_number} has an invalid year"
            ) from error
        if year in seen_years:
            raise UnemploymentNormalizationError(
                f"Official unemployment year {year} is duplicated"
            )
        seen_years.add(year)

        for age_group, sex, column in COLUMN_MAPPING:
            value = row[column].strip()
            try:
                numeric_value = Decimal(value)
            except InvalidOperation as error:
                raise UnemploymentNormalizationError(
                    f"Official unemployment row {row_number} has a non-numeric rate"
                ) from error
            if not numeric_value.is_finite() or not Decimal(0) <= numeric_value <= Decimal(100):
                raise UnemploymentNormalizationError(
                    f"Official unemployment row {row_number} has a rate outside 0-100"
                )
            output_rows.append((year, age_group, sex, value))

    if not output_rows:
        raise UnemploymentNormalizationError("Official unemployment snapshot is empty")

    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(OUTPUT_COLUMNS)
    writer.writerows(
        sorted(
            output_rows,
            key=lambda row: (row[0], COLUMN_ORDER[(row[1], row[2])]),
        )
    )
    return output.getvalue()


def verify_source_and_normalize(source_path: Path) -> str:
    """Verify the pinned official bytes before applying the reviewed mapping."""
    try:
        source_bytes = source_path.read_bytes()
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise UnemploymentNormalizationError(
            "Could not read the source snapshot or metadata"
        ) from error

    if sha256(source_bytes).hexdigest() != metadata.get("source_sha256"):
        raise UnemploymentNormalizationError(
            "Official source bytes changed; preserve the new raw snapshot and review its schema"
        )
    try:
        raw_text = source_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise UnemploymentNormalizationError(
            "Official unemployment snapshot is not UTF-8"
        ) from error
    return normalize_unemployment_csv(raw_text)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Normalize the pinned New Taipei unemployment snapshot.",
    )
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--check-installed",
        action="store_true",
        help="Verify that normalization exactly reproduces the installed CSV.",
    )
    args = parser.parse_args()
    if not args.output and not args.check_installed:
        parser.error("choose --check-installed and/or an explicit --output path")

    normalized = verify_source_and_normalize(args.source)
    if args.check_installed:
        try:
            installed = DATA_PATH.read_text(encoding="utf-8")
        except OSError as error:
            raise UnemploymentNormalizationError(
                "Could not read the installed normalized snapshot"
            ) from error
        if normalized != installed.replace("\r\n", "\n"):
            raise UnemploymentNormalizationError(
                "Normalization does not reproduce the installed snapshot"
            )

    if args.output:
        output_path = args.output.resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = output_path.with_suffix(f"{output_path.suffix}.tmp")
        try:
            temporary_path.write_text(normalized, encoding="utf-8", newline="")
            temporary_path.replace(output_path)
        except OSError as error:
            temporary_path.unlink(missing_ok=True)
            raise UnemploymentNormalizationError(
                "Could not write the normalized snapshot"
            ) from error

    print("YouthLM unemployment normalization passed.")


if __name__ == "__main__":
    try:
        main()
    except UnemploymentNormalizationError as error:
        raise SystemExit(f"YouthLM unemployment normalization failed: {error}") from None
