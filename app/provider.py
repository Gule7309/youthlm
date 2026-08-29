"""Provider-neutral model boundary used by the YouthLM agent core."""

from collections import deque
from collections.abc import Sequence
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field


class ModelRequest(BaseModel):
    """Provider-neutral input for one model turn.

    Message blocks and tool schemas stay generic in Level 0. Their strict contracts
    will be frozen together with the agent loop instead of being guessed here.
    """

    model_config = ConfigDict(extra="forbid")

    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] = Field(default_factory=list)


class ModelToolCall(BaseModel):
    """A normalized tool call returned by any model provider."""

    model_config = ConfigDict(extra="forbid")

    call_id: str
    name: str
    arguments: dict[str, Any]


class ModelTurn(BaseModel):
    """A normalized model response understood by the future agent loop."""

    model_config = ConfigDict(extra="forbid")

    stop_reason: Literal["end_turn", "tool_use"]
    text: str | None = None
    tool_calls: list[ModelToolCall] = Field(default_factory=list)
    provider_state: dict[str, Any] = Field(default_factory=dict)


class ModelProvider(Protocol):
    """The only model operation the YouthLM agent core may call."""

    def converse(self, request: ModelRequest) -> ModelTurn:
        """Run one model turn and return a provider-neutral response."""
        ...


class FakeModelProvider:
    """Return scripted model turns so agent behavior can be tested without AWS."""

    def __init__(self, scripted_turns: Sequence[ModelTurn]) -> None:
        self._scripted_turns = deque(scripted_turns)
        self.requests: list[ModelRequest] = []

    def converse(self, request: ModelRequest) -> ModelTurn:
        self.requests.append(request)

        if not self._scripted_turns:
            raise RuntimeError("FakeModelProvider has no scripted turns remaining")

        return self._scripted_turns.popleft()
