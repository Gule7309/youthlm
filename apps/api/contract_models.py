"""Runtime models for the published YouthLM Contract v0 schemas."""

from datetime import datetime
from typing import Annotated, Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CONTRACT_VERSION = "0.1.0"
Identifier = Annotated[
    str,
    Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    ),
]


class SourceSelection(BaseModel):
    """One raw data input selected for this analysis module."""

    model_config = ConfigDict(extra="forbid")

    source_id: Identifier
    filters: dict[str, Any]


class AnalysisRequest(BaseModel):
    """Frontend request for one semantic analysis module."""

    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["0.1.0"]
    project_id: Identifier
    module_id: Identifier
    query: str = Field(min_length=1, max_length=2_000)
    upstream_module_ids: list[Identifier]
    source_selections: list[SourceSelection] = Field(default_factory=list)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("query must not be blank")
        return normalized

    @field_validator("upstream_module_ids")
    @classmethod
    def require_unique_upstream_modules(
        cls,
        value: list[str],
    ) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("upstream_module_ids must be unique")
        return value

    @field_validator("source_selections")
    @classmethod
    def require_unique_source_selections(
        cls,
        value: list[SourceSelection],
    ) -> list[SourceSelection]:
        source_ids = [selection.source_id for selection in value]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("source_selections source_id values must be unique")
        return value


class DataColumn(BaseModel):
    """One declared column in generic result data."""

    model_config = ConfigDict(extra="forbid")

    name: Identifier
    label: str = Field(min_length=1)
    data_type: Literal[
        "string",
        "integer",
        "number",
        "boolean",
        "date",
        "datetime",
    ]
    role: Literal["dimension", "measure"]
    unit: str | None = Field(default=None, min_length=1)


class ResultData(BaseModel):
    """Generic flat records paired with explicit column metadata."""

    model_config = ConfigDict(extra="forbid")

    columns: list[DataColumn]
    records: list[dict[str, Any]]

    @model_validator(mode="after")
    def validate_record_columns(self) -> Self:
        column_names = [column.name for column in self.columns]
        if len(column_names) != len(set(column_names)):
            raise ValueError("result_data column names must be unique")

        declared = set(column_names)
        for index, record in enumerate(self.records):
            undeclared = set(record) - declared
            if undeclared:
                names = ", ".join(sorted(undeclared))
                raise ValueError(
                    f"result_data record {index} has undeclared columns: {names}"
                )
        return self


class Warning(BaseModel):
    """Machine-readable analytical limitation."""

    model_config = ConfigDict(extra="forbid")

    type: Literal[
        "age_mismatch",
        "geography_mismatch",
        "year_mismatch",
        "unit_mismatch",
        "missing_dimension",
        "insufficient_data",
        "unsupported_claim",
    ]
    severity: Literal["info", "warning", "blocking"]
    message: str = Field(min_length=1)
    affected_source_ids: list[Identifier]
    context: dict[str, Any] | None = None

    @field_validator("affected_source_ids")
    @classmethod
    def require_unique_sources(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("affected_source_ids must be unique")
        return value


class SourceReference(BaseModel):
    """Stable reference to an installed source and dataset version."""

    model_config = ConfigDict(extra="forbid")

    source_id: Identifier
    title: str = Field(min_length=1)
    agency: str | None = Field(default=None, min_length=1)
    source_url: str | None = Field(default=None, min_length=1)
    dataset_version_id: Identifier


class DatasetVersion(BaseModel):
    """Exact immutable dataset snapshot used by an analysis."""

    model_config = ConfigDict(extra="forbid")

    dataset_version_id: Identifier
    source_id: Identifier
    retrieved_at: datetime
    source_updated_at: datetime | None = None
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    license: str | None = Field(default=None, min_length=1)


class ProvenanceRecord(BaseModel):
    """Connect a deterministic query to its source snapshot."""

    model_config = ConfigDict(extra="forbid")

    source_id: Identifier
    dataset_version_id: Identifier
    query_tool: Identifier
    query_parameters: dict[str, Any]


class AnalysisPlanStep(BaseModel):
    """One completed or skipped step in the public analysis plan."""

    model_config = ConfigDict(extra="forbid")

    step_id: Identifier
    description: str = Field(min_length=1)
    status: Literal["completed", "skipped"]


class VisualizationSpec(BaseModel):
    """Provider-neutral declarative visualization mapping."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["line", "bar", "table"]
    title: str = Field(min_length=1)
    x_field: Identifier | None = None
    y_field: Identifier | None = None
    series_fields: list[Identifier] | None = None
    unit: str | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def require_chart_axes(self) -> Self:
        if self.type in {"line", "bar"} and (
            self.x_field is None or self.y_field is None
        ):
            raise ValueError("line and bar visualizations require x_field and y_field")
        if self.series_fields is not None and len(self.series_fields) != len(
            set(self.series_fields)
        ):
            raise ValueError("visualization series_fields must be unique")
        return self


class AnalysisResult(BaseModel):
    """Contract v0 response consumed directly by the frontend."""

    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["0.1.0"]
    project_id: Identifier
    module_id: Identifier
    upstream_module_ids: list[Identifier]
    title: str = Field(min_length=1, max_length=200)
    question: str = Field(min_length=1, max_length=2_000)
    status: Literal["completed", "partial", "blocked"]
    analysis_plan: list[AnalysisPlanStep]
    filters: dict[str, Any]
    dimensions: list[Identifier]
    result_data: ResultData
    visualization: VisualizationSpec | None = None
    summary: str = Field(min_length=1)
    warnings: list[Warning]
    sources: list[SourceReference]
    dataset_versions: list[DatasetVersion]
    provenance: list[ProvenanceRecord]

    @model_validator(mode="after")
    def validate_cross_references(self) -> Self:
        if len(self.upstream_module_ids) != len(set(self.upstream_module_ids)):
            raise ValueError("upstream_module_ids must be unique")
        if len(self.dimensions) != len(set(self.dimensions)):
            raise ValueError("dimensions must be unique")

        column_names = {column.name for column in self.result_data.columns}
        missing_dimensions = set(self.dimensions) - column_names
        if missing_dimensions:
            names = ", ".join(sorted(missing_dimensions))
            raise ValueError(f"dimensions reference undeclared columns: {names}")

        if self.visualization is not None:
            referenced = {
                field
                for field in (
                    self.visualization.x_field,
                    self.visualization.y_field,
                )
                if field is not None
            }
            referenced.update(self.visualization.series_fields or [])
            missing_fields = referenced - column_names
            if missing_fields:
                names = ", ".join(sorted(missing_fields))
                raise ValueError(
                    f"visualization references undeclared columns: {names}"
                )

        versions = {
            version.dataset_version_id: version
            for version in self.dataset_versions
        }
        if len(versions) != len(self.dataset_versions):
            raise ValueError("dataset_version_id values must be unique")

        sources = {source.source_id: source for source in self.sources}
        if len(sources) != len(self.sources):
            raise ValueError("source_id values must be unique")

        for source in self.sources:
            version = versions.get(source.dataset_version_id)
            if version is None or version.source_id != source.source_id:
                raise ValueError("source references an unknown dataset version")

        for record in self.provenance:
            version = versions.get(record.dataset_version_id)
            if record.source_id not in sources or version is None:
                raise ValueError("provenance references an unknown source or version")
            if version.source_id != record.source_id:
                raise ValueError("provenance source and dataset version do not match")
        return self


class ErrorDetail(BaseModel):
    """Stable public error payload."""

    model_config = ConfigDict(extra="forbid")

    code: Literal[
        "validation_error",
        "module_not_found",
        "provider_unavailable",
        "provider_timeout",
        "agent_protocol_error",
        "max_steps_exceeded",
        "dataset_error",
        "internal_error",
    ]
    message: str = Field(min_length=1)
    retriable: bool
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    """Contract v0 non-success response."""

    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["0.1.0"]
    error: ErrorDetail
