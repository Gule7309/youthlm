import unittest
from typing import Any
from unittest.mock import patch

from app.gemini_provider import (
    GeminiGenerateContentProvider,
    GeminiResponseError,
    _post_json,
)
from app.provider import ModelRequest, ModelToolCall


class FakeGeminiTransport:
    def __init__(self, response: dict[str, Any]) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def __call__(
        self,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "url": url,
                "headers": headers,
                "payload": payload,
            }
        )
        return self.response


class GeminiGenerateContentProviderTests(unittest.TestCase):
    def test_converts_text_response_to_end_turn(self) -> None:
        transport = FakeGeminiTransport(
            {
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [
                                {"text": "YouthLM "},
                                {"text": "is ready."},
                            ]
                        },
                    }
                ]
            }
        )
        provider = GeminiGenerateContentProvider(
            api_key="test-key",
            model_id="gemini-test",
            transport=transport,
        )

        turn = provider.converse(
            ModelRequest(messages=[{"role": "user", "content": "Hello"}])
        )

        self.assertEqual(turn.stop_reason, "end_turn")
        self.assertEqual(turn.text, "YouthLM is ready.")
        self.assertEqual(turn.tool_calls, [])

    def test_converts_function_call_to_model_tool_call(self) -> None:
        transport = FakeGeminiTransport(
            {
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "id": "call-1",
                                        "name": "query_dataset",
                                        "args": {
                                            "indicator": "unemployment_rate"
                                        },
                                    }
                                }
                            ]
                        },
                    }
                ]
            }
        )
        provider = GeminiGenerateContentProvider(
            api_key="test-key",
            model_id="gemini-test",
            transport=transport,
        )

        turn = provider.converse(
            ModelRequest(
                messages=[{"role": "user", "content": "比較青年失業率"}]
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

    def test_sends_expected_request_to_gemini(self) -> None:
        transport = FakeGeminiTransport(
            {
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {"parts": [{"text": "ok"}]},
                    }
                ]
            }
        )
        provider = GeminiGenerateContentProvider(
            api_key="test-key",
            model_id="models/gemini-test",
            transport=transport,
        )

        provider.converse(
            ModelRequest(
                messages=[
                    {"role": "user", "content": "Hello"},
                    {"role": "assistant", "content": "Hi"},
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
            transport.calls,
            [
                {
                    "url": (
                        "https://generativelanguage.googleapis.com/v1beta/"
                        "models/gemini-test:generateContent"
                    ),
                    "headers": {
                        "Content-Type": "application/json",
                        "x-goog-api-key": "test-key",
                    },
                    "payload": {
                        "contents": [
                            {"role": "user", "parts": [{"text": "Hello"}]},
                            {"role": "model", "parts": [{"text": "Hi"}]},
                        ],
                        "generationConfig": {
                            "thinkingConfig": {
                                "thinkingLevel": "low",
                            }
                        },
                        "tools": [
                            {
                                "functionDeclarations": [
                                    {
                                        "name": "query_dataset",
                                        "description": "Query a YouthLM dataset",
                                        "parameters": {
                                            "type": "object",
                                            "properties": {},
                                        },
                                    }
                                ]
                            }
                        ],
                    },
                }
            ],
        )

    def test_rejects_unsupported_finish_reason(self) -> None:
        transport = FakeGeminiTransport(
            {
                "candidates": [
                    {
                        "finishReason": "MAX_TOKENS",
                        "content": {"parts": [{"text": "partial"}]},
                    }
                ]
            }
        )
        provider = GeminiGenerateContentProvider(
            api_key="test-key",
            model_id="gemini-test",
            transport=transport,
        )

        with self.assertRaisesRegex(GeminiResponseError, "MAX_TOKENS"):
            provider.converse(
                ModelRequest(messages=[{"role": "user", "content": "Hello"}])
            )

    def test_rejects_function_call_without_id(self) -> None:
        transport = FakeGeminiTransport(
            {
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": "query_dataset",
                                        "args": {},
                                    }
                                }
                            ]
                        },
                    }
                ]
            }
        )
        provider = GeminiGenerateContentProvider(
            api_key="test-key",
            model_id="gemini-test",
            transport=transport,
        )

        with self.assertRaisesRegex(GeminiResponseError, "Gemini 3"):
            provider.converse(
                ModelRequest(messages=[{"role": "user", "content": "Hello"}])
            )

    def test_converts_timeout_to_provider_error(self) -> None:
        with (
            patch("app.gemini_provider.urlopen", side_effect=TimeoutError),
            self.assertRaisesRegex(GeminiResponseError, "90 seconds"),
        ):
            _post_json(
                "https://generativelanguage.googleapis.com/test",
                {"Content-Type": "application/json"},
                {"contents": []},
                timeout_seconds=90,
            )


if __name__ == "__main__":
    unittest.main()
