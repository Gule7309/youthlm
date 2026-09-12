"""Application service for project-scoped presentation generation."""

from collections.abc import Callable
from datetime import UTC, datetime
from hashlib import sha256
from uuid import uuid4

from contract_models import (
    AnalysisResult,
    PresentationRequest,
    PresentationResult,
    Warning,
)
from module_store import ModuleStore
from presentation_generator import (
    PresentationGenerationError,
    PresentationGenerator,
)
from presentation_result_store import (
    InMemoryPresentationResultStore,
    PresentationResultStore,
)
from presentation_store import (
    PresentationArtifactStore,
    PresentationArtifactStoreError,
    StoredPresentationArtifact,
)

PPTX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
)


class PresentationModulesNotFoundError(RuntimeError):
    """Raised when source modules are not visible inside the request project."""

    def __init__(self, module_ids: list[str]) -> None:
        self.module_ids = module_ids
        super().__init__("One or more presentation source modules were not found")


class PresentationModulesBlockedError(RuntimeError):
    """Raised when blocked analytical results are used as deck evidence."""

    def __init__(self, module_ids: list[str]) -> None:
        self.module_ids = module_ids
        super().__init__("Blocked analysis modules cannot generate a presentation")


class PresentationService:
    """Resolve verified modules, generate a deck, and persist the artifact."""

    def __init__(
        self,
        module_store: ModuleStore,
        generator: PresentationGenerator,
        artifact_store: PresentationArtifactStore,
        result_store: PresentationResultStore | None = None,
        *,
        id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._module_store = module_store
        self._generator = generator
        self._artifact_store = artifact_store
        self._result_store = result_store or InMemoryPresentationResultStore()
        self._id_factory = id_factory or (
            lambda: f"presentation_{uuid4().hex}"
        )
        self._clock = clock or (lambda: datetime.now(UTC))

    def create(self, request: PresentationRequest) -> PresentationResult:
        modules = self._load_modules(request)
        blocked_ids = [
            module.module_id for module in modules if module.status == "blocked"
        ]
        if blocked_ids:
            raise PresentationModulesBlockedError(blocked_ids)

        try:
            content = self._generator.generate(request, modules)
        except PresentationGenerationError:
            raise
        except Exception as error:
            raise PresentationGenerationError(
                "Could not generate presentation"
            ) from error

        presentation_id = self._id_factory()
        artifact = self._artifact_store.save(
            request.project_id,
            presentation_id,
            content,
        )
        result = PresentationResult(
            contract_version=request.contract_version,
            project_id=request.project_id,
            presentation_id=presentation_id,
            source_module_ids=request.source_module_ids,
            title=request.title,
            status="ready",
            output_format="pptx",
            media_type=PPTX_MEDIA_TYPE,
            file_name=artifact.file_name,
            file_size_bytes=len(content),
            artifact_sha256=sha256(content).hexdigest(),
            download_url=(
                f"/v1/projects/{request.project_id}/presentations/"
                f"{presentation_id}/download"
            ),
            created_at=self._clock(),
            warnings=self._collect_warnings(modules),
        )
        self._result_store.save(result)
        return result

    def get_artifact(
        self,
        project_id: str,
        presentation_id: str,
    ) -> StoredPresentationArtifact | None:
        return self._artifact_store.get(project_id, presentation_id)

    def get_result(
        self,
        project_id: str,
        presentation_id: str,
    ) -> PresentationResult | None:
        """Return metadata only within the requested project."""
        return self._result_store.get(project_id, presentation_id)

    def _load_modules(
        self,
        request: PresentationRequest,
    ) -> list[AnalysisResult]:
        modules: list[AnalysisResult] = []
        missing_ids: list[str] = []
        for module_id in request.source_module_ids:
            result = self._module_store.get_result(request.project_id, module_id)
            if result is None:
                missing_ids.append(module_id)
            else:
                modules.append(result)
        if missing_ids:
            raise PresentationModulesNotFoundError(missing_ids)
        return modules

    @staticmethod
    def _collect_warnings(modules: list[AnalysisResult]) -> list[Warning]:
        warnings: list[Warning] = []
        seen: set[str] = set()
        for module in modules:
            for warning in module.warnings:
                key = warning.model_dump_json(exclude_none=True)
                if key not in seen:
                    seen.add(key)
                    warnings.append(warning.model_copy(deep=True))
        return warnings


__all__ = [
    "PPTX_MEDIA_TYPE",
    "PresentationArtifactStoreError",
    "PresentationGenerationError",
    "PresentationModulesBlockedError",
    "PresentationModulesNotFoundError",
    "PresentationService",
]
