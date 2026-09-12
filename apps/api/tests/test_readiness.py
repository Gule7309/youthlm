"""Status-only readiness and production CORS tests."""

import asyncio
import tempfile
import unittest
from pathlib import Path

import httpx

from main import (
    DEFAULT_CORS_ORIGINS,
    build_environment_readiness,
    create_app,
    resolve_cors_origins,
)
from module_store import InMemoryModuleStore


def request(
    app,
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.request(method, path, headers=headers)

    return asyncio.run(send())


class ReadinessTests(unittest.TestCase):
    def test_health_stays_provider_independent(self) -> None:
        response = request(
            create_app(
                module_store=InMemoryModuleStore(),
                readiness_probe=lambda: {
                    "provider_configured": False,
                    "data_ready": False,
                    "storage_writable": False,
                },
            ),
            "GET",
            "/health",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_ready_returns_only_generic_component_status(self) -> None:
        components = {
            "provider_configured": False,
            "data_ready": True,
            "storage_writable": True,
        }
        response = request(
            create_app(
                module_store=InMemoryModuleStore(),
                readiness_probe=lambda: components,
            ),
            "GET",
            "/ready",
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json(),
            {"status": "not_ready", "components": components},
        )
        payload_text = response.text.lower()
        for forbidden in ("profile", "region", "model", "account", "path", "secret"):
            self.assertNotIn(forbidden, payload_text)

    def test_ready_succeeds_only_when_every_component_passes(self) -> None:
        components = {
            "provider_configured": True,
            "data_ready": True,
            "storage_writable": True,
        }
        response = request(
            create_app(
                module_store=InMemoryModuleStore(),
                readiness_probe=lambda: components,
            ),
            "GET",
            "/ready",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ready")

    def test_bedrock_readiness_supports_iam_role_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            components = build_environment_readiness(
                provider_injected=False,
                module_storage_injected=False,
                presentation_storage_injected=False,
                environment={
                    "MODEL_PROVIDER": "bedrock",
                    "AWS_REGION": "ap-northeast-1",
                    "BEDROCK_MODEL_ID": "example-model-id",
                    "YOUTHLM_SQLITE_PATH": str(root / "state" / "youthlm.sqlite3"),
                    "YOUTHLM_ARTIFACT_DIR": str(root / "artifacts"),
                },
            )

        self.assertTrue(components["provider_configured"])
        self.assertTrue(components["data_ready"])
        self.assertTrue(components["storage_writable"])


class CorsConfigurationTests(unittest.TestCase):
    def test_defaults_remain_local_for_development(self) -> None:
        self.assertEqual(resolve_cors_origins({}), DEFAULT_CORS_ORIGINS)

    def test_accepts_deduplicated_exact_https_origins(self) -> None:
        origins = resolve_cors_origins(
            {
                "YOUTHLM_CORS_ORIGINS": (
                    "https://demo.example, https://admin.example:8443,"
                    "https://demo.example"
                )
            }
        )

        self.assertEqual(
            origins,
            ("https://demo.example", "https://admin.example:8443"),
        )

    def test_rejects_wildcards_credentials_paths_and_invalid_ports(self) -> None:
        invalid_values = (
            "*",
            "https://*.example",
            "https://user:password@example.test",
            "https://example.test/path",
            "https://example.test?token=value",
            "https://example.test:99999",
        )
        for value in invalid_values:
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                resolve_cors_origins({"YOUTHLM_CORS_ORIGINS": value})

    def test_cors_allows_only_the_configured_origin(self) -> None:
        app = create_app(
            module_store=InMemoryModuleStore(),
            cors_origins=("https://demo.example",),
        )
        headers = {
            "Origin": "https://demo.example",
            "Access-Control-Request-Method": "POST",
        }
        allowed = request(app, "OPTIONS", "/v1/analysis", headers=headers)
        rejected = request(
            app,
            "OPTIONS",
            "/v1/analysis",
            headers={**headers, "Origin": "https://foreign.example"},
        )

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(
            allowed.headers["access-control-allow-origin"],
            "https://demo.example",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertNotIn("access-control-allow-origin", rejected.headers)


if __name__ == "__main__":
    unittest.main()
