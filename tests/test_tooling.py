import unittest

from app.provider import ModelToolCall
from app.tooling import Tool, ToolRegistry, build_default_tool_registry


class ToolRegistryTests(unittest.TestCase):
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
