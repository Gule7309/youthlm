"""Regression tests for the monorepo API entrypoint."""

import asyncio
import unittest

import httpx

from main import app


class ApiEntrypointTests(unittest.TestCase):
    def test_health_is_available_from_monorepo_entrypoint(self) -> None:
        async def send() -> httpx.Response:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://test",
            ) as client:
                return await client.get("/health")

        response = asyncio.run(send())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_openapi_preserves_existing_http_boundary(self) -> None:
        openapi = app.openapi()
        paths = openapi["paths"]

        self.assertIn("/health", paths)
        self.assertIn("/v1/data-sources", paths)
        self.assertIn("/v1/analysis", paths)
        self.assertIn("/v1/assistant", paths)
        self.assertIn("/v1/presentations", paths)
        self.assertIn(
            "/v1/projects/{project_id}/presentations/{presentation_id}/download",
            paths,
        )
        operation = paths["/v1/analysis"]["post"]
        request_schema = operation["requestBody"]["content"][
            "application/json"
        ]["schema"]
        response_schema = operation["responses"]["200"]["content"][
            "application/json"
        ]["schema"]
        self.assertEqual(
            request_schema,
            {"$ref": "#/components/schemas/AnalysisRequest"},
        )
        self.assertEqual(
            response_schema,
            {"$ref": "#/components/schemas/AnalysisResult"},
        )

        assistant_operation = paths["/v1/assistant"]["post"]
        assistant_request_schema = assistant_operation["requestBody"]["content"][
            "application/json"
        ]["schema"]
        assistant_response_schema = assistant_operation["responses"]["200"][
            "content"
        ]["application/json"]["schema"]
        self.assertEqual(
            assistant_request_schema,
            {"$ref": "#/components/schemas/AssistantRequest"},
        )
        self.assertEqual(
            assistant_response_schema,
            {"$ref": "#/components/schemas/AssistantResult"},
        )

        presentation_operation = paths["/v1/presentations"]["post"]
        presentation_request_schema = presentation_operation["requestBody"][
            "content"
        ]["application/json"]["schema"]
        presentation_response_schema = presentation_operation["responses"]["201"][
            "content"
        ]["application/json"]["schema"]
        self.assertEqual(
            presentation_request_schema,
            {"$ref": "#/components/schemas/PresentationRequest"},
        )
        self.assertEqual(
            presentation_response_schema,
            {"$ref": "#/components/schemas/PresentationResult"},
        )


if __name__ == "__main__":
    unittest.main()
