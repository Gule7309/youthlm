"""Minimal provider-neutral YouthLM agent loop."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.provider import ModelProvider, ModelRequest, ModelTurn
from app.tooling import ToolExecution, ToolRegistry


class AgentProtocolError(RuntimeError):
    """Raised when a provider returns an internally inconsistent turn."""


class AgentMaxStepsError(RuntimeError):
    """Raised when the agent cannot finish within its configured model turns."""


class AgentResult(BaseModel):
    """User-facing answer plus an audit trail of tool activity."""

    model_config = ConfigDict(extra="forbid")

    answer: str
    model_steps: int
    tool_executions: list[ToolExecution] = Field(default_factory=list)


class YouthLMAgent:
    """Ask a model, execute allow-listed tools, and return the final answer."""

    def __init__(
        self,
        provider: ModelProvider,
        tools: ToolRegistry,
        *,
        max_steps: int = 4,
    ) -> None:
        if max_steps <= 0:
            raise ValueError("max_steps must be positive")
        self._provider = provider
        self._tools = tools
        self._max_steps = max_steps

    def run(self, prompt: str) -> AgentResult:
        if not prompt.strip():
            raise ValueError("prompt must not be empty")

        messages: list[dict[str, Any]] = [
            {"role": "user", "content": prompt.strip()}
        ]
        executions: list[ToolExecution] = []

        for model_step in range(1, self._max_steps + 1):
            turn = self._provider.converse(
                ModelRequest(
                    messages=messages,
                    tools=self._tools.declarations(),
                )
            )

            if turn.stop_reason == "end_turn":
                if turn.tool_calls:
                    raise AgentProtocolError(
                        "end_turn must not contain tool calls"
                    )
                if turn.text is None or not turn.text.strip():
                    raise AgentProtocolError(
                        "end_turn must contain a non-empty answer"
                    )
                return AgentResult(
                    answer=turn.text,
                    model_steps=model_step,
                    tool_executions=executions,
                )

            if not turn.tool_calls:
                raise AgentProtocolError(
                    "tool_use must contain at least one tool call"
                )

            messages.append(_assistant_tool_message(turn))

            tool_result_blocks: list[dict[str, Any]] = []
            for call in turn.tool_calls:
                execution = self._tools.execute(call)
                executions.append(execution)
                result: Any = execution.result
                if not execution.succeeded:
                    result = execution.error

                tool_result_blocks.append(
                    {
                        "tool_result": {
                            "call_id": call.call_id,
                            "name": call.name,
                            "result": result,
                            "is_error": not execution.succeeded,
                        }
                    }
                )

            messages.append({"role": "user", "content": tool_result_blocks})

        raise AgentMaxStepsError(
            f"Agent did not finish within {self._max_steps} model steps"
        )


def _assistant_tool_message(turn: ModelTurn) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    if turn.text:
        content.append({"text": turn.text})
    content.extend(
        {
            "tool_call": {
                "call_id": call.call_id,
                "name": call.name,
                "arguments": call.arguments,
            }
        }
        for call in turn.tool_calls
    )

    message: dict[str, Any] = {"role": "assistant", "content": content}
    if turn.provider_state:
        message["provider_state"] = turn.provider_state
    return message
