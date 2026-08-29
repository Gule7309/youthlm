import unittest

from app.agent import AgentMaxStepsError, AgentProtocolError, YouthLMAgent
from app.provider import FakeModelProvider, ModelToolCall, ModelTurn
from app.tooling import Tool, ToolRegistry


def build_registry() -> ToolRegistry:
    return ToolRegistry(
        [
            Tool(
                name="double",
                description="Double a number.",
                input_schema={
                    "type": "object",
                    "properties": {"value": {"type": "number"}},
                    "required": ["value"],
                },
                handler=lambda arguments: {"value": arguments["value"] * 2},
            )
        ]
    )


class YouthLMAgentTests(unittest.TestCase):
    def test_returns_direct_model_answer(self) -> None:
        provider = FakeModelProvider(
            [ModelTurn(stop_reason="end_turn", text="Direct answer")]
        )
        agent = YouthLMAgent(provider, build_registry())

        result = agent.run("Hello")

        self.assertEqual(result.answer, "Direct answer")
        self.assertEqual(result.model_steps, 1)
        self.assertEqual(result.tool_executions, [])
        self.assertEqual(provider.requests[0].messages[0]["content"], "Hello")
        self.assertEqual(provider.requests[0].tools[0]["name"], "double")

    def test_executes_tool_and_returns_result_to_model(self) -> None:
        provider = FakeModelProvider(
            [
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="call-1",
                            name="double",
                            arguments={"value": 4},
                        )
                    ],
                    provider_state={"opaque": "keep-me"},
                ),
                ModelTurn(stop_reason="end_turn", text="The answer is 8."),
            ]
        )
        agent = YouthLMAgent(provider, build_registry())

        result = agent.run("Double 4")

        self.assertEqual(result.answer, "The answer is 8.")
        self.assertEqual(result.model_steps, 2)
        self.assertEqual(result.tool_executions[0].result, {"value": 8})
        self.assertEqual(
            provider.requests[1].messages,
            [
                {"role": "user", "content": "Double 4"},
                {
                    "role": "assistant",
                    "content": [
                        {
                            "tool_call": {
                                "call_id": "call-1",
                                "name": "double",
                                "arguments": {"value": 4},
                            }
                        }
                    ],
                    "provider_state": {"opaque": "keep-me"},
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "tool_result": {
                                "call_id": "call-1",
                                "name": "double",
                                "result": {"value": 8},
                                "is_error": False,
                            }
                        }
                    ],
                },
            ],
        )

    def test_returns_unknown_tool_error_to_model_for_recovery(self) -> None:
        provider = FakeModelProvider(
            [
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="call-1",
                            name="not_allowed",
                            arguments={},
                        )
                    ],
                ),
                ModelTurn(
                    stop_reason="end_turn",
                    text="That tool is unavailable.",
                ),
            ]
        )
        agent = YouthLMAgent(provider, build_registry())

        result = agent.run("Use a missing tool")

        self.assertEqual(result.answer, "That tool is unavailable.")
        self.assertEqual(result.tool_executions[0].error, "Unknown tool: not_allowed")
        tool_result = provider.requests[1].messages[-1]["content"][0][
            "tool_result"
        ]
        self.assertTrue(tool_result["is_error"])
        self.assertEqual(
            tool_result["result"],
            "Unknown tool: not_allowed",
        )

    def test_rejects_empty_end_turn(self) -> None:
        provider = FakeModelProvider([ModelTurn(stop_reason="end_turn")])
        agent = YouthLMAgent(provider, build_registry())

        with self.assertRaisesRegex(AgentProtocolError, "non-empty answer"):
            agent.run("Hello")

    def test_stops_after_maximum_model_steps(self) -> None:
        provider = FakeModelProvider(
            [
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="call-1",
                            name="double",
                            arguments={"value": 2},
                        )
                    ],
                )
            ]
        )
        agent = YouthLMAgent(provider, build_registry(), max_steps=1)

        with self.assertRaisesRegex(AgentMaxStepsError, "within 1 model steps"):
            agent.run("Keep going")


if __name__ == "__main__":
    unittest.main()
