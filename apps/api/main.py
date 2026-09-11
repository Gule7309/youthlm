"""Contract v0 FastAPI boundary for the YouthLM monorepo."""

import logging
import os
import tempfile
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlsplit

from app.agent import (
    AgentMaxStepsError,
    AgentProtocolError,
    AgentResult,
    YouthLMAgent,
)
from app.data_catalog import DataSourceCatalog, build_default_data_source_catalog
from app.data_quality import audit_installed_datasets
from app.population_data import (
    DATASET_ID as POPULATION_DATASET_ID,
)
from app.population_data import (
    PopulationDatasetQueryError,
    query_population_dataset,
)
from app.provider_factory import ProviderConfigurationError, create_model_provider
from app.source_registry import SourceNotFoundError, build_default_source_registry
from app.tooling import build_default_tool_registry
from app.youth_data import (
    DATASET_ID as UNEMPLOYMENT_DATASET_ID,
)
from app.youth_data import (
    YouthDatasetQueryError,
    query_youth_dataset,
)
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from contract_adapter import (
    ContractMappingError,
    build_agent_prompt,
    build_selected_source_completion_guard,
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
REQUIRED_SOURCE_IDS = frozenset(
    {
        "ntpc_population_by_age_sex_district",
        "ntpc_unemployment_by_age_sex",
    }
)
WEB_SERVING_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})
WEB_SERVING_FALSE_VALUES = frozenset({"", "0", "false", "no", "off"})


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


def resolve_cors_origins(
    environment: Mapping[str, str] | None = None,
) -> tuple[str, ...]:
    """Read an exact production origin allowlist without accepting wildcards."""
    active_environment = environment if environment is not None else os.environ
    raw_value = active_environment.get("YOUTHLM_CORS_ORIGINS", "").strip()
    if not raw_value:
        return DEFAULT_CORS_ORIGINS

    origins: list[str] = []
    for raw_origin in raw_value.split(","):
        origin = raw_origin.strip()
        parsed = urlsplit(origin)
        try:
            parsed_port = parsed.port
        except ValueError as error:
            raise RuntimeError("YOUTHLM_CORS_ORIGINS contains an invalid port") from error
        if (
            not origin
            or "*" in origin
            or parsed.scheme not in {"http", "https"}
            or parsed.hostname is None
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path
            or parsed.query
            or parsed.fragment
            or (parsed_port is not None and not 1 <= parsed_port <= 65535)
        ):
            raise RuntimeError(
                "YOUTHLM_CORS_ORIGINS must contain only exact HTTP(S) origins"
            )
        if origin not in origins:
            origins.append(origin)
    return tuple(origins)


def resolve_web_dist_directory(
    environment: Mapping[str, str] | None = None,
) -> Path | None:
    """Resolve an optional built frontend for a same-origin deployment."""
    active_environment = environment if environment is not None else os.environ
    raw_enabled = active_environment.get("YOUTHLM_SERVE_WEB", "").strip().lower()
    if raw_enabled in WEB_SERVING_FALSE_VALUES:
        return None
    if raw_enabled not in WEB_SERVING_TRUE_VALUES:
        raise RuntimeError(
            "YOUTHLM_SERVE_WEB must be a boolean value"
        )

    directory = Path(
        active_environment.get("YOUTHLM_WEB_DIST_DIR", "apps/web/dist")
    )
    if not directory.is_dir() or not (directory / "index.html").is_file():
        raise RuntimeError(
            "YOUTHLM_SERVE_WEB is enabled but the frontend build is missing"
        )
    return directory


def _provider_configuration_present(environment: Mapping[str, str]) -> bool:
    provider = environment.get("MODEL_PROVIDER", "").strip().lower()
    if provider == "gemini":
        return all(
            environment.get(name, "").strip()
            for name in ("GEMINI_API_KEY", "GEMINI_MODEL_ID")
        )
    if provider == "bedrock":
        return all(
            environment.get(name, "").strip()
            for name in ("AWS_REGION", "BEDROCK_MODEL_ID")
        )
    return False


def _directory_is_writable(directory: Path) -> bool:
    try:
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryFile(dir=directory):
            pass
    except OSError:
        return False
    return True


def build_environment_readiness(
    *,
    provider_injected: bool,
    module_storage_injected: bool,
    presentation_storage_injected: bool,
    environment: Mapping[str, str] | None = None,
) -> dict[str, bool]:
    """Return status-only checks; never include credentials or configuration values."""
    active_environment = environment if environment is not None else os.environ
    try:
        data_report = audit_installed_datasets()
        source_ids = {
            source.source_id
            for source in build_default_data_source_catalog().sources
        }
        data_ready = (
            data_report["status"] != "failed"
            and REQUIRED_SOURCE_IDS <= source_ids
        )
    except (OSError, RuntimeError, TypeError, ValueError):
        logger.exception("Readiness could not validate installed datasets")
        data_ready = False

    storage_writable = True
    if not module_storage_injected:
        sqlite_path = Path(
            active_environment.get("YOUTHLM_SQLITE_PATH", "var/youthlm.sqlite3")
        )
        storage_writable = _directory_is_writable(sqlite_path.parent)
    if storage_writable and not presentation_storage_injected:
        artifact_path = Path(
            active_environment.get("YOUTHLM_ARTIFACT_DIR", "var/artifacts")
        )
        storage_writable = _directory_is_writable(artifact_path)

    return {
        "provider_configured": provider_injected
        or _provider_configuration_present(active_environment),
        "data_ready": data_ready,
        "storage_writable": storage_writable,
    }


def _validate_source_filters(source_id: str, filters: dict[str, Any]) -> None:
    arguments = {"dataset_id": source_id, **filters}
    if source_id == POPULATION_DATASET_ID:
        query_population_dataset(arguments)
    elif source_id == UNEMPLOYMENT_DATASET_ID:
        query_youth_dataset(arguments)


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
    readiness_probe: Callable[[], dict[str, bool]] | None = None,
    web_directory: str | Path | None = None,
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
    enforce_selected_source_protocol = agent is None
    active_module_store = module_store or build_default_module_store()
    active_presentation_service = (
        presentation_service
        or build_default_presentation_service(active_module_store)
    )
    source_registry = build_default_source_registry()
    active_readiness_probe = readiness_probe or (
        lambda: build_environment_readiness(
            provider_injected=agent is not None,
            module_storage_injected=module_store is not None,
            presentation_storage_injected=presentation_service is not None,
        )
    )

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

    @application.get("/ready")
    def ready() -> JSONResponse:
        components = active_readiness_probe()
        is_ready = bool(components) and all(components.values())
        return JSONResponse(
            status_code=200 if is_ready else 503,
            content={
                "status": "ready" if is_ready else "not_ready",
                "components": components,
            },
        )

    @application.get("/v1/data-sources", response_model=DataSourceCatalog)
    def data_sources() -> DataSourceCatalog:
        return build_default_data_source_catalog()

    @application.post(
        "/v1/analysis",
        response_model=AnalysisResult,
        response_model_exclude_none=True,
    )
    def analyze(request: AnalysisRequest) -> AnalysisResult | JSONResponse:
        if len(request.source_selections) > 1:
            return _error_response(
                422,
                code="dataset_error",
                message=(
                    "Contract v0 supports one raw source per analysis module"
                ),
                retriable=False,
                details={
                    "maximum_source_selections": 1,
                    "selected_source_ids": [
                        selection.source_id
                        for selection in request.source_selections
                    ],
                },
            )

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
            for selection in request.source_selections:
                _validate_source_filters(selection.source_id, selection.filters)
        except (PopulationDatasetQueryError, YouthDatasetQueryError) as error:
            return _error_response(
                422,
                code="dataset_error",
                message="Selected source filters cannot be queried safely",
                retriable=False,
                details={"reason": str(error)},
            )

        try:
            analysis_agent = resolve_agent()
            prompt = build_agent_prompt(request, module_contexts)
            if (
                enforce_selected_source_protocol
                and isinstance(analysis_agent, YouthLMAgent)
            ):
                result = analysis_agent.run(
                    prompt,
                    completion_guard=build_selected_source_completion_guard(
                        request,
                        source_registry,
                    ),
                )
            else:
                result = analysis_agent.run(prompt)
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
        except AgentProtocolError:
            logger.exception(
                "Model response violated the agent protocol "
                "project_id=%s module_id=%s",
                request.project_id,
                request.module_id,
            )
            return _error_response(
                502,
                code="agent_protocol_error",
                message="Agent returned an invalid analysis result",
                retriable=True,
            )
        except ContractMappingError:
            logger.exception(
                "Agent result violated the analysis contract "
                "project_id=%s module_id=%s",
                request.project_id,
                request.module_id,
            )
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

    if web_directory is not None:
        resolved_web_directory = Path(web_directory)
        if not resolved_web_directory.is_dir() or not (
            resolved_web_directory / "index.html"
        ).is_file():
            raise RuntimeError("Frontend build directory is invalid")
        # Keep this mount after every API route so /v1, /health and /ready
        # cannot be shadowed by frontend files.
        application.mount(
            "/",
            StaticFiles(directory=resolved_web_directory, html=True),
            name="web",
        )

    return application


app = create_app(
    cors_origins=resolve_cors_origins(),
    web_directory=resolve_web_dist_directory(),
)
