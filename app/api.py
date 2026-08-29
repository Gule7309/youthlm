"""FastAPI boundary for the provider-neutral YouthLM application core."""

from collections.abc import Sequence
from typing import Protocol

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.agent import (
    AgentMaxStepsError,
    AgentProtocolError,
    AgentResult,
    YouthLMAgent,
)
from app.data_catalog import DataSourceCatalog, build_default_data_source_catalog
from app.provider_factory import ProviderConfigurationError, create_model_provider
from app.tooling import build_default_tool_registry

DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


class AgentRunner(Protocol):
    """Small injectable application boundary used by the HTTP adapter."""

    def run(self, prompt: str) -> AgentResult: ...


class AnalysisRequest(BaseModel):
    """One user question submitted by a notebook or frontend."""

    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=2_000)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("question must not be blank")
        return normalized


class HealthResponse(BaseModel):
    """Dependency-free process health response."""

    model_config = ConfigDict(extra="forbid")

    status: str


def build_default_agent() -> YouthLMAgent:
    """Compose the real application only after the first analysis request."""
    return YouthLMAgent(
        provider=create_model_provider(),
        tools=build_default_tool_registry(),
    )


def create_app(
    agent: AgentRunner | None = None,
    *,
    cors_origins: Sequence[str] = DEFAULT_CORS_ORIGINS,
) -> FastAPI:
    """Create an HTTP adapter with an optional deterministic test agent."""
    application = FastAPI(
        title="YouthLM Agent API",
        version="0.1.0",
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    active_agent = agent

    def resolve_agent() -> AgentRunner:
        nonlocal active_agent
        if active_agent is None:
            active_agent = build_default_agent()
        return active_agent

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @application.get("/v1/data-sources", response_model=DataSourceCatalog)
    def data_sources() -> DataSourceCatalog:
        return build_default_data_source_catalog()

    @application.post("/v1/analysis", response_model=AgentResult)
    def analyze(request: AnalysisRequest) -> AgentResult:
        try:
            return resolve_agent().run(request.question)
        except ProviderConfigurationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except (AgentProtocolError, AgentMaxStepsError) as error:
            raise HTTPException(status_code=502, detail=str(error)) from error
        except RuntimeError as error:
            raise HTTPException(
                status_code=502,
                detail="Model provider request failed",
            ) from error

    return application


app = create_app()
