"""Contract v0 FastAPI boundary for the YouthLM monorepo."""

import logging
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
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

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
    PresentationRequest,
    PresentationResult,
)
from module_store import (
    ModuleStore,
    ModuleStoreError,
    SQLiteModuleStore,
)
from presentation_generator import (
    PptxPresentationGenerator,
    PresentationGenerationError,
)
from presentation_service import (
    PPTX_MEDIA_TYPE,
    PresentationModulesBlockedError,
    PresentationModulesNotFoundError,
    PresentationService,
)
from presentation_store import (
    LocalPresentationArtifactStore,
    PresentationArtifactStoreError,
)

logger = logging.getLogger(__name__)

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


def build_default_presentation_service(
    module_store: ModuleStore,
) -> PresentationService:
    """Compose deterministic PPTX generation over local project storage."""
    return PresentationService(
        module_store=module_store,
        generator=PptxPresentationGenerator(),
        artifact_store=LocalPresentationArtifactStore(
            os.getenv("YOUTHLM_ARTIFACT_DIR", "var/artifacts")
        ),
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
    presentation_service: PresentationService | None = None,
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
    active_presentation_service = (
        presentation_service
        or build_default_presentation_service(active_module_store)
    )
    source_registry = build_default_source_registry()

    def resolve_agent() -> AgentRunner:
        nonlocal active_agent
        if active_agent is None:
            active_agent = build_default_agent()
        return active_agent

    @application.exception_handler(RequestValidationError)
    async def validation_error(
        request: Request,
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
            message=(
                "Presentation request validation failed"
                if request.url.path == "/v1/presentations"
                else "Analysis request validation failed"
            ),
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
            logger.exception("Agent result violated the analysis contract")
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
            logger.exception("Model provider request failed during analysis")
            return _error_response(
                502,
                code="provider_unavailable",
                message="Model provider request failed",
                retriable=True,
            )

    @application.post(
        "/v1/presentations",
        response_model=PresentationResult,
        response_model_exclude_none=True,
        status_code=201,
    )
    def create_presentation(
        request: PresentationRequest,
    ) -> PresentationResult | JSONResponse:
        try:
            return active_presentation_service.create(request)
        except PresentationModulesNotFoundError as error:
            return _error_response(
                404,
                code="module_not_found",
                message="One or more presentation source modules are not available",
                retriable=False,
                details={"missing_module_ids": error.module_ids},
            )
        except PresentationModulesBlockedError as error:
            return _error_response(
                422,
                code="dataset_error",
                message="Blocked analysis modules cannot generate a presentation",
                retriable=False,
                details={"blocked_module_ids": error.module_ids},
            )
        except ModuleStoreError:
            return _error_response(
                500,
                code="internal_error",
                message="Module context storage failed",
                retriable=True,
            )
        except PresentationGenerationError:
            return _error_response(
                500,
                code="internal_error",
                message="Presentation generation failed",
                retriable=True,
            )
        except PresentationArtifactStoreError:
            logger.exception("Presentation artifact storage failed")
            return _error_response(
                500,
                code="internal_error",
                message="Presentation artifact storage failed",
                retriable=True,
            )

    @application.get(
        "/v1/projects/{project_id}/presentations/{presentation_id}/download",
        response_class=FileResponse,
        response_model=None,
    )
    def download_presentation(
        project_id: str,
        presentation_id: str,
    ) -> FileResponse | JSONResponse:
        try:
            artifact = active_presentation_service.get_artifact(
                project_id,
                presentation_id,
            )
        except PresentationArtifactStoreError:
            logger.exception("Presentation artifact storage failed")
            return _error_response(
                500,
                code="internal_error",
                message="Presentation artifact storage failed",
                retriable=True,
            )

        if artifact is None:
            return _error_response(
                404,
                code="module_not_found",
                message="Presentation artifact is not available",
                retriable=False,
                details={"presentation_id": presentation_id},
            )
        return FileResponse(
            artifact.path,
            media_type=PPTX_MEDIA_TYPE,
            filename=artifact.file_name,
        )

    return application


app = create_app()
