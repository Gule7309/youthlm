"""Frontend catalog of sources mounted into YouthLM notebooks."""

from pydantic import BaseModel, ConfigDict, Field

from app.source_registry import SourceMetadata, build_default_source_registry


class DataSourceCatalog(BaseModel):
    """Frontend-facing list of default shared sources."""

    model_config = ConfigDict(extra="forbid")

    sources: list[SourceMetadata] = Field(default_factory=list)


def build_default_data_source_catalog() -> DataSourceCatalog:
    """List only sources whose data and query tool ship with this repository."""
    return DataSourceCatalog(
        sources=build_default_source_registry().list_sources()
    )
