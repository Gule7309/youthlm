import hashlib
import unittest
from pathlib import Path

from app.population_data import (
    DATASET_ID,
    PopulationDatasetQueryError,
    _matches_snapshot_hash,
    get_population_dataset_metadata,
    query_population_dataset,
)
from app.provider import ModelToolCall
from app.tooling import build_default_tool_registry


class PopulationDatasetQueryTests(unittest.TestCase):
    def test_hash_accepts_windows_crlf_checkout(self) -> None:
        source_bytes = b"header,value\nrow,1\n"
        expected_hash = hashlib.sha256(source_bytes).hexdigest()
        windows_checkout = source_bytes.replace(b"\n", b"\r\n")

        self.assertTrue(
            _matches_snapshot_hash(windows_checkout, expected_hash)
        )

    def test_hash_rejects_actual_content_change(self) -> None:
        source_bytes = b"header,value\nrow,1\n"
        expected_hash = hashlib.sha256(source_bytes).hexdigest()

        self.assertFalse(
            _matches_snapshot_hash(b"header,value\r\nrow,2\r\n", expected_hash)
        )

    def test_git_preserves_versioned_csv_snapshot_bytes(self) -> None:
        attributes = Path(".gitattributes").read_text(encoding="utf-8")

        self.assertIn("data/*.csv -text", attributes)

    def test_snapshot_has_expected_official_shape(self) -> None:
        metadata = get_population_dataset_metadata()

        self.assertEqual(metadata["snapshot_row_count"], 2250)
        self.assertEqual(metadata["available_years"], {"start": 2000, "end": 2024})
        self.assertEqual(len(metadata["available_geographies"]), 30)
        self.assertEqual(len(metadata["available_age_groups"]), 21)
        self.assertEqual(metadata["available_sexes"], ["all", "male", "female"])

    def test_filters_district_population_and_returns_provenance(self) -> None:
        result = query_population_dataset(
            {
                "dataset_id": DATASET_ID,
                "geographies": ["板橋區"],
                "age_groups": ["25-29"],
                "sexes": ["all"],
                "start_year": 2023,
                "end_year": 2024,
            }
        )

        self.assertEqual(
            result["rows"],
            [
                {
                    "year": 2023,
                    "geography": "板橋區",
                    "age_group": "25-29",
                    "sex": "all",
                    "population_count": 32242,
                },
                {
                    "year": 2024,
                    "geography": "板橋區",
                    "age_group": "25-29",
                    "sex": "all",
                    "population_count": 31374,
                },
            ],
        )
        self.assertEqual(result["row_count"], 2)
        self.assertEqual(result["dataset"]["unit"], "人")
        self.assertEqual(result["dataset"]["geography_level"], "municipality_and_district")
        self.assertEqual(
            result["provenance"]["source_sha256"],
            "226feaf05ffbc6918c67280fa42454574608b8c9b12cefa1902cf73619bf4cea",
        )

    def test_rejects_unknown_district(self) -> None:
        with self.assertRaisesRegex(
            PopulationDatasetQueryError,
            "Unsupported geographies",
        ):
            query_population_dataset(
                {
                    "dataset_id": DATASET_ID,
                    "geographies": ["台北市"],
                    "age_groups": ["25-29"],
                    "sexes": ["all"],
                    "start_year": 2024,
                    "end_year": 2024,
                }
            )

    def test_rejects_query_that_would_overload_model_context(self) -> None:
        metadata = get_population_dataset_metadata()

        with self.assertRaisesRegex(
            PopulationDatasetQueryError,
            "narrow it",
        ):
            query_population_dataset(
                {
                    "dataset_id": DATASET_ID,
                    "geographies": metadata["available_geographies"],
                    "age_groups": metadata["available_age_groups"],
                    "sexes": metadata["available_sexes"],
                    "start_year": 2000,
                    "end_year": 2024,
                }
            )

    def test_default_registry_executes_population_query(self) -> None:
        execution = build_default_tool_registry().execute(
            ModelToolCall(
                call_id="call-1",
                name="query_population_dataset",
                arguments={
                    "dataset_id": DATASET_ID,
                    "geographies": ["新北市"],
                    "age_groups": ["20-24"],
                    "sexes": ["all"],
                    "start_year": 2024,
                    "end_year": 2024,
                },
            )
        )

        self.assertTrue(execution.succeeded)
        self.assertEqual(
            execution.result["rows"][0]["population_count"],
            207958,
        )


if __name__ == "__main__":
    unittest.main()
