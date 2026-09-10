"""Project-scoped local storage for generated report artifacts."""

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Protocol
from uuid import uuid4

OPAQUE_KEY_HEX_LENGTH = 32


class ReportArtifactStoreError(RuntimeError):
    """Raised when a report artifact cannot be stored or loaded."""


@dataclass(frozen=True)
class StoredReportArtifact:
    """Filesystem handle returned only after a stored artifact is verified."""

    path: Path
    file_name: str


class ReportArtifactStore(Protocol):
    """Storage boundary for project-owned report bytes."""

    def save(
        self,
        project_id: str,
        report_id: str,
        content: bytes,
    ) -> StoredReportArtifact: ...

    def get(
        self,
        project_id: str,
        report_id: str,
    ) -> StoredReportArtifact | None: ...


class LocalReportArtifactStore:
    """Store DOCX files under opaque project and artifact keys."""

    def __init__(self, root_directory: str | Path) -> None:
        self._root_directory = Path(root_directory)

    def save(
        self,
        project_id: str,
        report_id: str,
        content: bytes,
    ) -> StoredReportArtifact:
        if not content:
            raise ReportArtifactStoreError("Report artifact is empty")
        path = self._artifact_path(project_id, report_id)
        temporary_path = self._temporary_path(path)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary_path.write_bytes(content)
            temporary_path.replace(path)
        except OSError as error:
            try:
                temporary_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise ReportArtifactStoreError(
                "Could not persist report artifact"
            ) from error
        return StoredReportArtifact(path=path, file_name=f"{report_id}.docx")

    def get(
        self,
        project_id: str,
        report_id: str,
    ) -> StoredReportArtifact | None:
        path = self._artifact_path(project_id, report_id)
        try:
            if not path.is_file():
                return None
        except OSError as error:
            raise ReportArtifactStoreError(
                "Could not load report artifact"
            ) from error
        return StoredReportArtifact(path=path, file_name=f"{report_id}.docx")

    def _artifact_path(self, project_id: str, report_id: str) -> Path:
        project_key = self._opaque_key(project_id)
        artifact_key = self._opaque_key(report_id)
        return self._root_directory / project_key / f"{artifact_key}.docx"

    @staticmethod
    def _opaque_key(value: str) -> str:
        return sha256(value.encode("utf-8")).hexdigest()[:OPAQUE_KEY_HEX_LENGTH]

    @staticmethod
    def _temporary_path(path: Path) -> Path:
        return path.with_name(f".tmp-{uuid4().hex}")
