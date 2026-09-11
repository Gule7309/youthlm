"""Executable frontend fixtures for the first Source-to-Chart golden path."""

import asyncio
import importlib.util
import json
import unittest
from pathlib import Path

import httpx
from app.agent import YouthLMAgent
from app.population_data import DATASET_ID, query_population_dataset
from app.provider import FakeModelProvider, ModelToolCall, ModelTurn
from app.tooling import build_default_tool_registry
from app.youth_data import (
    DATASET_ID as UNEMPLOYMENT_DATASET_ID,
)
from app.youth_data import (
    query_youth_dataset,
)

from contract_models import AnalysisRequest, AnalysisResult, ErrorResponse
from main import create_app
from module_store import InMemoryModuleStore

REPOSITORY_ROOT = Path(__file__).parents[3]
FIXTURE_ROOT = REPOSITORY_ROOT / "contracts/fixtures/frontend-integration"
FIXTURE_API_PATH = REPOSITORY_ROOT / "apps/web/test/fixture-api.py"


def load_dynamic_fixture_api():
    spec = importlib.util.spec_from_file_location(
        "youthlm_dynamic_fixture_api",
        FIXTURE_API_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load the frontend fixture API module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


DYNAMIC_FIXTURE_API = load_dynamic_fixture_api()


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


def request(
    app,
    method: str,
    path: str,
    *,
    json: dict | None = None,
) -> httpx.Response:
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
    def test_data_source_catalog_fixture_matches_endpoint(self) -> None:
        response = request(
            build_test_app(successful_agent()),
            "GET",
            "/v1/data-sources",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            load_fixture("data-sources.example.json"),
        )
        self.assertEqual(
            [source["source_id"] for source in response.json()["sources"]],
            [
                "ntpc_unemployment_by_age_sex",
                "ntpc_population_by_age_sex_district",
            ],
        )
        self.assertTrue(
            all(
                source["default_for_notebooks"]
                for source in response.json()["sources"]
            )
        )

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


class DynamicFrontendFixtureTests(unittest.TestCase):
    def test_population_selection_uses_requested_filters_and_real_rows(self) -> None:
        filters = {
            "geographies": ["新店區"],
            "age_groups": ["25-29", "30-34"],
            "sexes": ["female"],
            "start_year": 2020,
            "end_year": 2021,
        }
        payload = {
            "contract_version": "0.1.0",
            "project_id": "project_dynamic_population",
            "module_id": "analysis_dynamic_population",
            "query": "比較新店區青年女性人口",
            "upstream_module_ids": [],
            "source_selections": [
                {"source_id": DATASET_ID, "filters": filters}
            ],
        }

        response = request(
            DYNAMIC_FIXTURE_API.create_fixture_app(),
            "POST",
            "/v1/analysis",
            json=payload,
        )

        expected = query_population_dataset(
            {"dataset_id": DATASET_ID, **filters}
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(
            response.json().get("error", {}).get("code"),
            "agent_protocol_error",
        )
        self.assertEqual(response.json()["filters"], filters)
        self.assertEqual(
            response.json()["result_data"]["records"],
            expected["rows"],
        )
        self.assertIn("整合測試，非 AI 回答", response.json()["summary"])
        AnalysisResult.model_validate(response.json())

    def test_unemployment_selection_uses_requested_filters_and_real_rows(self) -> None:
        filters = {
            "age_groups": ["30-34"],
            "sexes": ["male"],
            "start_year": 2019,
            "end_year": 2021,
        }
        payload = {
            "contract_version": "0.1.0",
            "project_id": "project_dynamic_unemployment",
            "module_id": "analysis_dynamic_unemployment",
            "query": "比較青年男性失業率",
            "upstream_module_ids": [],
            "source_selections": [
                {
                    "source_id": UNEMPLOYMENT_DATASET_ID,
                    "filters": filters,
                }
            ],
        }

        response = request(
            DYNAMIC_FIXTURE_API.create_fixture_app(),
            "POST",
            "/v1/analysis",
            json=payload,
        )

        expected = query_youth_dataset(
            {"dataset_id": UNEMPLOYMENT_DATASET_ID, **filters}
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(
            response.json().get("error", {}).get("code"),
            "agent_protocol_error",
        )
        self.assertEqual(response.json()["filters"], filters)
        self.assertEqual(
            response.json()["result_data"]["records"],
            expected["rows"],
        )
        self.assertEqual(
            response.json()["provenance"][0]["query_tool"],
            "query_youth_dataset",
        )
        AnalysisResult.model_validate(response.json())

    def test_direct_answer_without_source_selection_remains_available(self) -> None:
        payload = {
            "contract_version": "0.1.0",
            "project_id": "project_dynamic_direct",
            "module_id": "analysis_dynamic_direct",
            "query": "整理目前問題",
            "upstream_module_ids": [],
            "source_selections": [],
        }

        response = request(
            DYNAMIC_FIXTURE_API.create_fixture_app(),
            "POST",
            "/v1/analysis",
            json=payload,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["question"], payload["query"])
        self.assertEqual(response.json()["result_data"]["records"], [])
        self.assertIn("整合測試，非 AI 回答", response.json()["summary"])

    def test_multiple_sources_returns_clear_dataset_error(self) -> None:
        population_filters = {
            "geographies": ["板橋區"],
            "age_groups": ["20-24"],
            "sexes": ["all"],
            "start_year": 2022,
            "end_year": 2024,
        }
        unemployment_filters = {
            "age_groups": ["25-29"],
            "sexes": ["female"],
            "start_year": 2022,
            "end_year": 2024,
        }
        payload = {
            "contract_version": "0.1.0",
            "project_id": "project_dynamic_multiple",
            "module_id": "analysis_dynamic_multiple",
            "query": "交叉比較兩個來源",
            "upstream_module_ids": [],
            "source_selections": [
                {"source_id": DATASET_ID, "filters": population_filters},
                {
                    "source_id": UNEMPLOYMENT_DATASET_ID,
                    "filters": unemployment_filters,
                },
            ],
        }

        response = request(
            DYNAMIC_FIXTURE_API.create_fixture_app(),
            "POST",
            "/v1/analysis",
            json=payload,
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "dataset_error")
        self.assertFalse(response.json()["error"]["retriable"])
        self.assertEqual(
            response.json()["error"]["details"]["selected_source_count"],
            2,
        )
        ErrorResponse.model_validate(response.json())


if __name__ == "__main__":
    unittest.main()
