"""Project-scoped local storage for generated presentation artifacts."""

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Protocol
from uuid import uuid4


class PresentationArtifactStoreError(RuntimeError):
    """Raised when a presentation artifact cannot be stored or loaded."""


@dataclass(frozen=True)
class StoredPresentationArtifact:
    """Filesystem handle returned only after a stored artifact is verified."""

    path: Path
    file_name: str


class PresentationArtifactStore(Protocol):
    """Storage boundary for project-scoped presentation files."""

    def save(
        self,
        project_id: str,
        presentation_id: str,
        content: bytes,
    ) -> StoredPresentationArtifact: ...

    def get(
        self,
        project_id: str,
        presentation_id: str,
    ) -> StoredPresentationArtifact | None: ...


class LocalPresentationArtifactStore:
    """Store PPTX files under opaque, project-scoped filesystem keys."""

    def __init__(self, root_directory: str | Path) -> None:
        self._root_directory = Path(root_directory)

    def save(
        self,
        project_id: str,
        presentation_id: str,
        content: bytes,
    ) -> StoredPresentationArtifact:
        if not content:
            raise PresentationArtifactStoreError("Presentation artifact is empty")

        path = self._artifact_path(project_id, presentation_id)
        temporary_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary_path.write_bytes(content)
            temporary_path.replace(path)
        except OSError as error:
            try:
                temporary_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise PresentationArtifactStoreError(
                "Could not persist presentation artifact"
            ) from error

        return StoredPresentationArtifact(
            path=path,
            file_name=f"{presentation_id}.pptx",
        )

    def get(
        self,
        project_id: str,
        presentation_id: str,
    ) -> StoredPresentationArtifact | None:
        path = self._artifact_path(project_id, presentation_id)
        try:
            if not path.is_file():
                return None
        except OSError as error:
            raise PresentationArtifactStoreError(
                "Could not load presentation artifact"
            ) from error
        return StoredPresentationArtifact(
            path=path,
            file_name=f"{presentation_id}.pptx",
        )

    def _artifact_path(self, project_id: str, presentation_id: str) -> Path:
        project_key = sha256(project_id.encode("utf-8")).hexdigest()
        artifact_key = sha256(presentation_id.encode("utf-8")).hexdigest()
        return self._root_directory / project_key / f"{artifact_key}.pptx"
