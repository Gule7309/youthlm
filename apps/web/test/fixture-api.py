"""Explicit local integration fixture: real data tools and HTTP, no real AI.

Run from the repository root with::

    uv run --frozen python apps/web/test/fixture-api.py

The fixture converts each single selected source into deterministic compatibility
and query tool calls. Rows always come from the repository's installed datasets;
the fixture supplies only the model's tool-selection and summary steps. It never
replaces the normal API.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [str(ROOT), str(ROOT / "apps/api")]

import uvicorn
from contract_models import CONTRACT_VERSION, ErrorDetail, ErrorResponse
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from main import create_app
from module_store import InMemoryModuleStore
from presentation_generator import PptxPresentationGenerator
from presentation_service import PresentationService
from presentation_store import LocalPresentationArtifactStore

from app.agent import AgentResult
from app.analysis_result import build_analysis_result
from app.provider import ModelToolCall
from app.source_registry import SourceMetadata, build_default_source_registry
from app.tooling import build_default_tool_registry

FIXTURE_LABEL = "【整合測試，非 AI 回答】"
SELECTION_MARKER = (
    "\n\nYouthLM selected raw data inputs (not prior module results): "
)
SELECTION_INSTRUCTION = "\nUse only these selected sources."
UPSTREAM_MARKER = "\n\nYouthLM verified upstream module contexts"
AGE_GROUP_PATTERN = re.compile(r"^(?P<minimum>\d+)-(?P<maximum>\d+)$")


def _selected_sources_from_prompt(prompt: str) -> list[dict[str, Any]]:
    marker_index = prompt.rfind(SELECTION_MARKER)
    if marker_index < 0:
        return []

    json_start = marker_index + len(SELECTION_MARKER)
    instruction_index = prompt.find(SELECTION_INSTRUCTION, json_start)
    if instruction_index < 0:
        raise RuntimeError("Fixture could not locate source-selection instructions")

    try:
        selections = json.loads(prompt[json_start:instruction_index])
    except json.JSONDecodeError as error:
        raise RuntimeError("Fixture could not decode source selections") from error
    if not isinstance(selections, list) or not all(
        isinstance(selection, dict) for selection in selections
    ):
        raise RuntimeError("Fixture source selections must be a list of objects")
    return selections


def _original_query(prompt: str) -> str:
    boundaries = [
        index
        for marker in (SELECTION_MARKER, UPSTREAM_MARKER)
        if (index := prompt.find(marker)) >= 0
    ]
    return prompt[: min(boundaries)].strip() if boundaries else prompt.strip()


def _age_ranges(filters: dict[str, Any]) -> list[tuple[int, int]]:
    age_groups = filters.get("age_groups")
    if not isinstance(age_groups, list):
        return []

    ranges: list[tuple[int, int]] = []
    for age_group in age_groups:
        if not isinstance(age_group, str):
            continue
        match = AGE_GROUP_PATTERN.fullmatch(age_group)
        if match is not None:
            ranges.append((int(match["minimum"]), int(match["maximum"])))
    return ranges


def _compatibility_arguments(
    source: SourceMetadata,
    filters: dict[str, Any],
) -> list[dict[str, Any]]:
    shared: dict[str, Any] = {
        "source_id": source.source_id,
        "unit": source.unit,
    }
    for name in ("start_year", "end_year"):
        value = filters.get(name)
        if isinstance(value, int) and not isinstance(value, bool):
            shared[name] = value

    sexes = filters.get("sexes")
    if isinstance(sexes, list):
        shared["sexes"] = sexes

    age_ranges = _age_ranges(filters)
    ages: list[tuple[int | None, int | None]] = (
        [
            (
                min(minimum for minimum, _ in age_ranges),
                max(maximum for _, maximum in age_ranges),
            )
        ]
        if age_ranges
        else [(None, None)]
    )
    selected_geographies = filters.get("geographies")
    geographies = (
        selected_geographies
        if isinstance(selected_geographies, list) and selected_geographies
        else [source.geography]
    )

    requests: list[dict[str, Any]] = []
    for geography in geographies:
        for minimum_age, maximum_age in ages:
            arguments = dict(shared)
            if isinstance(geography, str):
                arguments["geography"] = geography
            if minimum_age is not None and maximum_age is not None:
                arguments["min_age"] = minimum_age
                arguments["max_age"] = maximum_age
            requests.append(arguments)
    return requests


class FixtureAgent:
    """Replace model turns while retaining the real tool and contract pipeline."""

    def __init__(self) -> None:
        self._sources = build_default_source_registry()
        self._tools = build_default_tool_registry(self._sources)

    def run(self, prompt: str) -> AgentResult:
        query = _original_query(prompt)
        selections = _selected_sources_from_prompt(prompt)
        if not selections:
            return AgentResult(
                answer=f"{FIXTURE_LABEL}已收到問題；此測試未指定資料來源。",
                model_steps=1,
            )
        if len(selections) != 1:
            raise RuntimeError("Fixture requires exactly one source selection")

        selection = selections[0]
        source_id = selection.get("source_id")
        filters = selection.get("filters")
        if not isinstance(source_id, str) or not isinstance(filters, dict):
            raise TypeError("Fixture source selection is malformed")

        source = self._sources.inspect_source(source_id)
        executions = [
            self._tools.execute(
                ModelToolCall(
                    call_id=f"fixture-compatibility-{index}",
                    name="check_compatibility",
                    arguments=arguments,
                )
            )
            for index, arguments in enumerate(
                _compatibility_arguments(source, filters),
                start=1,
            )
        ]

        blocking_executions = [
            execution
            for execution in executions
            if execution.succeeded
            and isinstance(execution.result, dict)
            and execution.result.get("refusal_required") is True
        ]
        if blocking_executions:
            blocking = blocking_executions[-1]
            executions = [
                execution
                for execution in executions
                if execution is not blocking
            ] + [blocking]
            return AgentResult(
                answer=(
                    f"{FIXTURE_LABEL}"
                    f"{blocking.result['recommended_claim']}"
                ),
                model_steps=2,
                tool_executions=executions,
            )

        query_execution = self._tools.execute(
            ModelToolCall(
                call_id="fixture-query-1",
                name=source.query_tool,
                arguments={"dataset_id": source_id, **filters},
            )
        )
        executions.append(query_execution)
        row_count = (
            query_execution.result.get("row_count", 0)
            if query_execution.succeeded
            and isinstance(query_execution.result, dict)
            else 0
        )
        summary = f"{FIXTURE_LABEL}已依指定來源與篩選條件查得 {row_count} 筆資料。"
        return AgentResult(
            answer=summary,
            model_steps=3,
            tool_executions=executions,
            analysis=build_analysis_result(
                question=query,
                summary=summary,
                executions=executions,
            ),
        )


def _multiple_sources_error(selections: list[Any]) -> JSONResponse:
    response = ErrorResponse(
        contract_version=CONTRACT_VERSION,
        error=ErrorDetail(
            code="dataset_error",
            message=(
                "Fixture mode supports one selected source per analysis module"
            ),
            retriable=False,
            details={"selected_source_count": len(selections)},
        ),
    )
    return JSONResponse(
        status_code=422,
        content=response.model_dump(mode="json", exclude_none=True),
    )


def create_fixture_app() -> FastAPI:
    store = InMemoryModuleStore()
    service = PresentationService(
        store,
        PptxPresentationGenerator(),
        LocalPresentationArtifactStore(
            ROOT / "apps/web/output/integration-artifacts"
        ),
    )
    application = create_app(
        FixtureAgent(),
        module_store=store,
        presentation_service=service,
        cors_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:5180",
            "http://localhost:5180",
        ],
    )

    @application.middleware("http")
    async def enforce_single_source(request: Request, call_next):
        if request.method == "POST" and request.url.path == "/v1/analysis":
            try:
                payload = await request.json()
            except (json.JSONDecodeError, UnicodeDecodeError):
                payload = None
            if isinstance(payload, dict):
                selections = payload.get("source_selections")
                if isinstance(selections, list) and len(selections) > 1:
                    return _multiple_sources_error(selections)
        return await call_next(request)

    return application


if __name__ == "__main__":
    print(
        "FIXTURE MODE ONLY: deterministic tools, no model credentials; "
        "http://127.0.0.1:18000",
        flush=True,
    )
    uvicorn.run(create_fixture_app(), host="127.0.0.1", port=18000)
