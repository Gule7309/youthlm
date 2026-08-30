import unittest

from app.agent import AgentMaxStepsError, AgentProtocolError, YouthLMAgent
from app.provider import FakeModelProvider, ModelToolCall, ModelTurn
from app.tooling import Tool, ToolRegistry, build_default_tool_registry
from app.youth_data import DATASET_ID


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
        self.assertIsNone(result.analysis)
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

    def test_returns_structured_analysis_after_dataset_query(self) -> None:
        provider = FakeModelProvider(
            [
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="call-1",
                            name="query_youth_dataset",
                            arguments={
                                "dataset_id": DATASET_ID,
                                "age_groups": ["25-29"],
                                "sexes": ["female"],
                                "start_year": 2023,
                                "end_year": 2024,
                            },
                        )
                    ],
                ),
                ModelTurn(stop_reason="end_turn", text="女性失業率下降。"),
            ]
        )
        agent = YouthLMAgent(provider, build_default_tool_registry())

        result = agent.run("比較2023到2024年25-29歲女性失業率")

        self.assertIsNotNone(result.analysis)
        assert result.analysis is not None
        self.assertEqual(result.analysis.summary, result.answer)
        self.assertEqual(result.analysis.question, "比較2023到2024年25-29歲女性失業率")
        self.assertEqual(
            [point.y for point in result.analysis.visualization_spec.series[0].points],
            [5.8, 4.7],
        )

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

    def test_refuses_unsupported_full_youth_scope_after_compatibility_check(
        self,
    ) -> None:
        provider = FakeModelProvider(
            [
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="search-1",
                            name="search_sources",
                            arguments={"query": "失業率"},
                        )
                    ],
                ),
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="inspect-1",
                            name="inspect_source",
                            arguments={"source_id": DATASET_ID},
                        )
                    ],
                ),
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="compatibility-1",
                            name="check_compatibility",
                            arguments={
                                "source_id": DATASET_ID,
                                "min_age": 18,
                                "max_age": 35,
                            },
                        )
                    ],
                ),
                ModelTurn(
                    stop_reason="end_turn",
                    text=(
                        "現有資料只能涵蓋25–34歲，不能宣稱為完整18–35歲失業率。"
                    ),
                ),
            ]
        )
        agent = YouthLMAgent(provider, build_default_tool_registry())

        result = agent.run("請提供完整18–35歲青年失業率")

        self.assertEqual(result.model_steps, 4)
        self.assertEqual(
            [execution.name for execution in result.tool_executions],
            ["search_sources", "inspect_source", "check_compatibility"],
        )
        compatibility = result.tool_executions[-1].result
        self.assertTrue(compatibility["refusal_required"])
        self.assertIn("不能宣稱", result.answer)
        self.assertIsNone(result.analysis)


if __name__ == "__main__":
    unittest.main()
