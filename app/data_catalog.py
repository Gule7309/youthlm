"""Catalog of shared data sources actually available to YouthLM notebooks."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.youth_data import get_youth_dataset_metadata


class DataSourceCatalogItem(BaseModel):
    """One installed source that every notebook can query by default."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    title: str
    kind: Literal["structured_government_statistics"]
    scope: Literal["shared"]
    status: Literal["available"]
    default_for_notebooks: bool
    agency: str
    geography: str
    indicator: str
    unit: str
    update_frequency: str
    available_years: dict[str, int]
    available_age_groups: list[str]
    available_sexes: list[str]
    row_count: int
    capabilities: list[str] = Field(default_factory=list)
    source_dataset_page: str
    snapshot_retrieved_at: str
    source_sha256: str
    youth_definition_compatibility: dict[str, str]
    warnings: list[str] = Field(default_factory=list)


class DataSourceCatalog(BaseModel):
    """Frontend-facing list of default shared sources."""

    model_config = ConfigDict(extra="forbid")

    sources: list[DataSourceCatalogItem] = Field(default_factory=list)


def build_default_data_source_catalog() -> DataSourceCatalog:
    """List only sources whose data and query tool ship with this repository."""
    metadata = get_youth_dataset_metadata()
    return DataSourceCatalog(
        sources=[
            DataSourceCatalogItem(
                source_id=metadata["dataset_id"],
                title=metadata["title"],
                kind="structured_government_statistics",
                scope="shared",
                status="available",
                default_for_notebooks=True,
                agency=metadata["agency"],
                geography=metadata["geography"],
                indicator=metadata["indicator"],
                unit=metadata["unit"],
                update_frequency=metadata["update_frequency"],
                available_years=metadata["available_years"],
                available_age_groups=metadata["available_age_groups"],
                available_sexes=metadata["available_sexes"],
                row_count=metadata["snapshot_row_count"],
                capabilities=["filter", "compare", "visualize"],
                source_dataset_page=metadata["source_dataset_page"],
                snapshot_retrieved_at=metadata["snapshot_retrieved_at"],
                source_sha256=metadata["source_sha256"],
                youth_definition_compatibility=metadata[
                    "youth_definition_compatibility"
                ],
                warnings=metadata["warnings"],
            )
        ]
    )
