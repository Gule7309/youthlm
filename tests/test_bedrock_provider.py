import unittest
from typing import Any

from app.bedrock_provider import (
    BedrockConverseProvider,
    UnsupportedStopReasonError,
)
from app.provider import ModelRequest, ModelToolCall


class FakeBedrockClient:
    def __init__(self, response: dict[str, Any]) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def converse(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return self.response


class BedrockConverseProviderTests(unittest.TestCase):
    def test_converts_text_response_to_end_turn(self) -> None:
        client = FakeBedrockClient(
            {
                "stopReason": "end_turn",
                "output": {
                    "message": {
                        "content": [
                            {"text": "YouthLM "},
                            {"text": "is ready."},
                        ]
                    }
                },
            }
        )
        provider = BedrockConverseProvider(client, "test-model")

        turn = provider.converse(
            ModelRequest(
                messages=[
                    {
                        "role": "user",
                        "content": "Hello",
                    }
                ]
            )
        )

        self.assertEqual(turn.stop_reason, "end_turn")
        self.assertEqual(turn.text, "YouthLM is ready.")
        self.assertEqual(turn.tool_calls, [])

    def test_converts_tool_use_response_to_model_tool_call(self) -> None:
        client = FakeBedrockClient(
            {
                "stopReason": "tool_use",
                "output": {
                    "message": {
                        "content": [
                            {
                                "toolUse": {
                                    "toolUseId": "call-1",
                                    "name": "query_dataset",
                                    "input": {
                                        "indicator": "unemployment_rate",
                                    },
                                }
                            }
                        ]
                    }
                },
            }
        )
        provider = BedrockConverseProvider(client, "test-model")

        turn = provider.converse(
            ModelRequest(
                messages=[
                    {
                        "role": "user",
                        "content": "比較青年失業率",
                    }
                ]
            )
        )

        self.assertEqual(turn.stop_reason, "tool_use")
        self.assertEqual(
            turn.tool_calls,
            [
                ModelToolCall(
                    call_id="call-1",
                    name="query_dataset",
                    arguments={"indicator": "unemployment_rate"},
                )
            ],
        )

    def test_sends_expected_request_to_bedrock(self) -> None:
        client = FakeBedrockClient(
            {
                "stopReason": "end_turn",
                "output": {
                    "message": {
                        "content": [{"text": "ok"}],
                    }
                },
            }
        )
        provider = BedrockConverseProvider(client, "test-model")

        provider.converse(
            ModelRequest(
                messages=[
                    {
                        "role": "user",
                        "content": "Hello",
                    }
                ],
                tools=[
                    {
                        "name": "query_dataset",
                        "description": "Query a YouthLM dataset",
                        "input_schema": {
                            "type": "object",
                            "properties": {},
                        },
                    }
                ],
            )
        )

        self.assertEqual(
            client.calls,
            [
                {
                    "modelId": "test-model",
                    "messages": [
                        {
                            "role": "user",
                            "content": [{"text": "Hello"}],
                        }
                    ],
                    "toolConfig": {
                        "tools": [
                            {
                                "toolSpec": {
                                    "name": "query_dataset",
                                    "description": "Query a YouthLM dataset",
                                    "inputSchema": {
                                        "json": {
                                            "type": "object",
                                            "properties": {},
                                        }
                                    },
                                }
                            }
                        ]
                    },
                }
            ],
        )

    def test_converts_tool_call_and_result_messages(self) -> None:
        client = FakeBedrockClient(
            {
                "stopReason": "end_turn",
                "output": {
                    "message": {"content": [{"text": "下降 4.65%。"}]}
                },
            }
        )
        provider = BedrockConverseProvider(client, "test-model")

        provider.converse(
            ModelRequest(
                messages=[
                    {"role": "user", "content": "比較兩期數值"},
                    {
                        "role": "assistant",
                        "content": [
                            {
                                "tool_call": {
                                    "call_id": "call-1",
                                    "name": "calculate_change",
                                    "arguments": {
                                        "old_value": 8.6,
                                        "new_value": 8.2,
                                    },
                                }
                            }
                        ],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "tool_result": {
                                    "call_id": "call-1",
                                    "name": "calculate_change",
                                    "result": {"percentage_change": -4.651163},
                                    "is_error": False,
                                }
                            }
                        ],
                    },
                ]
            )
        )

        self.assertEqual(
            client.calls[0]["messages"][1:],
            [
                {
                    "role": "assistant",
                    "content": [
                        {
                            "toolUse": {
                                "toolUseId": "call-1",
                                "name": "calculate_change",
                                "input": {"old_value": 8.6, "new_value": 8.2},
                            }
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "toolResult": {
                                "toolUseId": "call-1",
                                "content": [
                                    {
                                        "json": {
                                            "result": {
                                                "percentage_change": -4.651163
                                            }
                                        }
                                    }
                                ],
                                "status": "success",
                            }
                        }
                    ],
                },
            ],
        )

    def test_rejects_unsupported_stop_reason(self) -> None:
        client = FakeBedrockClient(
            {
                "stopReason": "max_tokens",
            }
        )
        provider = BedrockConverseProvider(client, "test-model")

        with self.assertRaisesRegex(
            UnsupportedStopReasonError,
            "max_tokens",
        ):
            provider.converse(
                ModelRequest(
                    messages=[
                        {
                            "role": "user",
                            "content": "Hello",
                        }
                    ]
                )
            )


if __name__ == "__main__":
    unittest.main()
