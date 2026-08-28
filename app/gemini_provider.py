"""Google Gemini GenerateContent adapter for the YouthLM model boundary."""

import json
from collections.abc import Callable
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.provider import ModelRequest, ModelToolCall, ModelTurn

GeminiTransport = Callable[
    [str, dict[str, str], dict[str, Any]],
    dict[str, Any],
]


class GeminiResponseError(RuntimeError):
    """Raised when Gemini returns an unusable or unsuccessful response."""


class GeminiGenerateContentProvider:
    """Translate between YouthLM contracts and the Gemini REST API."""

    def __init__(
        self,
        api_key: str,
        model_id: str,
        transport: GeminiTransport | None = None,
    ) -> None:
        if not api_key.strip():
            raise ValueError("Gemini API key must not be empty")
        if not model_id.strip():
            raise ValueError("Gemini model ID must not be empty")

        self._api_key = api_key
        self._model_id = model_id.removeprefix("models/")
        self._transport = transport or _post_json

    def converse(self, request: ModelRequest) -> ModelTurn:
        payload: dict[str, Any] = {
            "contents": self._convert_messages(request.messages),
        }

        if request.tools:
            payload["tools"] = [
                {"functionDeclarations": self._convert_tools(request.tools)}
            ]

        endpoint = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(self._model_id, safe='')}:generateContent"
        )
        response = self._transport(
            endpoint,
            {
                "Content-Type": "application/json",
                "x-goog-api-key": self._api_key,
            },
            payload,
        )

        candidates = response.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise GeminiResponseError("Gemini response did not contain a candidate")

        candidate = candidates[0]
        if not isinstance(candidate, dict):
            raise GeminiResponseError("Gemini candidate must be an object")

        finish_reason = candidate.get("finishReason")
        if finish_reason != "STOP":
            raise GeminiResponseError(
                f"Unsupported Gemini finish reason: {finish_reason or '<missing>'}"
            )

        content = candidate.get("content")
        if not isinstance(content, dict):
            raise GeminiResponseError("Gemini candidate did not contain content")

        parts = content.get("parts")
        if not isinstance(parts, list):
            raise GeminiResponseError("Gemini content parts must be a list")

        text_parts: list[str] = []
        tool_calls: list[ModelToolCall] = []

        for part in parts:
            if not isinstance(part, dict):
                raise GeminiResponseError("Gemini content part must be an object")

            text = part.get("text")
            if isinstance(text, str):
                text_parts.append(text)

            function_call = part.get("functionCall")
            if function_call is not None:
                tool_calls.append(self._convert_function_call(function_call))

        if not text_parts and not tool_calls:
            raise GeminiResponseError("Gemini candidate contained no text or function call")

        return ModelTurn(
            stop_reason="tool_use" if tool_calls else "end_turn",
            text="".join(text_parts) or None,
            tool_calls=tool_calls,
        )

    @staticmethod
    def _convert_messages(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        gemini_messages = []

        for message in messages:
            role = message["role"]
            if role == "assistant":
                role = "model"
            if role not in {"user", "model"}:
                raise ValueError(f"Unsupported Gemini message role: {role}")

            content = message["content"]
            if isinstance(content, str):
                parts = [{"text": content}]
            elif isinstance(content, list):
                parts = content
            else:
                raise TypeError("Model message content must be a string or list")

            if not all(
                isinstance(part, dict) and isinstance(part.get("text"), str)
                for part in parts
            ):
                raise TypeError(
                    "Gemini MVP message parts must contain text strings"
                )

            gemini_messages.append({"role": role, "parts": parts})

        return gemini_messages

    @staticmethod
    def _convert_tools(
        tools: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return [
            {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            }
            for tool in tools
        ]

    @staticmethod
    def _convert_function_call(function_call: Any) -> ModelToolCall:
        if not isinstance(function_call, dict):
            raise GeminiResponseError("Gemini functionCall must be an object")

        call_id = function_call.get("id")
        if not isinstance(call_id, str) or not call_id:
            raise GeminiResponseError(
                "Gemini functionCall.id is missing; configure a Gemini 3 model"
            )

        name = function_call.get("name")
        if not isinstance(name, str) or not name:
            raise GeminiResponseError("Gemini functionCall.name is missing")

        arguments = function_call.get("args", {})
        if not isinstance(arguments, dict):
            raise GeminiResponseError("Gemini functionCall.args must be an object")

        return ModelToolCall(
            call_id=call_id,
            name=name,
            arguments=arguments,
        )


def _post_json(
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> dict[str, Any]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")[:1000]
        raise GeminiResponseError(
            f"Gemini API request failed with HTTP {error.code}: {error_body}"
        ) from error
    except URLError as error:
        raise GeminiResponseError(f"Gemini API request failed: {error.reason}") from error
    except json.JSONDecodeError as error:
        raise GeminiResponseError("Gemini API returned invalid JSON") from error

    if not isinstance(parsed, dict):
        raise GeminiResponseError("Gemini API response must be a JSON object")

    return parsed
