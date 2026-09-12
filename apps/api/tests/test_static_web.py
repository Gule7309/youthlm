"""Same-origin frontend serving tests for the deployable container."""

import asyncio
import tempfile
import unittest
from pathlib import Path

import httpx

from main import create_app, resolve_web_dist_directory
from module_store import InMemoryModuleStore


def request(app, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.get(path)

    return asyncio.run(send())


class StaticWebTests(unittest.TestCase):
    def test_web_serving_is_opt_in(self) -> None:
        self.assertIsNone(resolve_web_dist_directory({}))
        self.assertIsNone(resolve_web_dist_directory({"YOUTHLM_SERVE_WEB": "off"}))

    def test_enabled_web_serving_requires_a_built_index(self) -> None:
        with (
            tempfile.TemporaryDirectory() as directory,
            self.assertRaises(RuntimeError),
        ):
            resolve_web_dist_directory(
                {
                    "YOUTHLM_SERVE_WEB": "true",
                    "YOUTHLM_WEB_DIST_DIR": directory,
                }
            )

        with self.assertRaises(RuntimeError):
            resolve_web_dist_directory({"YOUTHLM_SERVE_WEB": "sometimes"})

    def test_frontend_and_api_are_served_from_the_same_app(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            web_directory = Path(directory)
            (web_directory / "index.html").write_text(
                "<!doctype html><title>YouthLM</title>",
                encoding="utf-8",
            )
            (web_directory / "asset.txt").write_text("asset-ok", encoding="utf-8")
            app = create_app(
                module_store=InMemoryModuleStore(),
                readiness_probe=lambda: {
                    "provider_configured": True,
                    "data_ready": True,
                    "storage_writable": True,
                },
                web_directory=web_directory,
            )

            index = request(app, "/")
            asset = request(app, "/asset.txt")
            health = request(app, "/health")
            catalog = request(app, "/v1/data-sources")

        self.assertEqual(index.status_code, 200)
        self.assertIn("YouthLM", index.text)
        self.assertEqual(asset.text, "asset-ok")
        self.assertEqual(health.json(), {"status": "ok"})
        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(len(catalog.json()["sources"]), 2)


if __name__ == "__main__":
    unittest.main()
