"""Contract v0 FastAPI boundary for the YouthLM monorepo."""

import os
from collections.abc import Sequence
from typing import Any, Protocol

from app.agent import (
    AgentMaxStepsError,
    AgentProtocolError,
    AgentResult,
    YouthLMAgent,
)
from app.data_catalog import DataSourceCatalog, build_default_data_source_catalog
from app.provider_factory import ProviderConfigurationError, create_model_provider
from app.source_registry import SourceNotFoundError, build_default_source_registry
from app.tooling import build_default_tool_registry
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from contract_adapter import (
    ContractMappingError,
    build_agent_prompt,
    to_contract_result,
)
from contract_models import (
    CONTRACT_VERSION,
    AnalysisRequest,
    AnalysisResult,
    ErrorDetail,
    ErrorResponse,
)
from module_store import (
    ModuleStore,
    ModuleStoreError,
    SQLiteModuleStore,
)

DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


class AgentRunner(Protocol):
    """Injectable application boundary used by the HTTP adapter."""

    def run(self, prompt: str) -> AgentResult: ...


def build_default_agent() -> YouthLMAgent:
    """Compose the real Agent only after the first analysis request."""
    return YouthLMAgent(
        provider=create_model_provider(),
        tools=build_default_tool_registry(),
    )


def build_default_module_store() -> SQLiteModuleStore:
    """Create the local persistent store without opening it eagerly."""
    return SQLiteModuleStore(
        os.getenv("YOUTHLM_SQLITE_PATH", "var/youthlm.sqlite3")
    )


def _error_response(
    status_code: int,
    *,
    code: str,
    message: str,
    retriable: bool,
    details: dict[str, Any] | None = None,
) -> JSONResponse:
    payload = ErrorResponse(
        contract_version=CONTRACT_VERSION,
        error=ErrorDetail(
            code=code,
            message=message,
            retriable=retriable,
            details=details,
        ),
    )
    return JSONResponse(
        status_code=status_code,
        content=payload.model_dump(mode="json", exclude_none=True),
    )


def create_app(
    agent: AgentRunner | None = None,
    *,
    module_store: ModuleStore | None = None,
    cors_origins: Sequence[str] = DEFAULT_CORS_ORIGINS,
) -> FastAPI:
    """Create Contract v0 API with injectable Agent and module storage."""
    application = FastAPI(
        title="YouthLM API",
        version=CONTRACT_VERSION,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(cors_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    active_agent = agent
    active_module_store = module_store or build_default_module_store()
    source_registry = build_default_source_registry()

    def resolve_agent() -> AgentRunner:
        nonlocal active_agent
        if active_agent is None:
            active_agent = build_default_agent()
        return active_agent

    @application.exception_handler(RequestValidationError)
    async def validation_error(
        _request: Any,
        error: RequestValidationError,
    ) -> JSONResponse:
        errors = [
            {
                "location": ".".join(str(part) for part in item["loc"]),
                "message": item["msg"],
                "type": item["type"],
            }
            for item in error.errors()
        ]
        return _error_response(
            422,
            code="validation_error",
            message="Analysis request validation failed",
            retriable=False,
            details={"errors": errors},
        )

    @application.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @application.get("/v1/data-sources", response_model=DataSourceCatalog)
    def data_sources() -> DataSourceCatalog:
        return build_default_data_source_catalog()

    @application.post(
        "/v1/analysis",
        response_model=AnalysisResult,
        response_model_exclude_none=True,
    )
    def analyze(request: AnalysisRequest) -> AnalysisResult | JSONResponse:
        module_contexts = []
        missing_module_ids = []
        try:
            for module_id in request.upstream_module_ids:
                context = active_module_store.get_context(
                    request.project_id,
                    module_id,
                )
                if context is None:
                    missing_module_ids.append(module_id)
                else:
                    module_contexts.append(context)
        except ModuleStoreError:
            return _error_response(
                500,
                code="internal_error",
                message="Module context storage failed",
                retriable=True,
            )

        if missing_module_ids:
            return _error_response(
                404,
                code="module_not_found",
                message="Upstream module context is not available yet",
                retriable=False,
                details={
                    "missing_module_ids": missing_module_ids,
                },
            )

        try:
            for selection in request.source_selections:
                source_registry.inspect_source(selection.source_id)
        except SourceNotFoundError:
            available_source_ids = {
                source.source_id
                for source in source_registry.list_sources()
            }
            return _error_response(
                422,
                code="dataset_error",
                message="One or more selected sources are not available",
                retriable=False,
                details={
                    "unknown_source_ids": [
                        selection.source_id
                        for selection in request.source_selections
                        if selection.source_id not in available_source_ids
                    ],
                },
            )

        try:
            result = resolve_agent().run(
                build_agent_prompt(request, module_contexts)
            )
            contract_result = to_contract_result(request, result)
            active_module_store.save(contract_result)
            return contract_result
        except ProviderConfigurationError:
            return _error_response(
                503,
                code="provider_unavailable",
                message="Model provider is not configured",
                retriable=False,
            )
        except AgentMaxStepsError:
            return _error_response(
                502,
                code="max_steps_exceeded",
                message="Agent could not complete the analysis in time",
                retriable=True,
            )
        except (AgentProtocolError, ContractMappingError):
            return _error_response(
                502,
                code="agent_protocol_error",
                message="Agent returned an invalid analysis result",
                retriable=False,
            )
        except ModuleStoreError:
            return _error_response(
                500,
                code="internal_error",
                message="Module context storage failed",
                retriable=True,
            )
        except RuntimeError:
            return _error_response(
                502,
                code="provider_unavailable",
                message="Model provider request failed",
                retriable=True,
            )

    return application


app = create_app()
