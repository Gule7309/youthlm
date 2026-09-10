"""Application service for project-scoped report generation."""

from collections.abc import Callable
from datetime import UTC, datetime
from hashlib import sha256
from uuid import uuid4

from contract_models import AnalysisResult, ReportRequest, ReportResult, Warning
from module_store import ModuleStore
from report_generator import ReportGenerationError, ReportGenerator
from report_result_store import InMemoryReportResultStore, ReportResultStore
from report_store import (
    ReportArtifactStore,
    ReportArtifactStoreError,
    StoredReportArtifact,
)

DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


class ReportModulesNotFoundError(RuntimeError):
    """Raised when source modules are not visible inside the request project."""

    def __init__(self, module_ids: list[str]) -> None:
        self.module_ids = module_ids
        super().__init__("One or more report source modules were not found")


class ReportModulesBlockedError(RuntimeError):
    """Raised when blocked analytical results are used as report evidence."""

    def __init__(self, module_ids: list[str]) -> None:
        self.module_ids = module_ids
        super().__init__("Blocked analysis modules cannot generate a report")


class ReportService:
    """Resolve verified modules, generate a DOCX, and persist the artifact."""

    def __init__(
        self,
        module_store: ModuleStore,
        generator: ReportGenerator,
        artifact_store: ReportArtifactStore,
        result_store: ReportResultStore | None = None,
        *,
        id_factory: Callable[[], str] | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._module_store = module_store
        self._generator = generator
        self._artifact_store = artifact_store
        self._result_store = result_store or InMemoryReportResultStore()
        self._id_factory = id_factory or (lambda: f"report_{uuid4().hex}")
        self._clock = clock or (lambda: datetime.now(UTC))

    def create(self, request: ReportRequest) -> ReportResult:
        modules = self._load_modules(request)
        blocked_ids = [
            module.module_id for module in modules if module.status == "blocked"
        ]
        if blocked_ids:
            raise ReportModulesBlockedError(blocked_ids)
        try:
            content = self._generator.generate(request, modules)
        except ReportGenerationError:
            raise
        except Exception as error:
            raise ReportGenerationError("Could not generate report") from error

        report_id = self._id_factory()
        artifact = self._artifact_store.save(
            request.project_id,
            report_id,
            content,
        )
        result = ReportResult(
            contract_version=request.contract_version,
            project_id=request.project_id,
            report_id=report_id,
            source_module_ids=request.source_module_ids,
            title=request.title,
            status="ready",
            output_format="docx",
            media_type=DOCX_MEDIA_TYPE,
            file_name=artifact.file_name,
            file_size_bytes=len(content),
            artifact_sha256=sha256(content).hexdigest(),
            download_url=(
                f"/v1/projects/{request.project_id}/reports/{report_id}/download"
            ),
            created_at=self._clock(),
            warnings=self._collect_warnings(modules),
        )
        self._result_store.save(result)
        return result

    def get_artifact(
        self,
        project_id: str,
        report_id: str,
    ) -> StoredReportArtifact | None:
        return self._artifact_store.get(project_id, report_id)

    def get_result(self, project_id: str, report_id: str) -> ReportResult | None:
        return self._result_store.get(project_id, report_id)

    def _load_modules(self, request: ReportRequest) -> list[AnalysisResult]:
        modules: list[AnalysisResult] = []
        missing_ids: list[str] = []
        for module_id in request.source_module_ids:
            result = self._module_store.get_result(request.project_id, module_id)
            if result is None:
                missing_ids.append(module_id)
            else:
                modules.append(result)
        if missing_ids:
            raise ReportModulesNotFoundError(missing_ids)
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
    "DOCX_MEDIA_TYPE",
    "ReportArtifactStoreError",
    "ReportGenerationError",
    "ReportModulesBlockedError",
    "ReportModulesNotFoundError",
    "ReportService",
]
