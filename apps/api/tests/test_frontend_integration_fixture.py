"""Executable frontend fixtures for the first Source-to-Chart golden path."""

import asyncio
import json
import unittest
from pathlib import Path

import httpx
from app.agent import YouthLMAgent
from app.population_data import DATASET_ID
from app.provider import FakeModelProvider, ModelToolCall, ModelTurn
from app.tooling import build_default_tool_registry

from contract_models import AnalysisRequest, AnalysisResult, ErrorResponse
from main import create_app
from module_store import InMemoryModuleStore

REPOSITORY_ROOT = Path(__file__).parents[3]
FIXTURE_ROOT = REPOSITORY_ROOT / "contracts/fixtures/frontend-integration"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


def request(app, method: str, path: str, *, json: dict) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.request(method, path, json=json)

    return asyncio.run(send())


def build_test_app(agent):
    return create_app(agent, module_store=InMemoryModuleStore())


def successful_agent() -> YouthLMAgent:
    return YouthLMAgent(
        provider=FakeModelProvider(
            [
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="compatibility-1",
                            name="check_compatibility",
                            arguments={
                                "source_id": DATASET_ID,
                                "min_age": 20,
                                "max_age": 24,
                                "start_year": 2022,
                                "end_year": 2024,
                                "geography": "板橋區",
                                "sexes": ["all"],
                                "unit": "人",
                            },
                        )
                    ],
                ),
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="query-1",
                            name="query_population_dataset",
                            arguments={
                                "dataset_id": DATASET_ID,
                                "geographies": ["板橋區"],
                                "age_groups": ["20-24"],
                                "sexes": ["all"],
                                "start_year": 2022,
                                "end_year": 2024,
                            },
                        )
                    ],
                ),
                ModelTurn(
                    stop_reason="end_turn",
                    text=(
                        "2022至2024年，板橋區20至24歲人口由28,472人降至"
                        "27,049人。"
                    ),
                ),
            ]
        ),
        tools=build_default_tool_registry(),
    )


def blocked_agent() -> YouthLMAgent:
    return YouthLMAgent(
        provider=FakeModelProvider(
            [
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="compatibility-blocked",
                            name="check_compatibility",
                            arguments={
                                "source_id": DATASET_ID,
                                "min_age": 18,
                                "max_age": 35,
                                "start_year": 2024,
                                "end_year": 2024,
                                "geography": "板橋區",
                                "sexes": ["all"],
                                "unit": "人",
                            },
                        )
                    ],
                ),
                ModelTurn(
                    stop_reason="end_turn",
                    text=(
                        "官方五歲級距無法切出18至19歲與35歲，因此不能產生"
                        "精確的18至35歲人口結果。"
                    ),
                ),
            ]
        ),
        tools=build_default_tool_registry(),
    )


class FrontendIntegrationFixtureTests(unittest.TestCase):
    def test_source_to_chart_fixture_matches_real_analysis_endpoint(self) -> None:
        request_payload = load_fixture("analysis-request.example.json")
        expected_result = load_fixture("analysis-result.example.json")

        response = request(
            build_test_app(successful_agent()),
            "POST",
            "/v1/analysis",
            json=request_payload,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected_result)
        AnalysisRequest.model_validate(request_payload)
        AnalysisResult.model_validate(response.json())

    def test_blocked_age_mismatch_fixture_matches_endpoint(self) -> None:
        payload = {
            "contract_version": "0.1.0",
            "project_id": "project_frontend_demo",
            "module_id": "analysis_blocked_age",
            "query": "精確分析板橋區2024年18至35歲人口",
            "upstream_module_ids": [],
            "source_selections": [
                {
                    "source_id": DATASET_ID,
                    "filters": {
                        "geographies": ["板橋區"],
                        "age_groups": [
                            "15-19",
                            "20-24",
                            "25-29",
                            "30-34",
                            "35-39",
                        ],
                        "sexes": ["all"],
                        "start_year": 2024,
                        "end_year": 2024,
                    },
                }
            ],
        }

        response = request(
            build_test_app(blocked_agent()),
            "POST",
            "/v1/analysis",
            json=payload,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            load_fixture("blocked-result.example.json"),
        )
        AnalysisResult.model_validate(response.json())

    def test_error_fixture_matches_missing_module_response(self) -> None:
        payload = load_fixture("analysis-request.example.json")
        payload["module_id"] = "analysis_downstream"
        payload["upstream_module_ids"] = ["analysis_missing"]

        response = request(
            build_test_app(successful_agent()),
            "POST",
            "/v1/analysis",
            json=payload,
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json(),
            load_fixture("error-response.example.json"),
        )
        ErrorResponse.model_validate(response.json())

    def test_rejects_unknown_selected_source_before_running_agent(self) -> None:
        payload = load_fixture("analysis-request.example.json")
        payload["source_selections"][0]["source_id"] = "unknown_source"

        response = request(
            build_test_app(successful_agent()),
            "POST",
            "/v1/analysis",
            json=payload,
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "dataset_error")
        self.assertEqual(
            response.json()["error"]["details"]["unknown_source_ids"],
            ["unknown_source"],
        )

    def test_requires_compatibility_check_for_selected_source(self) -> None:
        agent = YouthLMAgent(
            provider=FakeModelProvider(
                [
                    ModelTurn(
                        stop_reason="tool_use",
                        tool_calls=[
                            ModelToolCall(
                                call_id="query-without-check",
                                name="query_population_dataset",
                                arguments={
                                    "dataset_id": DATASET_ID,
                                    "geographies": ["板橋區"],
                                    "age_groups": ["20-24"],
                                    "sexes": ["all"],
                                    "start_year": 2022,
                                    "end_year": 2024,
                                },
                            )
                        ],
                    ),
                    ModelTurn(stop_reason="end_turn", text="Unsafe result"),
                ]
            ),
            tools=build_default_tool_registry(),
        )

        response = request(
            build_test_app(agent),
            "POST",
            "/v1/analysis",
            json=load_fixture("analysis-request.example.json"),
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json()["error"]["code"],
            "agent_protocol_error",
        )

    def test_latest_exact_check_supersedes_initial_broad_refusal(self) -> None:
        agent = YouthLMAgent(
            provider=FakeModelProvider(
                [
                    ModelTurn(
                        stop_reason="tool_use",
                        tool_calls=[
                            ModelToolCall(
                                call_id="broad-check",
                                name="check_compatibility",
                                arguments={
                                    "source_id": DATASET_ID,
                                    "min_age": 18,
                                    "max_age": 35,
                                    "start_year": 2022,
                                    "end_year": 2024,
                                    "geography": "板橋區",
                                    "sexes": ["all"],
                                    "unit": "人",
                                },
                            )
                        ],
                    ),
                    ModelTurn(
                        stop_reason="tool_use",
                        tool_calls=[
                            ModelToolCall(
                                call_id="selected-scope-check",
                                name="check_compatibility",
                                arguments={
                                    "source_id": DATASET_ID,
                                    "min_age": 20,
                                    "max_age": 24,
                                    "start_year": 2022,
                                    "end_year": 2024,
                                    "geography": "板橋區",
                                    "sexes": ["all"],
                                    "unit": "人",
                                },
                            )
                        ],
                    ),
                    ModelTurn(
                        stop_reason="tool_use",
                        tool_calls=[
                            ModelToolCall(
                                call_id="selected-query",
                                name="query_population_dataset",
                                arguments={
                                    "dataset_id": DATASET_ID,
                                    "geographies": ["板橋區"],
                                    "age_groups": ["20-24"],
                                    "sexes": ["all"],
                                    "start_year": 2022,
                                    "end_year": 2024,
                                },
                            )
                        ],
                    ),
                    ModelTurn(
                        stop_reason="end_turn",
                        text="板橋區20至24歲人口逐年下降。",
                    ),
                ]
            ),
            tools=build_default_tool_registry(),
        )

        response = request(
            build_test_app(agent),
            "POST",
            "/v1/analysis",
            json=load_fixture("analysis-request.example.json"),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "partial")
        self.assertEqual(response.json()["visualization"]["type"], "line")

    def test_does_not_silently_ignore_selected_source(self) -> None:
        agent = YouthLMAgent(
            provider=FakeModelProvider(
                [ModelTurn(stop_reason="end_turn", text="Unverified answer")]
            ),
            tools=build_default_tool_registry(),
        )

        response = request(
            build_test_app(agent),
            "POST",
            "/v1/analysis",
            json=load_fixture("analysis-request.example.json"),
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json()["error"]["code"],
            "agent_protocol_error",
        )


if __name__ == "__main__":
    unittest.main()
