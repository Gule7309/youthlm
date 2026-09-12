"""HTTP integration tests for Presentation Artifact generation and download."""

import asyncio
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

import httpx

from contract_models import AnalysisResult
from main import create_app
from module_store import InMemoryModuleStore, SQLiteModuleStore
from presentation_generator import (
    PptxPresentationGenerator,
    PresentationGenerationError,
)
from presentation_result_store import SQLitePresentationResultStore
from presentation_service import PPTX_MEDIA_TYPE, PresentationService
from presentation_store import (
    LocalPresentationArtifactStore,
    PresentationArtifactStoreError,
)

REPOSITORY_ROOT = Path(__file__).parents[3]
RESULT_FIXTURE = (
    REPOSITORY_ROOT
    / "contracts/fixtures/frontend-integration/analysis-result.example.json"
)


def request(app, method: str, path: str, *, json: dict | None = None) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.request(method, path, json=json)

    return asyncio.run(send())


def stored_result() -> AnalysisResult:
    return AnalysisResult.model_validate_json(
        RESULT_FIXTURE.read_text(encoding="utf-8")
    )


def presentation_request(result: AnalysisResult, **overrides) -> dict:
    payload = {
        "contract_version": "0.1.0",
        "project_id": result.project_id,
        "source_module_ids": [result.module_id],
        "title": "板橋區青年人口趨勢",
        "audience": "青年政策規劃人員",
        "language": "zh-TW",
        "template_id": "youthlm_default",
        "output_format": "pptx",
        "instructions": "保留所有資料限制與來源。",
    }
    payload.update(overrides)
    return payload


class FailingGenerator:
    def generate(self, request, modules) -> bytes:
        raise PresentationGenerationError(
            f"private generator detail: {request.title}/{len(modules)}"
        )


class FailingArtifactStore:
    def save(self, project_id: str, presentation_id: str, content: bytes):
        raise PresentationArtifactStoreError(
            f"private storage detail: {project_id}/{presentation_id}/{len(content)}"
        )

    def get(self, project_id: str, presentation_id: str):
        raise PresentationArtifactStoreError(
            f"private storage detail: {project_id}/{presentation_id}"
        )


class PresentationRuntimeTests(unittest.TestCase):
    def test_generates_contract_result_then_downloads_real_pptx(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = stored_result()
            database_path = Path(directory) / "youthlm.sqlite3"
            artifact_directory = Path(directory) / "artifacts"
            module_store = SQLiteModuleStore(database_path)
            module_store.save(result)
            service = PresentationService(
                module_store,
                PptxPresentationGenerator(),
                LocalPresentationArtifactStore(artifact_directory),
                result_store=SQLitePresentationResultStore(database_path),
                id_factory=lambda: "presentation_test",
                clock=lambda: datetime(2026, 9, 6, 12, 0, tzinfo=UTC),
            )
            app = create_app(
                module_store=module_store,
                presentation_service=service,
            )

            response = request(
                app,
                "POST",
                "/v1/presentations",
                json=presentation_request(result),
            )

            self.assertEqual(response.status_code, 201)
            payload = response.json()
            self.assertEqual(payload["status"], "ready")
            self.assertEqual(payload["presentation_id"], "presentation_test")
            self.assertEqual(
                payload["warnings"],
                [
                    warning.model_dump(mode="json", exclude_none=True)
                    for warning in result.warnings
                ],
            )
            self.assertGreater(payload["file_size_bytes"], 1_000)
            self.assertEqual(len(payload["artifact_sha256"]), 64)

            restarted_store = SQLiteModuleStore(database_path)
            restarted_service = PresentationService(
                restarted_store,
                PptxPresentationGenerator(),
                LocalPresentationArtifactStore(artifact_directory),
                result_store=SQLitePresentationResultStore(database_path),
            )
            restarted_app = create_app(
                module_store=restarted_store,
                presentation_service=restarted_service,
            )
            download = request(restarted_app, "GET", payload["download_url"])
            self.assertEqual(download.status_code, 200)
            self.assertEqual(download.headers["content-type"], PPTX_MEDIA_TYPE)
            self.assertIn("presentation_test.pptx", download.headers["content-disposition"])
            self.assertEqual(len(download.content), payload["file_size_bytes"])
            self.assertTrue(download.content.startswith(b"PK"))
            self.assertEqual(
                restarted_service.get_result(
                    result.project_id,
                    "presentation_test",
                ).model_dump(mode="json", exclude_none=True),
                payload,
            )

    def test_does_not_read_same_module_id_from_another_project(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = stored_result()
            module_store = InMemoryModuleStore()
            module_store.save(result)
            service = PresentationService(
                module_store,
                PptxPresentationGenerator(),
                LocalPresentationArtifactStore(directory),
            )
            app = create_app(
                module_store=module_store,
                presentation_service=service,
            )

            response = request(
                app,
                "POST",
                "/v1/presentations",
                json=presentation_request(result, project_id="different_project"),
            )

            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["error"]["code"], "module_not_found")
            self.assertEqual(
                response.json()["error"]["details"]["missing_module_ids"],
                [result.module_id],
            )

    def test_returns_safe_error_when_generator_fails(self) -> None:
        result = stored_result()
        module_store = InMemoryModuleStore()
        module_store.save(result)
        with tempfile.TemporaryDirectory() as directory:
            service = PresentationService(
                module_store,
                FailingGenerator(),
                LocalPresentationArtifactStore(directory),
            )

            response = request(
                create_app(
                    module_store=module_store,
                    presentation_service=service,
                ),
                "POST",
                "/v1/presentations",
                json=presentation_request(result),
            )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.json()["error"],
            {
                "code": "internal_error",
                "message": "Presentation generation failed",
                "retriable": True,
            },
        )

    def test_returns_safe_error_when_artifact_storage_fails(self) -> None:
        result = stored_result()
        module_store = InMemoryModuleStore()
        module_store.save(result)
        service = PresentationService(
            module_store,
            PptxPresentationGenerator(),
            FailingArtifactStore(),
        )
        app = create_app(
            module_store=module_store,
            presentation_service=service,
        )

        create_response = request(
            app,
            "POST",
            "/v1/presentations",
            json=presentation_request(result),
        )
        download_response = request(
            app,
            "GET",
            "/v1/projects/project_1/presentations/presentation_1/download",
        )

        for response in (create_response, download_response):
            self.assertEqual(response.status_code, 500)
            self.assertEqual(
                response.json()["error"],
                {
                    "code": "internal_error",
                    "message": "Presentation artifact storage failed",
                    "retriable": True,
                },
            )

    def test_invalid_request_uses_presentation_validation_message(self) -> None:
        response = request(
            create_app(module_store=InMemoryModuleStore()),
            "POST",
            "/v1/presentations",
            json={
                "contract_version": "0.1.0",
                "project_id": "project_1",
                "source_module_ids": [],
                "title": "",
                "output_format": "pptx",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "validation_error")
        self.assertEqual(
            response.json()["error"]["message"],
            "Presentation request validation failed",
        )

    def test_rejects_blocked_module_as_presentation_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = stored_result().model_copy(update={"status": "blocked"})
            module_store = InMemoryModuleStore()
            module_store.save(result)
            service = PresentationService(
                module_store,
                PptxPresentationGenerator(),
                LocalPresentationArtifactStore(directory),
            )

            response = request(
                create_app(
                    module_store=module_store,
                    presentation_service=service,
                ),
                "POST",
                "/v1/presentations",
                json=presentation_request(result),
            )

            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["error"]["code"], "dataset_error")
            self.assertEqual(
                response.json()["error"]["details"]["blocked_module_ids"],
                [result.module_id],
            )

    def test_missing_or_cross_project_artifact_is_not_downloadable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            module_store = InMemoryModuleStore()
            service = PresentationService(
                module_store,
                PptxPresentationGenerator(),
                LocalPresentationArtifactStore(directory),
            )
            app = create_app(
                module_store=module_store,
                presentation_service=service,
            )

            response = request(
                app,
                "GET",
                "/v1/projects/project_other/presentations/presentation_missing/download",
            )

            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["error"]["code"], "module_not_found")


if __name__ == "__main__":
    unittest.main()
