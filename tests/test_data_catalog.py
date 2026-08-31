import unittest

from app.data_catalog import build_default_data_source_catalog
from app.youth_data import DATASET_ID, get_youth_dataset_metadata


class DataSourceCatalogTests(unittest.TestCase):
    def test_lists_only_the_installed_shared_dataset(self) -> None:
        catalog = build_default_data_source_catalog()

        self.assertEqual(len(catalog.sources), 1)
        source = catalog.sources[0]
        self.assertEqual(source.source_id, DATASET_ID)
        self.assertEqual(source.status, "available")
        self.assertEqual(source.scope, "shared")
        self.assertTrue(source.default_for_notebooks)
        self.assertEqual(source.row_count, 76)
        self.assertEqual(source.available_years, {"start": 2006, "end": 2024})
        self.assertEqual(source.capabilities, ["filter", "compare", "visualize"])

    def test_catalog_preserves_source_and_youth_compatibility(self) -> None:
        source = build_default_data_source_catalog().sources[0]

        self.assertEqual(source.agency, "新北市政府主計處")
        self.assertEqual(
            source.source_dataset_page,
            "https://data.gov.tw/dataset/125003",
        )
        self.assertEqual(
            source.youth_definition_compatibility["status"],
            "partial",
        )
        self.assertIn("不可用未加權平均", source.warnings[0])

    def test_metadata_callers_cannot_mutate_the_cached_dataset(self) -> None:
        first = get_youth_dataset_metadata()
        first["title"] = "changed"

        second = get_youth_dataset_metadata()

        self.assertEqual(second["title"], "失業率－年齡別")


if __name__ == "__main__":
    unittest.main()
