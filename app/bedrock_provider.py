"""Amazon Bedrock Converse adapter for the YouthLM model boundary."""

from typing import Any

from app.provider import ModelRequest, ModelToolCall, ModelTurn


class UnsupportedStopReasonError(RuntimeError):
    """Raised when Bedrock returns a stop reason unsupported by the MVP."""


class BedrockConverseProvider:
    """Translate between YouthLM model contracts and Bedrock Converse."""

    def __init__(self, client: Any, model_id: str) -> None:
        self._client = client
        self._model_id = model_id

    def converse(self, request: ModelRequest) -> ModelTurn:
        bedrock_request: dict[str, Any] = {
            "modelId": self._model_id,
            "messages": self._convert_messages(request.messages),
        }

        if request.tools:
            bedrock_request["toolConfig"] = {
                "tools": self._convert_tools(request.tools),
            }

        response = self._client.converse(**bedrock_request)
        stop_reason = response["stopReason"]

        if stop_reason not in {"end_turn", "tool_use"}:
            raise UnsupportedStopReasonError(
                f"Unsupported Bedrock stop reason: {stop_reason}"
            )

        text_parts: list[str] = []
        tool_calls: list[ModelToolCall] = []

        content_blocks = response["output"]["message"]["content"]

        for block in content_blocks:
            if "text" in block:
                text_parts.append(block["text"])

            if "toolUse" in block:
                tool_use = block["toolUse"]
                arguments = tool_use["input"]

                if not isinstance(arguments, dict):
                    raise ValueError("Bedrock toolUse.input must be an object")

                tool_calls.append(
                    ModelToolCall(
                        call_id=tool_use["toolUseId"],
                        name=tool_use["name"],
                        arguments=arguments,
                    )
                )

        text = "".join(text_parts) or None

        return ModelTurn(
            stop_reason=stop_reason,
            text=text,
            tool_calls=tool_calls,
        )

    @staticmethod
    def _convert_messages(
        messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        bedrock_messages = []

        for message in messages:
            content = message["content"]

            if isinstance(content, str):
                content = [{"text": content}]

            if not isinstance(content, list):
                raise TypeError("Model message content must be a string or list")

            bedrock_messages.append(
                {
                    "role": message["role"],
                    "content": [
                        BedrockConverseProvider._convert_message_block(block)
                        for block in content
                    ],
                }
            )

        return bedrock_messages

    @staticmethod
    def _convert_message_block(block: Any) -> dict[str, Any]:
        if not isinstance(block, dict):
            raise TypeError("Model message block must be an object")

        text = block.get("text")
        if isinstance(text, str):
            return {"text": text}

        tool_call = block.get("tool_call")
        if isinstance(tool_call, dict):
            return {
                "toolUse": {
                    "toolUseId": tool_call["call_id"],
                    "name": tool_call["name"],
                    "input": tool_call["arguments"],
                }
            }

        tool_result = block.get("tool_result")
        if isinstance(tool_result, dict):
            return {
                "toolResult": {
                    "toolUseId": tool_result["call_id"],
                    "content": [{"json": {"result": tool_result.get("result")}}],
                    "status": (
                        "error" if tool_result.get("is_error") else "success"
                    ),
                }
            }

        raise TypeError("Unsupported model message block")

    @staticmethod
    def _convert_tools(
        tools: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return [
            {
                "toolSpec": {
                    "name": tool["name"],
                    "description": tool["description"],
                    "inputSchema": {
                        "json": tool["input_schema"],
                    },
                }
            }
            for tool in tools
        ]
