import asyncio
import unittest

import httpx

from app.agent import YouthLMAgent
from app.api import create_app
from app.provider import FakeModelProvider, ModelToolCall, ModelTurn
from app.tooling import build_default_tool_registry
from app.youth_data import DATASET_ID


def request(
    app,
    method: str,
    path: str,
    *,
    json: dict | None = None,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.request(method, path, json=json, headers=headers)

    return asyncio.run(send())


class FailingAgent:
    def run(self, prompt: str):
        raise RuntimeError("private provider details")


class YouthLMApiTests(unittest.TestCase):
    def test_health_does_not_require_provider_configuration(self) -> None:
        response = request(create_app(), "GET", "/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_lists_sources_available_to_every_notebook(self) -> None:
        response = request(create_app(), "GET", "/v1/data-sources")

        self.assertEqual(response.status_code, 200)
        sources = response.json()["sources"]
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["source_id"], DATASET_ID)
        self.assertTrue(sources[0]["default_for_notebooks"])
        self.assertEqual(sources[0]["policy_domain"], "employment")
        self.assertEqual(sources[0]["query_tool"], "query_youth_dataset")
        self.assertFalse(sources[0]["age_definition"]["can_split_bands"])
        self.assertIn("version_id", sources[0]["dataset_version"])

    def test_returns_direct_agent_answer(self) -> None:
        agent = YouthLMAgent(
            provider=FakeModelProvider(
                [ModelTurn(stop_reason="end_turn", text="Direct answer")]
            ),
            tools=build_default_tool_registry(),
        )

        response = request(
            create_app(agent),
            "POST",
            "/v1/analysis",
            json={"question": "  Hello  "},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["answer"], "Direct answer")
        self.assertIsNone(response.json()["analysis"])

    def test_returns_ui_ready_dataset_analysis(self) -> None:
        agent = YouthLMAgent(
            provider=FakeModelProvider(
                [
                    ModelTurn(
                        stop_reason="tool_use",
                        tool_calls=[
                            ModelToolCall(
                                call_id="call-1",
                                name="query_youth_dataset",
                                arguments={
                                    "dataset_id": DATASET_ID,
                                    "age_groups": ["25-29"],
                                    "sexes": ["female"],
                                    "start_year": 2023,
                                    "end_year": 2024,
                                },
                            )
                        ],
                    ),
                    ModelTurn(stop_reason="end_turn", text="女性失業率下降。"),
                ]
            ),
            tools=build_default_tool_registry(),
        )

        response = request(
            create_app(agent),
            "POST",
            "/v1/analysis",
            json={"question": "比較女性青年失業率"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["analysis"]["dataset_ref"]["dataset_id"], DATASET_ID)
        self.assertEqual(
            payload["analysis"]["visualization_spec"]["series"][0]["points"],
            [{"x": 2023, "y": 5.8}, {"x": 2024, "y": 4.7}],
        )

    def test_rejects_blank_question(self) -> None:
        response = request(
            create_app(),
            "POST",
            "/v1/analysis",
            json={"question": "   "},
        )

        self.assertEqual(response.status_code, 422)

    def test_allows_local_frontend_cors_preflight(self) -> None:
        response = request(
            create_app(),
            "OPTIONS",
            "/v1/analysis",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:5173",
        )

    def test_hides_internal_provider_error_details(self) -> None:
        response = request(
            create_app(FailingAgent()),
            "POST",
            "/v1/analysis",
            json={"question": "Hello"},
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json(), {"detail": "Model provider request failed"})


if __name__ == "__main__":
    unittest.main()
