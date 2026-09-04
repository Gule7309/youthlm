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
        paths = app.openapi()["paths"]

        self.assertIn("/health", paths)
        self.assertIn("/v1/data-sources", paths)
        self.assertIn("/v1/analysis", paths)


if __name__ == "__main__":
    unittest.main()
