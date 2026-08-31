"""Provider-neutral tool declarations and execution for YouthLM."""

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.population_data import DATASET_ID as POPULATION_DATASET_ID
from app.population_data import get_population_dataset_metadata, query_population_dataset
from app.provider import ModelToolCall
from app.source_registry import (
    CompatibilityRequest,
    SourceRegistry,
    build_default_source_registry,
)
from app.youth_data import DATASET_ID, query_youth_dataset

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


def build_default_tool_registry(
    source_registry: SourceRegistry | None = None,
) -> ToolRegistry:
    """Return source discovery, safety, and deterministic analysis tools."""
    sources = source_registry or build_default_source_registry()
    population_metadata = get_population_dataset_metadata()
    return ToolRegistry(
        [
            Tool(
                name="search_sources",
                description=(
                    "Search the shared Youth Data Commons for relevant official "
                    "sources. Use this before querying when the source_id is not "
                    "already known. Results are discovery summaries, not data rows."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "Indicator, policy topic, agency, or source keyword."
                            ),
                        },
                        "status": {
                            "type": "string",
                            "enum": ["available", "catalog_only", "document"],
                        },
                        "policy_domain": {"type": "string"},
                    },
                    "required": ["query"],
                },
                handler=lambda arguments: _search_sources(arguments, sources),
            ),
            Tool(
                name="inspect_source",
                description=(
                    "Inspect one source's statistical meaning, dimensions, age "
                    "definition, geography, version, query tool, and limitations. "
                    "Inspect before deciding whether a requested claim is valid."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "source_id": {"type": "string"},
                    },
                    "required": ["source_id"],
                },
                handler=lambda arguments: _inspect_source(arguments, sources),
            ),
            Tool(
                name="check_compatibility",
                description=(
                    "Deterministically check whether a source can support the "
                    "requested age, year, geography, sex, and unit scope. Use this "
                    "before claiming an exact 18-35 youth result. If "
                    "refusal_required is true, do not claim the requested scope; "
                    "narrow or refuse it and explain the limitation."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "source_id": {"type": "string"},
                        "min_age": {"type": "integer", "minimum": 0},
                        "max_age": {"type": "integer", "maximum": 120},
                        "start_year": {"type": "integer"},
                        "end_year": {"type": "integer"},
                        "geography": {"type": "string"},
                        "sexes": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": ["male", "female", "all"],
                            },
                        },
                        "unit": {"type": "string"},
                    },
                    "required": ["source_id"],
                },
                handler=lambda arguments: _check_compatibility(
                    arguments,
                    sources,
                ),
            ),
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
            ),
            Tool(
                name="query_youth_dataset",
                description=(
                    "Query the versioned New Taipei City annual unemployment-rate "
                    "dataset for ages 25-29 and 30-34, separated by male and "
                    "female. The tool returns official rows, provenance, unit, and "
                    "data limitations. It cannot produce an all-sex rate."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "dataset_id": {
                            "type": "string",
                            "enum": [DATASET_ID],
                        },
                        "age_groups": {
                            "type": "array",
                            "items": {"type": "string", "enum": ["25-29", "30-34"]},
                        },
                        "sexes": {
                            "type": "array",
                            "items": {"type": "string", "enum": ["male", "female"]},
                        },
                        "start_year": {"type": "integer", "minimum": 2006},
                        "end_year": {"type": "integer", "maximum": 2024},
                    },
                    "required": [
                        "dataset_id",
                        "age_groups",
                        "sexes",
                        "start_year",
                        "end_year",
                    ],
                },
                handler=query_youth_dataset,
            ),
            Tool(
                name="query_population_dataset",
                description=(
                    "Query the versioned official New Taipei resident-population "
                    "dataset by year, municipality or district, published 5-year "
                    "age group, and official all/male/female counts. Use only age "
                    "groups returned by inspect_source; it cannot split 15-19 or "
                    "35-39 into an exact 18-35 population."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "dataset_id": {
                            "type": "string",
                            "enum": [POPULATION_DATASET_ID],
                        },
                        "geographies": {
                            "type": "array",
                            "maxItems": 10,
                            "items": {
                                "type": "string",
                                "enum": population_metadata[
                                    "available_geographies"
                                ],
                            },
                        },
                        "age_groups": {
                            "type": "array",
                            "maxItems": 10,
                            "items": {
                                "type": "string",
                                "enum": population_metadata[
                                    "available_age_groups"
                                ],
                            },
                        },
                        "sexes": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": ["all", "male", "female"],
                            },
                        },
                        "start_year": {"type": "integer", "minimum": 2000},
                        "end_year": {"type": "integer", "maximum": 2024},
                    },
                    "required": [
                        "dataset_id",
                        "geographies",
                        "age_groups",
                        "sexes",
                        "start_year",
                        "end_year",
                    ],
                },
                handler=query_population_dataset,
            ),
        ]
    )


def _search_sources(
    arguments: dict[str, Any],
    registry: SourceRegistry,
) -> dict[str, Any]:
    query = _required_string(arguments, "query")
    status = arguments.get("status")
    policy_domain = arguments.get("policy_domain")
    matches = registry.search_sources(
        query,
        status=status,
        policy_domain=policy_domain,
    )
    return {
        "query": query,
        "match_count": len(matches),
        "sources": [match.model_dump(mode="json") for match in matches],
    }


def _inspect_source(
    arguments: dict[str, Any],
    registry: SourceRegistry,
) -> dict[str, Any]:
    source_id = _required_string(arguments, "source_id")
    return registry.inspect_source(source_id).model_dump(mode="json")


def _check_compatibility(
    arguments: dict[str, Any],
    registry: SourceRegistry,
) -> dict[str, Any]:
    request = CompatibilityRequest.model_validate(arguments)
    return registry.check_compatibility(request).model_dump(mode="json")


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


def _required_string(arguments: dict[str, Any], name: str) -> str:
    value = arguments.get(name)
    if not isinstance(value, str) or not value.strip():
        raise TypeError(f"{name} must be a non-empty string")
    return value.strip()
