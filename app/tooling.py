"""Provider-neutral tool declarations and execution for YouthLM."""

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.provider import ModelToolCall

ToolHandler = Callable[[dict[str, Any]], Any]


@dataclass(frozen=True)
class Tool:
    """A model-visible declaration paired with application code."""

    name: str
    description: str
    input_schema: dict[str, Any]
    handler: ToolHandler

    def declaration(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


class ToolExecution(BaseModel):
    """Auditable result of one model-requested tool execution."""

    model_config = ConfigDict(extra="forbid")

    call_id: str
    name: str
    arguments: dict[str, Any]
    result: Any | None = None
    error: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.error is None


class ToolRegistry:
    """Resolve declared tool names without allowing arbitrary function calls."""

    def __init__(self, tools: Sequence[Tool]) -> None:
        self._tools: dict[str, Tool] = {}
        for tool in tools:
            if tool.name in self._tools:
                raise ValueError(f"Duplicate tool name: {tool.name}")
            self._tools[tool.name] = tool

    def declarations(self) -> list[dict[str, Any]]:
        return [tool.declaration() for tool in self._tools.values()]

    def execute(self, call: ModelToolCall) -> ToolExecution:
        tool = self._tools.get(call.name)
        if tool is None:
            return ToolExecution(
                call_id=call.call_id,
                name=call.name,
                arguments=call.arguments,
                error=f"Unknown tool: {call.name}",
            )

        try:
            result = tool.handler(call.arguments)
            json.dumps(result)
        except Exception as error:  # noqa: BLE001 - tool failures become model input
            return ToolExecution(
                call_id=call.call_id,
                name=call.name,
                arguments=call.arguments,
                error=f"{type(error).__name__}: {error}",
            )

        return ToolExecution(
            call_id=call.call_id,
            name=call.name,
            arguments=call.arguments,
            result=result,
        )


def build_default_tool_registry() -> ToolRegistry:
    """Return the first deterministic analysis tool available to YouthLM."""
    return ToolRegistry(
        [
            Tool(
                name="calculate_change",
                description=(
                    "Calculate the absolute and percentage change between an old "
                    "numeric value and a new numeric value. Use this for comparing "
                    "youth-policy indicators across two periods."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "old_value": {
                            "type": "number",
                            "description": "Indicator value in the earlier period.",
                        },
                        "new_value": {
                            "type": "number",
                            "description": "Indicator value in the later period.",
                        },
                    },
                    "required": ["old_value", "new_value"],
                },
                handler=_calculate_change,
            )
        ]
    )


def _calculate_change(arguments: dict[str, Any]) -> dict[str, Any]:
    old_value = _required_number(arguments, "old_value")
    new_value = _required_number(arguments, "new_value")
    absolute_change = new_value - old_value

    if absolute_change > 0:
        direction = "increase"
    elif absolute_change < 0:
        direction = "decrease"
    else:
        direction = "unchanged"

    percentage_change = None
    if old_value != 0:
        percentage_change = round((absolute_change / old_value) * 100, 6)

    return {
        "old_value": old_value,
        "new_value": new_value,
        "absolute_change": round(absolute_change, 6),
        "percentage_change": percentage_change,
        "direction": direction,
    }


def _required_number(arguments: dict[str, Any], name: str) -> float:
    value = arguments.get(name)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(f"{name} must be a number")
    return float(value)
