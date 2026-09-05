"""Translate the current AgentResult into YouthLM Contract v0."""

import json
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Literal

from app.agent import AgentResult
from app.analysis_result import AnalysisResult as LegacyAnalysisResult
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


def to_contract_result(
    request: AnalysisRequest,
    agent_result: AgentResult,
) -> AnalysisResult:
    """Create the public result without asking the model to copy data values."""
    try:
        analysis_source_id = (
            agent_result.analysis.dataset_ref.dataset_id
            if agent_result.analysis is not None
            else None
        )
        blocking_execution = _blocking_compatibility(
            agent_result.tool_executions,
            source_id=analysis_source_id,
            selected_source_ids={
                selection.source_id
                for selection in request.source_selections
            },
        )
        if blocking_execution is not None:
            return _blocked_analysis(request, agent_result, blocking_execution)
        if agent_result.analysis is None:
            if request.source_selections:
                raise ContractMappingError(
                    "Selected sources did not produce a deterministic analysis"
                )
            return _direct_answer(request, agent_result)
        _validate_selected_source(request, agent_result)
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
            "call check_compatibility for the requested claim. Apply every selected "
            "source filter exactly to the deterministic query."
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


def _compact_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


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
                query_parameters=query_execution.arguments,
            )
        ],
    )


def _blocking_compatibility(
    executions: list[ToolExecution],
    *,
    source_id: str | None,
    selected_source_ids: set[str],
) -> ToolExecution | None:
    for execution in reversed(executions):
        if not execution.succeeded or execution.name != "check_compatibility":
            continue
        if not isinstance(execution.result, dict):
            continue
        result_source_id = execution.result.get("source_id")
        if source_id is not None and result_source_id != source_id:
            continue
        if selected_source_ids and result_source_id not in selected_source_ids:
            continue
        if execution.result.get("refusal_required"):
            return execution
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

    compatibility = next(
        (
            execution
            for execution in agent_result.tool_executions
            if execution.succeeded
            and execution.name == "check_compatibility"
            and isinstance(execution.result, dict)
            and execution.result.get("source_id") == source_id
        ),
        None,
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
    actual_filters = {
        name: value
        for name, value in query_execution.arguments.items()
        if name != "dataset_id"
    }
    if actual_filters != selection.filters:
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
