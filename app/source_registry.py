"""Shared source metadata, discovery, and deterministic compatibility checks."""

import re
from collections.abc import Sequence
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.population_data import get_population_dataset_metadata
from app.youth_data import get_youth_dataset_metadata

CompatibilityStatus = Literal["exact", "partial", "estimated", "incompatible"]
SourceStatus = Literal["available", "catalog_only", "document"]
SEARCH_STOP_WORDS = frozenset(
    {"and", "by", "data", "dataset", "for", "from", "of", "the", "with"}
)
SEARCH_CJK_STOP_PHRASES = (
    "官方",
    "政府",
    "新北市",
    "統計",
    "資料集",
    "資料",
    "數據",
)


class SourceRegistryError(ValueError):
    """Base error for invalid source-registry operations."""


class SourceNotFoundError(SourceRegistryError):
    """Raised when a requested source ID is absent from the registry."""


class AgeBand(BaseModel):
    """One indivisible published age band."""

    model_config = ConfigDict(extra="forbid")

    label: str
    min_age: int
    max_age: int


class AgeDefinition(BaseModel):
    """Age semantics required for safe filtering and claims."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["grouped"]
    bands: list[AgeBand]
    can_split_bands: bool
    rate_has_numerator_denominator: bool


class YouthCompatibility(BaseModel):
    """How an entire source relates to YouthLM's 18–35 target."""

    model_config = ConfigDict(extra="forbid")

    target: str
    status: CompatibilityStatus
    explanation: str


class DatasetVersion(BaseModel):
    """Immutable identity of the installed data snapshot."""

    model_config = ConfigDict(extra="forbid")

    version_id: str
    retrieved_at: str
    source_sha256: str


class SourceMetadata(BaseModel):
    """Statistical meaning and operational state of one shared source."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    title: str
    agency: str
    policy_domain: str
    source_url: str
    source_download_url: str
    format: Literal["csv"]
    structured_or_document: Literal["structured"]
    status: SourceStatus
    scope: Literal["shared"]
    default_for_notebooks: bool
    geography: str
    geography_level: str
    available_geographies: list[str]
    age_definition: AgeDefinition
    sex_dimension: bool
    time_range: dict[str, int]
    time_granularity: Literal["annual"]
    unit: str
    available_dimensions: list[str]
    update_frequency: str
    last_synced_at: str
    join_keys: list[str]
    youth_compatibility: YouthCompatibility
    known_limitations: list[str]
    dataset_version: DatasetVersion
    capabilities: list[str]
    query_tool: str
    indicator: str
    row_count: int

    # Backward-compatible fields already consumed by the v0 frontend API.
    kind: Literal["structured_government_statistics"]
    available_years: dict[str, int]
    available_age_groups: list[str]
    available_sexes: list[str]
    source_dataset_page: str
    snapshot_retrieved_at: str
    source_sha256: str
    youth_definition_compatibility: dict[str, str]
    warnings: list[str]


class SourceSummary(BaseModel):
    """Compact discovery result that points the Agent to inspection."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    title: str
    agency: str
    policy_domain: str
    status: SourceStatus
    geography: str
    time_range: dict[str, int]
    capabilities: list[str]


class CompatibilityRequest(BaseModel):
    """Dimensions in the user's intended statistical claim."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    min_age: int | None = Field(default=None, ge=0, le=120)
    max_age: int | None = Field(default=None, ge=0, le=120)
    start_year: int | None = None
    end_year: int | None = None
    geography: str | None = None
    sexes: list[str] | None = None
    unit: str | None = None

    @model_validator(mode="after")
    def validate_ranges(self) -> "CompatibilityRequest":
        if (self.min_age is None) != (self.max_age is None):
            raise ValueError("min_age and max_age must be provided together")
        if self.min_age is not None and self.min_age > self.max_age:
            raise ValueError("min_age must not exceed max_age")
        if (self.start_year is None) != (self.end_year is None):
            raise ValueError("start_year and end_year must be provided together")
        if self.start_year is not None and self.start_year > self.end_year:
            raise ValueError("start_year must not exceed end_year")
        if self.sexes is not None and not self.sexes:
            raise ValueError("sexes must not be empty")
        return self


class DimensionCompatibility(BaseModel):
    """Compatibility decision for one statistical dimension."""

    model_config = ConfigDict(extra="forbid")

    dimension: str
    status: CompatibilityStatus
    requested: Any
    available: Any
    explanation: str


class CompatibilityReport(BaseModel):
    """Deterministic evidence for accepting, narrowing, or refusing a claim."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    overall_status: CompatibilityStatus
    safe_to_query: bool
    safe_to_claim_requested_scope: bool
    refusal_required: bool
    checks: list[DimensionCompatibility]
    limitations: list[str]
    recommended_claim: str


class SourceRegistry:
    """Discover and inspect sources without exposing arbitrary storage access."""

    def __init__(self, sources: Sequence[SourceMetadata]) -> None:
        self._sources: dict[str, SourceMetadata] = {}
        for source in sources:
            if source.source_id in self._sources:
                raise SourceRegistryError(
                    f"Duplicate source_id: {source.source_id}"
                )
            self._sources[source.source_id] = source

    def list_sources(self) -> list[SourceMetadata]:
        return list(self._sources.values())

    def search_sources(
        self,
        query: str,
        *,
        status: SourceStatus | None = None,
        policy_domain: str | None = None,
    ) -> list[SourceSummary]:
        normalized_query = query.strip().casefold()
        if not normalized_query:
            raise SourceRegistryError("query must not be blank")

        matches: list[SourceSummary] = []
        for source in self._sources.values():
            if status is not None and source.status != status:
                continue
            if (
                policy_domain is not None
                and source.policy_domain.casefold() != policy_domain.casefold()
            ):
                continue

            searchable = " ".join(
                [
                    source.source_id,
                    source.title,
                    source.agency,
                    source.policy_domain,
                    source.indicator,
                    source.geography,
                    *source.capabilities,
                ]
            ).casefold()
            if not _matches_search_query(normalized_query, searchable):
                continue
            matches.append(
                SourceSummary(
                    source_id=source.source_id,
                    title=source.title,
                    agency=source.agency,
                    policy_domain=source.policy_domain,
                    status=source.status,
                    geography=source.geography,
                    time_range=source.time_range,
                    capabilities=source.capabilities,
                )
            )
        return matches

    def inspect_source(self, source_id: str) -> SourceMetadata:
        source = self._sources.get(source_id)
        if source is None:
            raise SourceNotFoundError(f"Unknown source_id: {source_id}")
        return source

    def check_compatibility(
        self,
        request: CompatibilityRequest,
    ) -> CompatibilityReport:
        source = self.inspect_source(request.source_id)
        checks: list[DimensionCompatibility] = []

        if request.min_age is not None:
            checks.append(_check_age(source, request.min_age, request.max_age))
        if request.start_year is not None:
            checks.append(
                _check_years(source, request.start_year, request.end_year)
            )
        if request.geography is not None:
            checks.append(_check_geography(source, request.geography))
        if request.sexes is not None:
            checks.append(_check_sexes(source, request.sexes))
        if request.unit is not None:
            checks.append(_check_unit(source, request.unit))

        statuses = {check.status for check in checks}
        if "incompatible" in statuses:
            overall_status: CompatibilityStatus = "incompatible"
        elif "partial" in statuses:
            overall_status = "partial"
        elif "estimated" in statuses:
            overall_status = "estimated"
        else:
            overall_status = "exact"

        safe_to_query = overall_status != "incompatible"
        safe_to_claim = overall_status == "exact"
        available_bands = ", ".join(source.available_age_groups)
        if safe_to_claim:
            recommended_claim = "Requested scope is supported by the source."
        elif safe_to_query:
            recommended_claim = (
                "Narrow the claim to the source's published groups and state the "
                f"limitation explicitly. Available age groups: {available_bands}."
            )
        else:
            recommended_claim = (
                "Do not produce the requested statistical claim from this source."
            )

        return CompatibilityReport(
            source_id=source.source_id,
            overall_status=overall_status,
            safe_to_query=safe_to_query,
            safe_to_claim_requested_scope=safe_to_claim,
            refusal_required=not safe_to_claim,
            checks=checks,
            limitations=source.known_limitations,
            recommended_claim=recommended_claim,
        )


def _matches_search_query(normalized_query: str, searchable: str) -> bool:
    if normalized_query in searchable:
        return True

    query_terms = {
        term
        for term in normalized_query.replace("_", " ").replace("-", " ").split()
        if len(term) >= 3 and term not in SEARCH_STOP_WORDS
    }
    query_terms.update(_cjk_search_terms(normalized_query))
    return any(term in searchable for term in query_terms)


def _cjk_search_terms(query: str) -> set[str]:
    simplified = query
    for phrase in SEARCH_CJK_STOP_PHRASES:
        simplified = simplified.replace(phrase, " ")

    terms: set[str] = set()
    for segment in re.findall(r"[\u4e00-\u9fff]+", simplified):
        if len(segment) <= 2:
            terms.add(segment)
            continue
        terms.update(
            segment[index : index + 2]
            for index in range(len(segment) - 1)
        )
    return terms


def build_default_source_registry() -> SourceRegistry:
    """Build the registry from data and metadata installed in this repository."""
    population_metadata = get_population_dataset_metadata()
    return SourceRegistry(
        [
            _build_source(
                get_youth_dataset_metadata(),
                policy_domain="employment",
                geography_level="municipality",
                available_geographies=["新北市"],
                available_dimensions=["year", "age_group", "sex"],
                join_keys=["year", "age_group", "sex"],
                capabilities=["filter", "compare", "visualize"],
                query_tool="query_youth_dataset",
            ),
            _build_source(
                population_metadata,
                policy_domain="demographics",
                geography_level="municipality_and_district",
                available_geographies=population_metadata[
                    "available_geographies"
                ],
                available_dimensions=[
                    "year",
                    "geography",
                    "age_group",
                    "sex",
                ],
                join_keys=["year", "geography", "age_group", "sex"],
                capabilities=["filter", "compare", "visualize", "map"],
                query_tool="query_population_dataset",
            ),
        ]
    )


def _build_source(
    metadata: dict[str, Any],
    *,
    policy_domain: str,
    geography_level: str,
    available_geographies: list[str],
    available_dimensions: list[str],
    join_keys: list[str],
    capabilities: list[str],
    query_tool: str,
) -> SourceMetadata:
    raw_age_bands = metadata.get("age_bands")
    if raw_age_bands is None:
        raw_age_bands = [
            {
                "label": label,
                "min_age": int(label.split("-", maxsplit=1)[0]),
                "max_age": int(label.split("-", maxsplit=1)[1]),
            }
            for label in metadata["available_age_groups"]
        ]

    compatibility = YouthCompatibility.model_validate(
        metadata["youth_definition_compatibility"]
    )
    version = DatasetVersion(
        version_id=(
            f"{metadata['snapshot_retrieved_at']}:"
            f"{metadata['source_sha256'][:12]}"
        ),
        retrieved_at=metadata["snapshot_retrieved_at"],
        source_sha256=metadata["source_sha256"],
    )

    return SourceMetadata(
        source_id=metadata["dataset_id"],
        title=metadata["title"],
        agency=metadata["agency"],
        policy_domain=policy_domain,
        source_url=metadata["source_dataset_page"],
        source_download_url=metadata["source_download_url"],
        format="csv",
        structured_or_document="structured",
        status="available",
        scope="shared",
        default_for_notebooks=True,
        geography=metadata["geography"],
        geography_level=geography_level,
        available_geographies=available_geographies,
        age_definition=AgeDefinition(
            kind="grouped",
            bands=[AgeBand.model_validate(band) for band in raw_age_bands],
            can_split_bands=False,
            rate_has_numerator_denominator=False,
        ),
        sex_dimension=True,
        time_range=metadata["available_years"],
        time_granularity="annual",
        unit=metadata["unit"],
        available_dimensions=available_dimensions,
        update_frequency=metadata["update_frequency"],
        last_synced_at=metadata["snapshot_retrieved_at"],
        join_keys=join_keys,
        youth_compatibility=compatibility,
        known_limitations=metadata["warnings"],
        dataset_version=version,
        capabilities=capabilities,
        query_tool=query_tool,
        indicator=metadata["indicator"],
        row_count=metadata["snapshot_row_count"],
        kind="structured_government_statistics",
        available_years=metadata["available_years"],
        available_age_groups=metadata["available_age_groups"],
        available_sexes=metadata["available_sexes"],
        source_dataset_page=metadata["source_dataset_page"],
        snapshot_retrieved_at=metadata["snapshot_retrieved_at"],
        source_sha256=metadata["source_sha256"],
        youth_definition_compatibility=metadata[
            "youth_definition_compatibility"
        ],
        warnings=metadata["warnings"],
    )


def _check_age(
    source: SourceMetadata,
    min_age: int,
    max_age: int,
) -> DimensionCompatibility:
    requested = set(range(min_age, max_age + 1))
    published = set()
    selectable = set()
    for band in source.age_definition.bands:
        band_ages = set(range(band.min_age, band.max_age + 1))
        published.update(band_ages)
        if band_ages <= requested:
            selectable.update(band_ages)

    if selectable == requested:
        status: CompatibilityStatus = "exact"
        explanation = "Requested ages are exactly representable by published bands."
    elif requested & published:
        status = "partial"
        explanation = (
            "Published age bands overlap the request but cannot reconstruct its "
            "full scope exactly. Published groups must not be split or "
            "proportionally estimated."
        )
    else:
        status = "incompatible"
        explanation = "The source has no published age band overlapping the request."

    return DimensionCompatibility(
        dimension="age",
        status=status,
        requested={"min_age": min_age, "max_age": max_age},
        available=source.available_age_groups,
        explanation=explanation,
    )


def _check_years(
    source: SourceMetadata,
    start_year: int,
    end_year: int,
) -> DimensionCompatibility:
    available_start = source.time_range["start"]
    available_end = source.time_range["end"]
    if available_start <= start_year and end_year <= available_end:
        status: CompatibilityStatus = "exact"
        explanation = "Requested years are fully available."
    elif end_year < available_start or start_year > available_end:
        status = "incompatible"
        explanation = "Requested years do not overlap the installed source version."
    else:
        status = "partial"
        explanation = "Only part of the requested year range is available."
    return DimensionCompatibility(
        dimension="year",
        status=status,
        requested={"start": start_year, "end": end_year},
        available=source.time_range,
        explanation=explanation,
    )


def _check_geography(
    source: SourceMetadata,
    geography: str,
) -> DimensionCompatibility:
    normalized = geography.strip().casefold()
    exact = any(
        normalized == available.casefold()
        for available in source.available_geographies
    )
    return DimensionCompatibility(
        dimension="geography",
        status="exact" if exact else "incompatible",
        requested=geography,
        available=source.available_geographies,
        explanation=(
            "Requested geography matches the source."
            if exact
            else "The source cannot support a claim for the requested geography."
        ),
    )


def _check_sexes(
    source: SourceMetadata,
    sexes: list[str],
) -> DimensionCompatibility:
    requested = set(sexes)
    available = set(source.available_sexes)
    if requested <= available:
        status: CompatibilityStatus = "exact"
        explanation = "Requested sex categories are available separately."
    elif requested & available:
        status = "partial"
        explanation = "Only some requested sex categories are available."
    else:
        status = "incompatible"
        explanation = (
            "Requested sex categories are unavailable; an all-sex rate must not "
            "be invented from an unweighted average."
        )
    return DimensionCompatibility(
        dimension="sex",
        status=status,
        requested=sexes,
        available=source.available_sexes,
        explanation=explanation,
    )


def _check_unit(
    source: SourceMetadata,
    unit: str,
) -> DimensionCompatibility:
    exact = unit.strip().casefold() == source.unit.casefold()
    return DimensionCompatibility(
        dimension="unit",
        status="exact" if exact else "incompatible",
        requested=unit,
        available=source.unit,
        explanation=(
            "Requested unit matches the source."
            if exact
            else "No deterministic unit conversion is registered for this source."
        ),
    )
