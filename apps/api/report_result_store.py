"""Project-scoped persistence for ReportResult metadata."""

import json
import sqlite3
from pathlib import Path
from typing import Protocol

from contract_models import ReportResult


class ReportResultStoreError(RuntimeError):
    """Raised when report metadata cannot be safely stored or loaded."""


class ReportResultStore(Protocol):
    """Application boundary for project-scoped report metadata."""

    def save(self, result: ReportResult) -> None: ...

    def get(self, project_id: str, report_id: str) -> ReportResult | None: ...


class InMemoryReportResultStore:
    """Deterministic test double for report metadata."""

    def __init__(self) -> None:
        self._results: dict[tuple[str, str], ReportResult] = {}

    def save(self, result: ReportResult) -> None:
        self._results[(result.project_id, result.report_id)] = result.model_copy(
            deep=True
        )

    def get(self, project_id: str, report_id: str) -> ReportResult | None:
        result = self._results.get((project_id, report_id))
        return result.model_copy(deep=True) if result is not None else None


class SQLiteReportResultStore:
    """Persist report metadata under a composite project key."""

    def __init__(self, database_path: str | Path) -> None:
        self._database_path = Path(database_path)

    def save(self, result: ReportResult) -> None:
        payload = result.model_dump_json(exclude_none=True)
        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO report_results (
                        project_id,
                        report_id,
                        contract_version,
                        result_json
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(project_id, report_id) DO UPDATE SET
                        contract_version = excluded.contract_version,
                        result_json = excluded.result_json
                    """,
                    (
                        result.project_id,
                        result.report_id,
                        result.contract_version,
                        payload,
                    ),
                )
        except (OSError, sqlite3.Error) as error:
            raise ReportResultStoreError(
                "Could not persist report metadata"
            ) from error

    def get(self, project_id: str, report_id: str) -> ReportResult | None:
        try:
            with self._connect() as connection:
                row = connection.execute(
                    """
                    SELECT result_json
                    FROM report_results
                    WHERE project_id = ? AND report_id = ?
                    """,
                    (project_id, report_id),
                ).fetchone()
        except (OSError, sqlite3.Error) as error:
            raise ReportResultStoreError(
                "Could not load report metadata"
            ) from error
        if row is None:
            return None
        try:
            return ReportResult.model_validate(json.loads(row[0]))
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise ReportResultStoreError(
                "Stored report metadata is invalid"
            ) from error

    def _connect(self) -> sqlite3.Connection:
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self._database_path, timeout=5)
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS report_results (
                project_id TEXT NOT NULL,
                report_id TEXT NOT NULL,
                contract_version TEXT NOT NULL,
                result_json TEXT NOT NULL,
                PRIMARY KEY (project_id, report_id)
            )
            """
        )
        return connection
