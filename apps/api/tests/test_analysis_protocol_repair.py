"""Regression tests for selected-source protocol repair and filter fidelity."""

import asyncio
import unittest
from unittest.mock import patch

import httpx
from app.agent import YouthLMAgent
from app.population_data import DATASET_ID as POPULATION_DATASET_ID
from app.provider import FakeModelProvider, ModelToolCall, ModelTurn
from app.tooling import build_default_tool_registry
from app.youth_data import DATASET_ID as UNEMPLOYMENT_DATASET_ID

from main import create_app
from module_store import InMemoryModuleStore


def request(app, payload: dict) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.post("/v1/analysis", json=payload)

    return asyncio.run(send())


def population_request() -> dict:
    return {
        "contract_version": "0.1.0",
        "project_id": "project_repair",
        "module_id": "analysis_repair",
        "query": "分析板橋區20至24歲人口",
        "upstream_module_ids": [],
        "source_selections": [
            {
                "source_id": POPULATION_DATASET_ID,
                "filters": {
                    "geographies": ["板橋區"],
                    "age_groups": ["20-24"],
                    "sexes": ["all"],
                    "start_year": 2022,
                    "end_year": 2024,
                },
            }
        ],
    }


def unemployment_request() -> dict:
    return {
        "contract_version": "0.1.0",
        "project_id": "project_filter_order",
        "module_id": "analysis_filter_order",
        "query": "比較青年失業率",
        "upstream_module_ids": [],
        "source_selections": [
            {
                "source_id": UNEMPLOYMENT_DATASET_ID,
                "filters": {
                    "age_groups": ["25-29", "30-34"],
                    "sexes": ["male", "female"],
                    "start_year": 2024,
                    "end_year": 2024,
                },
            }
        ],
    }


def compatibility_turn() -> ModelTurn:
    return ModelTurn(
        stop_reason="tool_use",
        tool_calls=[
            ModelToolCall(
                call_id="compatibility",
                name="check_compatibility",
                arguments={
                    "source_id": UNEMPLOYMENT_DATASET_ID,
                    "min_age": 25,
                    "max_age": 34,
                    "start_year": 2024,
                    "end_year": 2024,
                    "geography": "新北市",
                    "sexes": ["female", "male"],
                    "unit": "%",
                },
            )
        ],
    )


class AnalysisProtocolRepairTests(unittest.TestCase):
    def test_broad_refusal_cannot_replace_selected_scope_check(self) -> None:
        provider = FakeModelProvider(
            [
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="broad-refusal",
                            name="check_compatibility",
                            arguments={
                                "source_id": POPULATION_DATASET_ID,
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
                ModelTurn(stop_reason="end_turn", text="錯誤地拒絕合法查詢。"),
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="selected-check",
                            name="check_compatibility",
                            arguments={
                                "source_id": POPULATION_DATASET_ID,
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
                                "dataset_id": POPULATION_DATASET_ID,
                                "geographies": ["板橋區"],
                                "age_groups": ["20-24"],
                                "sexes": ["all"],
                                "start_year": 2022,
                                "end_year": 2024,
                            },
                        )
                    ],
                ),
                ModelTurn(stop_reason="end_turn", text="已完成合法範圍分析。"),
            ]
        )
        agent = YouthLMAgent(provider, build_default_tool_registry())

        with patch("main.build_default_agent", return_value=agent):
            response = request(
                create_app(module_store=InMemoryModuleStore()),
                population_request(),
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"], "已完成合法範圍分析。")
        self.assertIn(
            '"min_age":20',
            provider.requests[2].messages[-1]["content"],
        )

    def test_default_agent_repairs_two_premature_answers(self) -> None:
        provider = FakeModelProvider(
            [
                ModelTurn(stop_reason="end_turn", text="先直接回答。"),
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="repair-check",
                            name="check_compatibility",
                            arguments={
                                "source_id": POPULATION_DATASET_ID,
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
                ModelTurn(stop_reason="end_turn", text="仍然太早回答。"),
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="repair-query",
                            name="query_population_dataset",
                            arguments={
                                "dataset_id": POPULATION_DATASET_ID,
                                "geographies": ["板橋區"],
                                "age_groups": ["20-24"],
                                "sexes": ["all"],
                                "start_year": 2022,
                                "end_year": 2024,
                            },
                        )
                    ],
                ),
                ModelTurn(stop_reason="end_turn", text="已依官方資料完成分析。"),
            ]
        )
        agent = YouthLMAgent(provider, build_default_tool_registry())

        with patch("main.build_default_agent", return_value=agent):
            response = request(
                create_app(module_store=InMemoryModuleStore()),
                population_request(),
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"], "已依官方資料完成分析。")
        self.assertEqual(len(provider.requests), 5)
        self.assertIn(
            "only call check_compatibility",
            provider.requests[1].messages[-1]["content"],
        )
        self.assertIn(
            "query_population_dataset",
            provider.requests[3].messages[-1]["content"],
        )

    def test_filter_array_order_is_semantically_equivalent(self) -> None:
        provider = FakeModelProvider(
            [
                compatibility_turn(),
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="ordered-query",
                            name="query_youth_dataset",
                            arguments={
                                "dataset_id": UNEMPLOYMENT_DATASET_ID,
                                "age_groups": ["30-34", "25-29"],
                                "sexes": ["female", "male"],
                                "start_year": 2024,
                                "end_year": 2024,
                            },
                        )
                    ],
                ),
                ModelTurn(stop_reason="end_turn", text="完成比較。"),
            ]
        )
        agent = YouthLMAgent(provider, build_default_tool_registry())

        response = request(
            create_app(agent, module_store=InMemoryModuleStore()),
            unemployment_request(),
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["provenance"][0]["query_parameters"],
            {
                "dataset_id": UNEMPLOYMENT_DATASET_ID,
                "age_groups": ["30-34", "25-29"],
                "sexes": ["female", "male"],
                "start_year": 2024,
                "end_year": 2024,
            },
        )

    def test_filter_subset_is_still_rejected(self) -> None:
        provider = FakeModelProvider(
            [
                compatibility_turn(),
                ModelTurn(
                    stop_reason="tool_use",
                    tool_calls=[
                        ModelToolCall(
                            call_id="subset-query",
                            name="query_youth_dataset",
                            arguments={
                                "dataset_id": UNEMPLOYMENT_DATASET_ID,
                                "age_groups": ["25-29"],
                                "sexes": ["male", "female"],
                                "start_year": 2024,
                                "end_year": 2024,
                            },
                        )
                    ],
                ),
                ModelTurn(stop_reason="end_turn", text="不完整結果。"),
            ]
        )
        agent = YouthLMAgent(provider, build_default_tool_registry())

        response = request(
            create_app(agent, module_store=InMemoryModuleStore()),
            unemployment_request(),
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json()["error"],
            {
                "code": "agent_protocol_error",
                "message": "Agent returned an invalid analysis result",
                "retriable": False,
            },
        )


if __name__ == "__main__":
    unittest.main()
