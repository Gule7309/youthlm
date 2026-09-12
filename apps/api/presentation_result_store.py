"""Project-scoped persistence for PresentationResult metadata."""

import json
import sqlite3
from pathlib import Path
from typing import Protocol

from contract_models import PresentationResult


class PresentationResultStoreError(RuntimeError):
    """Raised when presentation metadata cannot be safely stored or loaded."""


class PresentationResultStore(Protocol):
    """Application boundary for project-scoped presentation metadata."""

    def save(self, result: PresentationResult) -> None: ...

    def get(
        self,
        project_id: str,
        presentation_id: str,
    ) -> PresentationResult | None: ...


class InMemoryPresentationResultStore:
    """Deterministic test double for presentation metadata."""

    def __init__(self) -> None:
        self._results: dict[tuple[str, str], PresentationResult] = {}

    def save(self, result: PresentationResult) -> None:
        self._results[(result.project_id, result.presentation_id)] = result.model_copy(
            deep=True
        )

    def get(
        self,
        project_id: str,
        presentation_id: str,
    ) -> PresentationResult | None:
        result = self._results.get((project_id, presentation_id))
        return result.model_copy(deep=True) if result is not None else None


class SQLitePresentationResultStore:
    """Persist presentation metadata under a composite project key."""

    def __init__(self, database_path: str | Path) -> None:
        self._database_path = Path(database_path)

    def save(self, result: PresentationResult) -> None:
        payload = result.model_dump_json(exclude_none=True)
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO presentation_results (
                        project_id,
                        presentation_id,
                        contract_version,
                        result_json
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(project_id, presentation_id) DO UPDATE SET
                        contract_version = excluded.contract_version,
                        result_json = excluded.result_json
                    """,
                    (
                        result.project_id,
                        result.presentation_id,
                        result.contract_version,
                        payload,
                    ),
                )
        except (OSError, sqlite3.Error) as error:
            raise PresentationResultStoreError(
                "Could not persist presentation metadata"
            ) from error

    def get(
        self,
        project_id: str,
        presentation_id: str,
    ) -> PresentationResult | None:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT result_json
                    FROM presentation_results
                    WHERE project_id = ? AND presentation_id = ?
                    """,
                    (project_id, presentation_id),
                ).fetchone()
        except (OSError, sqlite3.Error) as error:
            raise PresentationResultStoreError(
                "Could not load presentation metadata"
            ) from error

        if row is None:
            return None

        try:
            return PresentationResult.model_validate(json.loads(row[0]))
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise PresentationResultStoreError(
                "Stored presentation metadata is invalid"
            ) from error

    def _connect(self) -> sqlite3.Connection:
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._database_path, timeout=5)
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS presentation_results (
                project_id TEXT NOT NULL,
                presentation_id TEXT NOT NULL,
                contract_version TEXT NOT NULL,
                result_json TEXT NOT NULL,
                PRIMARY KEY (project_id, presentation_id)
            )
            """
        )
        return connection
