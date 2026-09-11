"""Translate the current AgentResult into YouthLM Contract v0."""

import json
import re
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Literal

from app.agent import AgentResult, CompletionGuard
from app.analysis_result import AnalysisResult as LegacyAnalysisResult
from app.source_registry import SourceMetadata, SourceRegistry, build_default_source_registry
from app.tooling import ToolExecution

from contract_models import (
    CONTRACT_VERSION,
    AnalysisPlanStep,
    AnalysisRequest,
    AnalysisResult,
    DataColumn,
    DatasetVersion,
    ModuleContext,
    ProvenanceRecord,
    ResultData,
    SourceReference,
    VisualizationSpec,
    Warning,
)


class ContractMappingError(RuntimeError):
    """Raised when an internal AgentResult cannot satisfy Contract v0."""


SET_LIKE_FILTERS = frozenset({"age_groups", "geographies", "sexes"})
EXPLICIT_AGE_SCOPE_PATTERNS = (
    re.compile(r"(?P<minimum>\d{1,3})\s*(?:至|到|[-–—~～])\s*(?P<maximum>\d{1,3})\s*歲"),
    re.compile(
        r"\bages?\s*(?P<minimum>\d{1,3})\s*(?:to|[-–—~])\s*"
        r"(?P<maximum>\d{1,3})\b",
        re.IGNORECASE,
    ),
)


def to_contract_result(
    request: AnalysisRequest,
    agent_result: AgentResult,
) -> AnalysisResult:
    """Create the public result without asking the model to copy data values."""
    try:
        source_registry = build_default_source_registry()
        analysis_source_id = (
            agent_result.analysis.dataset_ref.dataset_id
            if agent_result.analysis is not None
            else None
        )
        blocking_execution = _blocking_compatibility(
            agent_result.tool_executions,
            request=request,
            source_registry=source_registry,
            source_id=analysis_source_id,
        )
        if blocking_execution is not None:
            return _blocked_analysis(request, agent_result, blocking_execution)
        if agent_result.analysis is None:
            if request.source_selections:
                raise ContractMappingError(
                    "Selected sources did not produce a deterministic analysis"
                )
            return _direct_answer(request, agent_result)
        _validate_selected_source(request, agent_result, source_registry)
        return _dataset_analysis(request, agent_result)
    except (KeyError, TypeError, ValueError) as error:
        raise ContractMappingError(
            "Agent result could not be mapped to Contract v0"
        ) from error


def build_agent_prompt(
    request: AnalysisRequest,
    module_contexts: Sequence[ModuleContext] = (),
) -> str:
    """Add raw-source constraints without exposing frontend implementation state."""
    if not request.source_selections and not module_contexts:
        return request.query

    prompt_parts = [request.query]
    if request.source_selections:
        selections = [
            selection.model_dump(mode="json")
            for selection in request.source_selections
        ]
        prompt_parts.append(
            "YouthLM selected raw data inputs (not prior module results): "
            f"{_compact_json(selections)}\n"
            "Use only these selected sources. Before querying a selected source, "
            "call check_compatibility using the exact scope in that selection's "
            "filters, not the general YouthLM 18-35 target. For example, age_groups "
            "20-24 means min_age 20 and max_age 24. Apply every selected source "
            "filter exactly to the deterministic query. Do not finish the answer "
            "until both the compatibility check and deterministic query succeed, "
            "unless the compatibility result requires refusal."
        )
    if module_contexts:
        contexts = [
            context.model_dump(mode="json", exclude_none=True)
            for context in module_contexts
        ]
        prompt_parts.append(
            "YouthLM verified upstream module contexts (not raw source inputs): "
            f"{_compact_json(contexts)}\n"
            "Use these structured prior results and preserve their warnings, "
            "sources, versions, and provenance. Do not guess prior module content."
        )
    return "\n\n".join(prompt_parts)


def build_selected_source_completion_guard(
    request: AnalysisRequest,
    source_registry: SourceRegistry,
) -> CompletionGuard | None:
    """Require the model to finish the selected-source protocol before answering.

    Contract v0 currently supports one deterministic dataset result per analysis
    module. The HTTP boundary rejects larger selections before constructing this
    guard.
    """
    if len(request.source_selections) != 1:
        return None

    selection = request.source_selections[0]
    source = source_registry.inspect_source(selection.source_id)
    expected_compatibility, allowed_geographies = _expected_compatibility_scope(
        selection.filters,
        source,
    )
    expected_arguments = {
        "dataset_id": selection.source_id,
        **selection.filters,
    }

    def completion_guard(executions: Sequence[ToolExecution]) -> str | None:
        requested_scope = _query_compatibility_scope(
            request.query,
            expected_compatibility,
        )
        if requested_scope != expected_compatibility:
            requested_compatibility = _latest_compatibility(
                executions,
                expected_arguments=requested_scope,
                allowed_geographies=allowed_geographies,
            )
            if (
                requested_compatibility is not None
                and isinstance(requested_compatibility.result, dict)
                and requested_compatibility.result.get("refusal_required") is True
            ):
                return None

        compatibility = _latest_compatibility(
            executions,
            expected_arguments=expected_compatibility,
            allowed_geographies=allowed_geographies,
        )
        if compatibility is None:
            return (
                "You cannot finalize this answer yet. Your next model turn must "
                "only call check_compatibility with this selected filter scope: "
                f"{_compact_json(expected_compatibility)}. "
                "Wait for that tool result before querying or answering."
            )

        report = compatibility.result
        if isinstance(report, dict) and report.get("refusal_required") is True:
            return None

        query_execution = _latest_successful_dataset_query(executions)
        if (
            query_execution is not None
            and query_execution.name == source.query_tool
            and query_execution.arguments.get("dataset_id") == selection.source_id
            and _filters_equivalent(
                {
                    name: value
                    for name, value in query_execution.arguments.items()
                    if name != "dataset_id"
                },
                selection.filters,
            )
        ):
            return None

        return (
            "You cannot finalize this answer yet. Call the deterministic query "
            f"tool {source.query_tool!r} with exactly these arguments (array "
            "order may differ, but no filter may be added, removed, or narrowed): "
            f"{_compact_json(expected_arguments)}. Wait for the successful tool "
            "result, then base the answer only on those returned rows."
        )

    return completion_guard


def _compact_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _expected_compatibility_scope(
    filters: dict[str, Any],
    source: SourceMetadata,
) -> tuple[dict[str, Any], set[str]]:
    age_groups = filters.get("age_groups")
    sexes = filters.get("sexes")
    start_year = filters.get("start_year")
    end_year = filters.get("end_year")
    geographies = filters.get("geographies", [source.geography])
    if (
        not isinstance(age_groups, list)
        or not age_groups
        or not isinstance(sexes, list)
        or not sexes
        or isinstance(start_year, bool)
        or not isinstance(start_year, int)
        or isinstance(end_year, bool)
        or not isinstance(end_year, int)
        or not isinstance(geographies, list)
        or not geographies
    ):
        raise ContractMappingError(
            "Selected source filters cannot define a compatibility scope"
        )

    bands = {band.label: band for band in source.age_definition.bands}
    try:
        selected_bands = [bands[label] for label in age_groups]
    except (KeyError, TypeError) as error:
        raise ContractMappingError(
            "Selected source age groups are not published by the source"
        ) from error
    if not all(isinstance(item, str) for item in sexes + geographies):
        raise ContractMappingError(
            "Selected source dimensions must contain only strings"
        )

    allowed_geographies = set(geographies)
    return (
        {
            "source_id": source.source_id,
            "min_age": min(band.min_age for band in selected_bands),
            "max_age": max(band.max_age for band in selected_bands),
            "start_year": start_year,
            "end_year": end_year,
            "geography": geographies[0],
            "sexes": sexes,
            "unit": source.unit,
        },
        allowed_geographies,
    )


def _query_compatibility_scope(
    query: str,
    selected_scope: dict[str, Any],
) -> dict[str, Any]:
    scope = dict(selected_scope)
    for pattern in EXPLICIT_AGE_SCOPE_PATTERNS:
        match = pattern.search(query)
        if match is None:
            continue
        minimum = int(match["minimum"])
        maximum = int(match["maximum"])
        if minimum <= maximum:
            scope["min_age"] = minimum
            scope["max_age"] = maximum
        break
    return scope


def _compatibility_arguments_match(
    actual: dict[str, Any],
    expected: dict[str, Any],
    allowed_geographies: set[str],
) -> bool:
    if actual.keys() != expected.keys():
        return False
    for name, expected_value in expected.items():
        actual_value = actual[name]
        if name == "geography":
            if actual_value not in allowed_geographies:
                return False
        elif name == "sexes":
            if _filter_value(actual_value, set_like=True) != _filter_value(
                expected_value,
                set_like=True,
            ):
                return False
        elif actual_value != expected_value:
            return False
    return True


def _latest_compatibility(
    executions: Sequence[ToolExecution],
    *,
    expected_arguments: dict[str, Any],
    allowed_geographies: set[str],
) -> ToolExecution | None:
    return next(
        (
            execution
            for execution in reversed(executions)
            if execution.succeeded
            and execution.name == "check_compatibility"
            and isinstance(execution.result, dict)
            and _compatibility_arguments_match(
                execution.arguments,
                expected_arguments,
                allowed_geographies,
            )
        ),
        None,
    )


def _latest_successful_dataset_query(
    executions: Sequence[ToolExecution],
) -> ToolExecution | None:
    return next(
        (
            execution
            for execution in reversed(executions)
            if execution.succeeded
            and execution.name.startswith("query_")
        ),
        None,
    )


def _filters_equivalent(
    actual: dict[str, Any],
    expected: dict[str, Any],
) -> bool:
    if actual.keys() != expected.keys():
        return False
    return all(
        _filter_value(value, set_like=name in SET_LIKE_FILTERS)
        == _filter_value(expected[name], set_like=name in SET_LIKE_FILTERS)
        for name, value in actual.items()
    )


def _filter_value(value: Any, *, set_like: bool) -> Any:
    if not set_like or not isinstance(value, list):
        return value
    return sorted({_compact_json(item) for item in value})


def _direct_answer(
    request: AnalysisRequest,
    agent_result: AgentResult,
) -> AnalysisResult:
    return AnalysisResult(
        contract_version=CONTRACT_VERSION,
        project_id=request.project_id,
        module_id=request.module_id,
        upstream_module_ids=request.upstream_module_ids,
        title=_title_from_query(request.query),
        question=request.query,
        status="completed",
        analysis_plan=[
            AnalysisPlanStep(
                step_id="answer_question",
                description="分析問題並產生回答",
                status="completed",
            )
        ],
        filters={},
        dimensions=[],
        result_data=ResultData(columns=[], records=[]),
        summary=agent_result.answer,
        warnings=[],
        sources=[],
        dataset_versions=[],
        provenance=[],
    )


def _blocked_analysis(
    request: AnalysisRequest,
    agent_result: AgentResult,
    execution: ToolExecution,
) -> AnalysisResult:
    report = execution.result
    if not isinstance(report, dict):
        raise ContractMappingError("Compatibility result must be an object")

    source_id = report["source_id"]
    blocking_checks = [
        check
        for check in report.get("checks", [])
        if check.get("status") != "exact"
    ]
    warning_type = _compatibility_warning_type(blocking_checks)
    context: dict[str, Any] = {
        "overall_status": report["overall_status"],
        "recommended_claim": report["recommended_claim"],
    }
    if blocking_checks:
        context["checks"] = blocking_checks

    selected_filters = next(
        (
            selection.filters
            for selection in request.source_selections
            if selection.source_id == source_id
        ),
        {},
    )
    return AnalysisResult(
        contract_version=CONTRACT_VERSION,
        project_id=request.project_id,
        module_id=request.module_id,
        upstream_module_ids=request.upstream_module_ids,
        title="無法支援要求的分析範圍",
        question=request.query,
        status="blocked",
        analysis_plan=_analysis_plan(agent_result.tool_executions),
        filters=selected_filters,
        dimensions=[],
        result_data=ResultData(columns=[], records=[]),
        summary=agent_result.answer,
        warnings=[
            Warning(
                type=warning_type,
                severity="blocking",
                message=report["recommended_claim"],
                affected_source_ids=[source_id],
                context=context,
            )
        ],
        sources=[],
        dataset_versions=[],
        provenance=[],
    )


def _dataset_analysis(
    request: AnalysisRequest,
    agent_result: AgentResult,
) -> AnalysisResult:
    analysis = agent_result.analysis
    if analysis is None:
        raise ContractMappingError("Dataset analysis is missing")

    source_id = analysis.dataset_ref.dataset_id
    dataset_version_id = _dataset_version_id(analysis)
    warnings = [
        _structured_warning(message, source_id)
        for message in analysis.warnings
    ]
    query_execution = _query_execution(agent_result.tool_executions)
    query_parameters = {
        "dataset_id": source_id,
        **analysis.filters,
    }

    return AnalysisResult(
        contract_version=CONTRACT_VERSION,
        project_id=request.project_id,
        module_id=request.module_id,
        upstream_module_ids=request.upstream_module_ids,
        title=analysis.dataset_ref.title,
        question=request.query,
        status=(
            "partial"
            if any(warning.severity in {"warning", "blocking"} for warning in warnings)
            else "completed"
        ),
        analysis_plan=_analysis_plan(agent_result.tool_executions),
        filters=analysis.filters,
        dimensions=analysis.dimensions,
        result_data=ResultData(
            columns=_columns(analysis),
            records=analysis.rows,
        ),
        visualization=_visualization(analysis),
        summary=agent_result.answer,
        warnings=warnings,
        sources=[
            SourceReference(
                source_id=source_id,
                title=analysis.dataset_ref.title,
                agency=analysis.dataset_ref.agency,
                source_url=analysis.provenance.get("source_dataset_page"),
                dataset_version_id=dataset_version_id,
            )
        ],
        dataset_versions=[
            DatasetVersion(
                dataset_version_id=dataset_version_id,
                source_id=source_id,
                retrieved_at=_retrieved_at(analysis),
                source_sha256=analysis.dataset_version["source_sha256"],
                license=analysis.provenance.get("license"),
            )
        ],
        provenance=[
            ProvenanceRecord(
                source_id=source_id,
                dataset_version_id=dataset_version_id,
                query_tool=query_execution.name,
                query_parameters=query_parameters,
            )
        ],
    )


def _blocking_compatibility(
    executions: list[ToolExecution],
    *,
    request: AnalysisRequest,
    source_registry: SourceRegistry,
    source_id: str | None,
) -> ToolExecution | None:
    if request.source_selections:
        for selection in request.source_selections:
            source = source_registry.inspect_source(selection.source_id)
            expected, allowed_geographies = _expected_compatibility_scope(
                selection.filters,
                source,
            )
            requested_scope = _query_compatibility_scope(request.query, expected)
            if requested_scope != expected:
                requested_execution = _latest_compatibility(
                    executions,
                    expected_arguments=requested_scope,
                    allowed_geographies=allowed_geographies,
                )
                if (
                    requested_execution is not None
                    and isinstance(requested_execution.result, dict)
                    and requested_execution.result.get("refusal_required")
                ):
                    return requested_execution

            execution = _latest_compatibility(
                executions,
                expected_arguments=expected,
                allowed_geographies=allowed_geographies,
            )
            if (
                execution is not None
                and isinstance(execution.result, dict)
                and execution.result.get("refusal_required")
            ):
                return execution
        return None

    for execution in reversed(executions):
        if not execution.succeeded or execution.name != "check_compatibility":
            continue
        if not isinstance(execution.result, dict):
            continue
        result_source_id = execution.result.get("source_id")
        if source_id is not None and result_source_id != source_id:
            continue
        return execution if execution.result.get("refusal_required") else None
    return None


def _compatibility_warning_type(
    checks: list[dict[str, Any]],
) -> Literal[
    "age_mismatch",
    "geography_mismatch",
    "year_mismatch",
    "unit_mismatch",
    "missing_dimension",
    "insufficient_data",
    "unsupported_claim",
]:
    warning_types = {
        "age": "age_mismatch",
        "geography": "geography_mismatch",
        "year": "year_mismatch",
        "unit": "unit_mismatch",
        "sex": "missing_dimension",
    }
    for check in checks:
        dimension = check.get("dimension")
        if dimension in warning_types:
            return warning_types[dimension]
    return "unsupported_claim"


def _validate_selected_source(
    request: AnalysisRequest,
    agent_result: AgentResult,
    source_registry: SourceRegistry,
) -> None:
    if not request.source_selections or agent_result.analysis is None:
        return

    source_id = agent_result.analysis.dataset_ref.dataset_id
    selection = next(
        (
            item
            for item in request.source_selections
            if item.source_id == source_id
        ),
        None,
    )
    if selection is None:
        raise ContractMappingError(
            "Agent queried a source outside source_selections"
        )

    source = source_registry.inspect_source(selection.source_id)
    expected, allowed_geographies = _expected_compatibility_scope(
        selection.filters,
        source,
    )
    compatibility = _latest_compatibility(
        agent_result.tool_executions,
        expected_arguments=expected,
        allowed_geographies=allowed_geographies,
    )
    if compatibility is None:
        raise ContractMappingError(
            "Selected source was queried without a compatibility check"
        )

    query_execution = _query_execution(agent_result.tool_executions)
    if query_execution.arguments.get("dataset_id") != source_id:
        raise ContractMappingError(
            "Deterministic query did not use the selected source"
        )
    if not _filters_equivalent(
        agent_result.analysis.filters,
        selection.filters,
    ):
        raise ContractMappingError(
            "Deterministic query did not preserve selected filters"
        )


def _title_from_query(query: str) -> str:
    if len(query) <= 200:
        return query
    return f"{query[:197]}..."


def _analysis_plan(executions: list[ToolExecution]) -> list[AnalysisPlanStep]:
    descriptions = {
        "search_sources": "搜尋可用資料來源",
        "inspect_source": "檢視資料定義、版本與限制",
        "check_compatibility": "檢查分析範圍與資料相容性",
        "query_youth_dataset": "查詢青年失業率資料",
        "query_population_dataset": "查詢青年人口資料",
        "calculate_change": "計算指標變化",
    }
    steps = [
        AnalysisPlanStep(
            step_id=f"tool_{index}_{execution.name}",
            description=descriptions.get(execution.name, f"執行 {execution.name}"),
            status="completed" if execution.succeeded else "skipped",
        )
        for index, execution in enumerate(executions, start=1)
    ]
    steps.append(
        AnalysisPlanStep(
            step_id="synthesize_result",
            description="整理資料、限制與分析摘要",
            status="completed",
        )
    )
    return steps


def _columns(analysis: LegacyAnalysisResult) -> list[DataColumn]:
    labels = {
        "year": "年份",
        "geography": "地區",
        "age_group": "年齡組",
        "sex": "性別",
    }
    columns = [
        DataColumn(
            name=dimension,
            label=labels.get(dimension, dimension),
            data_type=_infer_data_type(
                [row[dimension] for row in analysis.rows if dimension in row],
                fallback="string",
            ),
            role="dimension",
        )
        for dimension in analysis.dimensions
    ]
    columns.append(
        DataColumn(
            name=analysis.measure.field,
            label=analysis.measure.label,
            data_type=_infer_data_type(
                [
                    row[analysis.measure.field]
                    for row in analysis.rows
                    if analysis.measure.field in row
                ],
                fallback="number",
            ),
            role="measure",
            unit=analysis.measure.unit,
        )
    )
    return columns


def _infer_data_type(
    values: list[Any],
    *,
    fallback: Literal["string", "number"],
) -> Literal["string", "integer", "number", "boolean"]:
    if values and all(isinstance(value, bool) for value in values):
        return "boolean"
    if values and all(
        isinstance(value, int) and not isinstance(value, bool)
        for value in values
    ):
        return "integer"
    if values and all(
        isinstance(value, (int, float)) and not isinstance(value, bool)
        for value in values
    ):
        return "number"
    return fallback


def _visualization(analysis: LegacyAnalysisResult) -> VisualizationSpec | None:
    if "year" not in analysis.dimensions:
        return None
    return VisualizationSpec(
        type="line",
        title=analysis.visualization_spec.title,
        x_field="year",
        y_field=analysis.measure.field,
        series_fields=[
            dimension
            for dimension in analysis.dimensions
            if dimension != "year"
        ],
        unit=analysis.measure.unit,
    )


def _structured_warning(message: str, source_id: str) -> Warning:
    warning_type: Literal[
        "age_mismatch",
        "geography_mismatch",
        "year_mismatch",
        "unit_mismatch",
        "missing_dimension",
        "insufficient_data",
        "unsupported_claim",
    ] = "insufficient_data"
    severity: Literal["info", "warning", "blocking"] = "warning"

    lowered = message.lower()
    if any(token in lowered for token in ("年齡", "歲", "18-35", "age")):
        warning_type = "age_mismatch"
    elif any(token in lowered for token in ("區級", "里級", "地區", "geography")):
        warning_type = "geography_mismatch"
    elif any(token in lowered for token in ("年度", "最新", "year")):
        warning_type = "year_mismatch"
        severity = "info"
    elif any(token in lowered for token in ("男女", "性別", "合計", "sex")):
        warning_type = "missing_dimension"

    if "官方發布" in message and "不是由YouthLM" in message:
        severity = "info"

    return Warning(
        type=warning_type,
        severity=severity,
        message=message,
        affected_source_ids=[source_id],
    )


def _dataset_version_id(analysis: LegacyAnalysisResult) -> str:
    retrieved_at = analysis.dataset_version["snapshot_retrieved_at"]
    source_sha256 = analysis.dataset_version["source_sha256"]
    return f"{retrieved_at}:{source_sha256[:12]}"


def _retrieved_at(analysis: LegacyAnalysisResult) -> datetime:
    value = analysis.dataset_version["snapshot_retrieved_at"]
    if len(value) == 10:
        value = f"{value}T00:00:00+08:00"
    return datetime.fromisoformat(value)


def _query_execution(executions: list[ToolExecution]) -> ToolExecution:
    for execution in reversed(executions):
        if execution.succeeded and execution.name.startswith("query_"):
            return execution
    raise ContractMappingError("Dataset analysis has no successful query execution")
