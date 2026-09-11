"""Tests for the reviewed official unemployment normalization mapping."""

import csv
import io
import unittest

from app.unemployment_normalizer import (
    RAW_COLUMNS,
    UnemploymentNormalizationError,
    normalize_unemployment_csv,
)


def raw_snapshot(*rows: list[str]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(RAW_COLUMNS)
    writer.writerows(rows)
    return output.getvalue()


def official_row(year: str, *, values: tuple[str, str, str, str]) -> list[str]:
    row = [year] + ["0"] * 20
    row[3:7] = list(values)
    return row


class UnemploymentNormalizerTests(unittest.TestCase):
    def test_maps_only_the_reviewed_youth_columns_to_long_rows(self) -> None:
        raw = "\ufeff" + raw_snapshot(
            official_row("2024", values=("5.1", "4.2", "3", "2.5")),
            official_row("2023", values=("6", "4.8", "3.2", "2.9")),
        )

        normalized = normalize_unemployment_csv(raw)

        self.assertEqual(
            normalized.splitlines(),
            [
                "year,age_group,sex,unemployment_rate_percent",
                "2023,25-29,male,6",
                "2023,25-29,female,4.8",
                "2023,30-34,male,3.2",
                "2023,30-34,female,2.9",
                "2024,25-29,male,5.1",
                "2024,25-29,female,4.2",
                "2024,30-34,male,3",
                "2024,30-34,female,2.5",
            ],
        )

    def test_rejects_schema_drift_duplicates_and_invalid_rates(self) -> None:
        cases = (
            "year,value\n2024,1\n",
            raw_snapshot(
                official_row("2024", values=("5", "4", "3", "2")),
                official_row("2024", values=("5", "4", "3", "2")),
            ),
            raw_snapshot(
                official_row("2024", values=("not-a-rate", "4", "3", "2")),
            ),
            raw_snapshot(
                official_row("2024", values=("101", "4", "3", "2")),
            ),
        )
        for raw in cases:
            with self.subTest(raw=raw[:30]), self.assertRaises(
                UnemploymentNormalizationError
            ):
                normalize_unemployment_csv(raw)


if __name__ == "__main__":
    unittest.main()
