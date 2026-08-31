import unittest

from app.population_data import DATASET_ID as POPULATION_DATASET_ID
from app.provider import ModelToolCall
from app.tooling import Tool, ToolRegistry, build_default_tool_registry
from app.youth_data import DATASET_ID


class ToolRegistryTests(unittest.TestCase):
    def test_discovers_and_inspects_installed_source(self) -> None:
        registry = build_default_tool_registry()

        search = registry.execute(
            ModelToolCall(
                call_id="call-1",
                name="search_sources",
                arguments={"query": "employment"},
            )
        )
        inspect = registry.execute(
            ModelToolCall(
                call_id="call-2",
                name="inspect_source",
                arguments={"source_id": DATASET_ID},
            )
        )

        self.assertTrue(search.succeeded)
        self.assertEqual(search.result["match_count"], 1)
        self.assertEqual(search.result["sources"][0]["source_id"], DATASET_ID)
        self.assertTrue(inspect.succeeded)
        self.assertEqual(inspect.result["query_tool"], "query_youth_dataset")
        self.assertEqual(inspect.result["status"], "available")

    def test_compatibility_tool_requires_narrower_claim_for_18_to_35(self) -> None:
        execution = build_default_tool_registry().execute(
            ModelToolCall(
                call_id="call-1",
                name="check_compatibility",
                arguments={
                    "source_id": DATASET_ID,
                    "min_age": 18,
                    "max_age": 35,
                    "start_year": 2020,
                    "end_year": 2024,
                    "geography": "新北市",
                    "sexes": ["male", "female"],
                    "unit": "%",
                },
            )
        )

        self.assertTrue(execution.succeeded)
        self.assertEqual(execution.result["overall_status"], "partial")
        self.assertTrue(execution.result["refusal_required"])
        self.assertFalse(execution.result["safe_to_claim_requested_scope"])

    def test_population_source_is_discoverable_and_district_compatible(self) -> None:
        registry = build_default_tool_registry()
        search = registry.execute(
            ModelToolCall(
                call_id="search-population",
                name="search_sources",
                arguments={"query": "人口"},
            )
        )
        compatibility = registry.execute(
            ModelToolCall(
                call_id="check-population",
                name="check_compatibility",
                arguments={
                    "source_id": POPULATION_DATASET_ID,
                    "min_age": 20,
                    "max_age": 34,
                    "geography": "板橋區",
                    "sexes": ["all"],
                    "unit": "人",
                },
            )
        )

        self.assertTrue(search.succeeded)
        self.assertEqual(search.result["match_count"], 1)
        self.assertEqual(
            search.result["sources"][0]["source_id"],
            POPULATION_DATASET_ID,
        )
        self.assertTrue(compatibility.succeeded)
        self.assertEqual(compatibility.result["overall_status"], "exact")

    def test_calculates_indicator_change(self) -> None:
        registry = build_default_tool_registry()

        execution = registry.execute(
            ModelToolCall(
                call_id="call-1",
                name="calculate_change",
                arguments={"old_value": 8.6, "new_value": 8.2},
            )
        )

        self.assertTrue(execution.succeeded)
        self.assertEqual(
            execution.result,
            {
                "old_value": 8.6,
                "new_value": 8.2,
                "absolute_change": -0.4,
                "percentage_change": -4.651163,
                "direction": "decrease",
            },
        )

    def test_converts_handler_failure_to_auditable_error(self) -> None:
        registry = ToolRegistry(
            [
                Tool(
                    name="broken",
                    description="Always fail.",
                    input_schema={"type": "object", "properties": {}},
                    handler=lambda _arguments: 1 / 0,
                )
            ]
        )

        execution = registry.execute(
            ModelToolCall(call_id="call-1", name="broken", arguments={})
        )

        self.assertFalse(execution.succeeded)
        self.assertIn("ZeroDivisionError", execution.error or "")

    def test_rejects_duplicate_tool_names(self) -> None:
        tool = Tool(
            name="same",
            description="Duplicate.",
            input_schema={"type": "object", "properties": {}},
            handler=lambda arguments: arguments,
        )

        with self.assertRaisesRegex(ValueError, "Duplicate tool name"):
            ToolRegistry([tool, tool])


if __name__ == "__main__":
    unittest.main()
