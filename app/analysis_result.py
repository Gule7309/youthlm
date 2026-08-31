"""Deterministic UI-ready analysis contracts derived from tool results."""

from collections.abc import Sequence
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.tooling import ToolExecution


class AnalysisResultError(RuntimeError):
    """Raised when a successful data tool violates its output contract."""


class DatasetReference(BaseModel):
    """Small stable reference to the dataset used in an analysis."""

    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    title: str
    indicator: str
    agency: str
    geography: str
    unit: str


class MeasureSpec(BaseModel):
    """Describe the numeric measure in the returned rows."""

    model_config = ConfigDict(extra="forbid")

    field: str
    label: str
    unit: str


class ChartPoint(BaseModel):
    """One provider-neutral point that a frontend can plot directly."""

    model_config = ConfigDict(extra="forbid")

    x: int
    y: float


class ChartSeries(BaseModel):
    """A named line in a YouthLM visualization."""

    model_config = ConfigDict(extra="forbid")

    key: str
    label: str
    points: list[ChartPoint] = Field(default_factory=list)


class VisualizationSpec(BaseModel):
    """Minimal chart contract shared with the frontend."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["line"]
    title: str
    x_axis_label: str
    y_axis_label: str
    unit: str
    series: list[ChartSeries] = Field(default_factory=list)


class AnalysisResult(BaseModel):
    """Structured analysis produced without asking the model to copy numbers."""

    model_config = ConfigDict(extra="forbid")

    question: str
    summary: str
    dataset_ref: DatasetReference
    filters: dict[str, Any]
    dimensions: list[str]
    measure: MeasureSpec
    rows: list[dict[str, Any]]
    visualization_spec: VisualizationSpec
    warnings: list[str]
    provenance: dict[str, Any]
    youth_definition_compatibility: dict[str, Any]
    dataset_version: dict[str, str]


def build_analysis_result(
    *,
    question: str,
    summary: str,
    executions: Sequence[ToolExecution],
) -> AnalysisResult | None:
    """Build the latest successful youth-data analysis, if one exists."""
    for execution in reversed(executions):
        if execution.name != "query_youth_dataset" or not execution.succeeded:
            continue
        return _from_youth_dataset_result(
            question=question,
            summary=summary,
            raw_result=execution.result,
        )
    return None


def _from_youth_dataset_result(
    *,
    question: str,
    summary: str,
    raw_result: Any,
) -> AnalysisResult:
    if not isinstance(raw_result, dict):
        raise AnalysisResultError("query_youth_dataset result must be an object")

    try:
        dataset = raw_result["dataset"]
        filters = raw_result["query"]
        rows = raw_result["rows"]
        warnings = raw_result["warnings"]
        provenance = raw_result["provenance"]
        compatibility = raw_result["youth_definition_compatibility"]
        unit = dataset["unit"]
    except (KeyError, TypeError) as error:
        raise AnalysisResultError(
            "query_youth_dataset result is missing required analysis fields"
        ) from error

    if not isinstance(rows, list):
        raise AnalysisResultError("query_youth_dataset rows must be a list")

    measure_field = "unemployment_rate_percent"
    return AnalysisResult(
        question=question,
        summary=summary,
        dataset_ref=DatasetReference(
            dataset_id=dataset["dataset_id"],
            title=dataset["title"],
            indicator=dataset["indicator"],
            agency=dataset["agency"],
            geography=dataset["geography"],
            unit=unit,
        ),
        filters=filters,
        dimensions=["year", "age_group", "sex"],
        measure=MeasureSpec(
            field=measure_field,
            label="失業率",
            unit=unit,
        ),
        rows=rows,
        visualization_spec=VisualizationSpec(
            type="line",
            title=f"{dataset['geography']} {dataset['title']}",
            x_axis_label="年份",
            y_axis_label="失業率",
            unit=unit,
            series=_build_series(rows, filters, measure_field),
        ),
        warnings=warnings,
        provenance=provenance,
        youth_definition_compatibility=compatibility,
        dataset_version={
            "snapshot_retrieved_at": provenance["snapshot_retrieved_at"],
            "source_sha256": provenance["source_sha256"],
        },
    )


def _build_series(
    rows: list[dict[str, Any]],
    filters: dict[str, Any],
    measure_field: str,
) -> list[ChartSeries]:
    series: list[ChartSeries] = []
    sex_labels = {"male": "男性", "female": "女性"}

    for age_group in filters["age_groups"]:
        for sex in filters["sexes"]:
            matching_rows = sorted(
                (
                    row
                    for row in rows
                    if row["age_group"] == age_group and row["sex"] == sex
                ),
                key=lambda row: row["year"],
            )
            if not matching_rows:
                continue
            series.append(
                ChartSeries(
                    key=f"{age_group}:{sex}",
                    label=f"{age_group}歲 {sex_labels.get(sex, sex)}",
                    points=[
                        ChartPoint(
                            x=row["year"],
                            y=row[measure_field],
                        )
                        for row in matching_rows
                    ],
                )
            )
    return series
