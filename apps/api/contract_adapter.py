"""Translate the current AgentResult into YouthLM Contract v0."""

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
        if agent_result.analysis is None:
            return _direct_answer(request, agent_result)
        return _dataset_analysis(request, agent_result)
    except (KeyError, TypeError, ValueError) as error:
        raise ContractMappingError(
            "Agent result could not be mapped to Contract v0"
        ) from error


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
