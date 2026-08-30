import unittest

from pydantic import ValidationError

from app.source_registry import (
    CompatibilityRequest,
    SourceNotFoundError,
    build_default_source_registry,
)
from app.youth_data import DATASET_ID


class SourceRegistryTests(unittest.TestCase):
    def test_source_metadata_captures_statistical_semantics(self) -> None:
        source = build_default_source_registry().inspect_source(DATASET_ID)

        self.assertEqual(source.policy_domain, "employment")
        self.assertEqual(source.geography_level, "municipality")
        self.assertEqual(source.available_dimensions, ["year", "age_group", "sex"])
        self.assertEqual(source.join_keys, ["year", "age_group", "sex"])
        self.assertEqual(source.query_tool, "query_youth_dataset")
        self.assertFalse(source.age_definition.can_split_bands)
        self.assertFalse(source.age_definition.rate_has_numerator_denominator)
        self.assertTrue(source.dataset_version.version_id.startswith("2026-08-29:"))

    def test_searches_sources_without_returning_data_rows(self) -> None:
        matches = build_default_source_registry().search_sources("失業率")

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].source_id, DATASET_ID)
        self.assertFalse(hasattr(matches[0], "rows"))

    def test_rejects_unknown_source_id(self) -> None:
        with self.assertRaisesRegex(SourceNotFoundError, "missing"):
            build_default_source_registry().inspect_source("missing")

    def test_accepts_exact_25_to_34_age_scope(self) -> None:
        report = build_default_source_registry().check_compatibility(
            CompatibilityRequest(
                source_id=DATASET_ID,
                min_age=25,
                max_age=34,
                start_year=2020,
                end_year=2024,
                geography="新北市",
                sexes=["male", "female"],
                unit="%",
            )
        )

        self.assertEqual(report.overall_status, "exact")
        self.assertTrue(report.safe_to_query)
        self.assertTrue(report.safe_to_claim_requested_scope)
        self.assertFalse(report.refusal_required)
        self.assertTrue(all(check.status == "exact" for check in report.checks))

    def test_requires_refusal_for_full_18_to_35_claim(self) -> None:
        report = build_default_source_registry().check_compatibility(
            CompatibilityRequest(
                source_id=DATASET_ID,
                min_age=18,
                max_age=35,
            )
        )

        self.assertEqual(report.overall_status, "partial")
        self.assertTrue(report.safe_to_query)
        self.assertFalse(report.safe_to_claim_requested_scope)
        self.assertTrue(report.refusal_required)
        age_check = report.checks[0]
        self.assertEqual(age_check.status, "partial")
        self.assertIn("must not be split proportionally", age_check.explanation)
        self.assertIn("25-29, 30-34", report.recommended_claim)

    def test_rejects_non_overlapping_18_to_24_scope(self) -> None:
        report = build_default_source_registry().check_compatibility(
            CompatibilityRequest(
                source_id=DATASET_ID,
                min_age=18,
                max_age=24,
            )
        )

        self.assertEqual(report.overall_status, "incompatible")
        self.assertFalse(report.safe_to_query)
        self.assertTrue(report.refusal_required)

    def test_rejects_unpublished_all_sex_scope(self) -> None:
        report = build_default_source_registry().check_compatibility(
            CompatibilityRequest(
                source_id=DATASET_ID,
                sexes=["all"],
            )
        )

        self.assertEqual(report.overall_status, "incompatible")
        self.assertTrue(report.refusal_required)
        self.assertIn("unweighted average", report.checks[0].explanation)

    def test_requires_complete_dimension_ranges(self) -> None:
        with self.assertRaisesRegex(ValidationError, "provided together"):
            CompatibilityRequest(
                source_id=DATASET_ID,
                min_age=18,
            )


if __name__ == "__main__":
    unittest.main()
