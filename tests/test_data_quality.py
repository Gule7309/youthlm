"""Regression tests for the repeatable installed-data audit."""

import json
import tempfile
import unittest
from pathlib import Path

from app.data_quality import (
    audit_installed_datasets,
    audit_population_dataset,
    audit_unemployment_dataset,
    main,
)


class InstalledDataQualityTests(unittest.TestCase):
    def test_installed_snapshots_pass_with_only_the_confirmed_warning(self) -> None:
        report = audit_installed_datasets()

        self.assertEqual(report["status"], "passed_with_warnings")
        self.assertEqual(report["summary"]["dataset_count"], 2)
        self.assertEqual(report["summary"]["error_count"], 0)
        self.assertEqual(report["summary"]["warning_count"], 1)

        population = next(
            dataset
            for dataset in report["datasets"]
            if dataset["dataset_id"] == "ntpc_population_by_age_sex_district"
        )
        warning = population["issues"][0]
        self.assertEqual(
            warning["code"],
            "known_population_2013_age_total_mismatch",
        )
        self.assertEqual(warning["details"]["affected_row_count"], 9)
        self.assertEqual(
            {
                row["geography"]
                for row in warning["details"]["rows"]
            },
            {"樹林區", "鶯歌區", "汐止區"},
        )
        self.assertTrue(
            all(
                row["age_sum_minus_total"] < 0
                for row in warning["details"]["rows"]
            )
        )

        unemployment = next(
            dataset
            for dataset in report["datasets"]
            if dataset["dataset_id"] == "ntpc_unemployment_by_age_sex"
        )
        self.assertEqual(unemployment["status"], "passed")
        self.assertEqual(unemployment["issues"], [])

    def test_population_snapshot_reconciles_all_sex_rows(self) -> None:
        result = audit_population_dataset()

        codes = {issue["code"] for issue in result["issues"]}
        self.assertNotIn("population_sex_reconciliation_mismatch", codes)
        self.assertNotIn("population_derived_group_mismatch", codes)
        self.assertNotIn("population_broad_groups_total_mismatch", codes)
        self.assertNotIn("population_city_district_reconciliation_mismatch", codes)

    def test_extra_csv_cell_is_rejected(self) -> None:
        source_path = Path("data/ntpc_unemployment_by_age_sex.csv")
        metadata_path = Path("data/ntpc_unemployment_by_age_sex.metadata.json")
        rows = source_path.read_text(encoding="utf-8").splitlines()
        rows[1] += ",unexpected"

        with tempfile.TemporaryDirectory() as directory:
            temporary_data = Path(directory) / source_path.name
            temporary_data.write_text("\n".join(rows) + "\n", encoding="utf-8")
            result = audit_unemployment_dataset(
                data_path=temporary_data,
                metadata_path=metadata_path,
            )

        codes = {issue["code"] for issue in result["issues"]}
        self.assertEqual(result["status"], "failed")
        self.assertIn("malformed_csv_rows", codes)

    def test_modified_unemployment_snapshot_fails_closed(self) -> None:
        source_path = Path("data/ntpc_unemployment_by_age_sex.csv")
        metadata_path = Path("data/ntpc_unemployment_by_age_sex.metadata.json")
        rows = source_path.read_text(encoding="utf-8").splitlines()
        rows[1] = rows[1].rsplit(",", maxsplit=1)[0] + ",120"

        with tempfile.TemporaryDirectory() as directory:
            temporary_data = Path(directory) / source_path.name
            temporary_metadata = Path(directory) / metadata_path.name
            temporary_data.write_text("\n".join(rows) + "\n", encoding="utf-8")
            temporary_metadata.write_text(
                json.dumps(
                    json.loads(metadata_path.read_text(encoding="utf-8")),
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            result = audit_unemployment_dataset(
                data_path=temporary_data,
                metadata_path=temporary_metadata,
            )

        codes = {issue["code"] for issue in result["issues"]}
        self.assertEqual(result["status"], "failed")
        self.assertIn("snapshot_hash_mismatch", codes)
        self.assertIn("invalid_rows", codes)
        self.assertIn("dimension_coverage_mismatch", codes)

    def test_command_returns_success_for_documented_source_warning(self) -> None:
        self.assertEqual(main([]), 0)


if __name__ == "__main__":
    unittest.main()
