import unittest

from app.provider import ModelToolCall
from app.tooling import build_default_tool_registry
from app.youth_data import DATASET_ID, YouthDatasetQueryError, query_youth_dataset


class YouthDatasetQueryTests(unittest.TestCase):
    def test_filters_official_rows_and_returns_provenance(self) -> None:
        result = query_youth_dataset(
            {
                "dataset_id": DATASET_ID,
                "age_groups": ["25-29"],
                "sexes": ["male"],
                "start_year": 2023,
                "end_year": 2024,
            }
        )

        self.assertEqual(
            result["rows"],
            [
                {
                    "year": 2023,
                    "age_group": "25-29",
                    "sex": "male",
                    "unemployment_rate_percent": 5.4,
                },
                {
                    "year": 2024,
                    "age_group": "25-29",
                    "sex": "male",
                    "unemployment_rate_percent": 6.3,
                },
            ],
        )
        self.assertEqual(result["row_count"], 2)
        self.assertEqual(result["dataset"]["agency"], "新北市政府主計處")
        self.assertEqual(result["dataset"]["unit"], "%")
        self.assertEqual(
            result["provenance"]["source_dataset_page"],
            "https://data.gov.tw/dataset/125003",
        )
        self.assertEqual(
            result["youth_definition_compatibility"]["status"],
            "partial",
        )

    def test_rejects_unpublished_all_sex_rate(self) -> None:
        with self.assertRaisesRegex(YouthDatasetQueryError, "Unsupported sexes"):
            query_youth_dataset(
                {
                    "dataset_id": DATASET_ID,
                    "age_groups": ["25-29"],
                    "sexes": ["all"],
                    "start_year": 2023,
                    "end_year": 2024,
                }
            )

    def test_rejects_years_outside_snapshot(self) -> None:
        with self.assertRaisesRegex(YouthDatasetQueryError, "2006-2024"):
            query_youth_dataset(
                {
                    "dataset_id": DATASET_ID,
                    "age_groups": ["30-34"],
                    "sexes": ["female"],
                    "start_year": 2024,
                    "end_year": 2025,
                }
            )

    def test_default_registry_executes_real_dataset_query(self) -> None:
        execution = build_default_tool_registry().execute(
            ModelToolCall(
                call_id="call-1",
                name="query_youth_dataset",
                arguments={
                    "dataset_id": DATASET_ID,
                    "age_groups": ["30-34"],
                    "sexes": ["female"],
                    "start_year": 2024,
                    "end_year": 2024,
                },
            )
        )

        self.assertTrue(execution.succeeded)
        self.assertEqual(
            execution.result["rows"][0]["unemployment_rate_percent"],
            3.9,
        )


if __name__ == "__main__":
    unittest.main()
