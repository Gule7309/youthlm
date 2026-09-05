"""Project-scoped SQLite persistence for Contract v0 module results."""

import json
import sqlite3
from pathlib import Path
from typing import Protocol

from contract_models import AnalysisResult, ModuleContext


class ModuleStoreError(RuntimeError):
    """Raised when module state cannot be safely stored or loaded."""


class ModuleStore(Protocol):
    """Application boundary for project-scoped module persistence."""

    def save(self, result: AnalysisResult) -> None: ...

    def get_context(
        self,
        project_id: str,
        module_id: str,
    ) -> ModuleContext | None: ...


class InMemoryModuleStore:
    """Deterministic test double; production defaults to SQLite."""

    def __init__(self) -> None:
        self._results: dict[tuple[str, str], AnalysisResult] = {}

    def save(self, result: AnalysisResult) -> None:
        self._results[(result.project_id, result.module_id)] = result.model_copy(
            deep=True
        )

    def get_context(
        self,
        project_id: str,
        module_id: str,
    ) -> ModuleContext | None:
        result = self._results.get((project_id, module_id))
        if result is None:
            return None
        return ModuleContext.from_analysis_result(result)


class SQLiteModuleStore:
    """Persist validated analysis modules under a composite project key."""

    def __init__(self, database_path: str | Path) -> None:
        self._database_path = Path(database_path)

    def save(self, result: AnalysisResult) -> None:
        """Insert or replace one module without crossing project boundaries."""
        payload = result.model_dump_json(exclude_none=True)
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO analysis_modules (
                        project_id,
                        module_id,
                        contract_version,
                        result_json
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(project_id, module_id) DO UPDATE SET
                        contract_version = excluded.contract_version,
                        result_json = excluded.result_json
                    """,
                    (
                        result.project_id,
                        result.module_id,
                        result.contract_version,
                        payload,
                    ),
                )
        except (OSError, sqlite3.Error) as error:
            raise ModuleStoreError("Could not persist module result") from error

    def get_context(
        self,
        project_id: str,
        module_id: str,
    ) -> ModuleContext | None:
        """Return only a module from the requested project."""
        try:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT result_json
                    FROM analysis_modules
                    WHERE project_id = ? AND module_id = ?
                    """,
                    (project_id, module_id),
                ).fetchone()
        except (OSError, sqlite3.Error) as error:
            raise ModuleStoreError("Could not load module context") from error

        if row is None:
            return None

        try:
            stored_result = AnalysisResult.model_validate(json.loads(row[0]))
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise ModuleStoreError("Stored module result is invalid") from error
        return ModuleContext.from_analysis_result(stored_result)

    def _connect(self) -> sqlite3.Connection:
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._database_path, timeout=5)
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS analysis_modules (
                project_id TEXT NOT NULL,
                module_id TEXT NOT NULL,
                contract_version TEXT NOT NULL,
                result_json TEXT NOT NULL,
                PRIMARY KEY (project_id, module_id)
            )
            """
        )
        return connection
