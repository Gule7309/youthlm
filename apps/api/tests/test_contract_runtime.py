"""HTTP integration tests for YouthLM Contract v0."""

import asyncio
import unittest

import httpx
from app.agent import AgentResult, YouthLMAgent
from app.population_data import DATASET_ID as POPULATION_DATASET_ID
from app.provider import FakeModelProvider, ModelToolCall, ModelTurn
from app.tooling import build_default_tool_registry
from app.youth_data import DATASET_ID

from main import create_app


def request(app, method: str, path: str, *, json: dict | None = None) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.request(method, path, json=json)

    return asyncio.run(send())


def analysis_request(**overrides) -> dict:
    payload = {
        "contract_version": "0.1.0",
        "project_id": "project_1",
        "module_id": "analysis_1",
        "query": "比較青年失業率",
        "upstream_module_ids": [],
    }
    payload.update(overrides)
    return payload


class StubAgent:
    def __init__(self, result: AgentResult) -> None:
        self.result = result
        self.prompts: list[str] = []

    def run(self, prompt: str) -> AgentResult:
        self.prompts.append(prompt)
        return self.result


class FailingAgent:
    def run(self, prompt: str) -> AgentResult:
        raise RuntimeError(f"private provider failure for {prompt}")


class ContractRuntimeTests(unittest.TestCase):
    def test_returns_direct_contract_result(self) -> None:
        agent = StubAgent(
            AgentResult(
                answer="Direct answer",
                model_steps=1,
            )
        )

        response = request(
            create_app(agent),
            "POST",
            "/v1/analysis",
            json=analysis_request(query="  Hello  "),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(agent.prompts, ["Hello"])
        self.assertEqual(payload["contract_version"], "0.1.0")
        self.assertEqual(payload["project_id"], "project_1")
        self.assertEqual(payload["module_id"], "analysis_1")
        self.assertEqual(payload["summary"], "Direct answer")
        self.assertEqual(payload["result_data"], {"columns": [], "records": []})
        self.assertNotIn("visualization", payload)

    def test_maps_real_dataset_tool_result_to_contract(self) -> None:
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
            json=analysis_request(),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "partial")
        self.assertEqual(
            [column["name"] for column in payload["result_data"]["columns"]],
            ["year", "age_group", "sex", "unemployment_rate_percent"],
        )
        self.assertEqual(len(payload["result_data"]["records"]), 2)
        self.assertEqual(payload["visualization"]["x_field"], "year")
        self.assertEqual(
            payload["visualization"]["y_field"],
            "unemployment_rate_percent",
        )
        self.assertEqual(payload["sources"][0]["source_id"], DATASET_ID)
        self.assertEqual(
            payload["provenance"][0]["query_tool"],
            "query_youth_dataset",
        )
        self.assertEqual(payload["warnings"][0]["type"], "missing_dimension")

    def test_maps_population_tool_result_to_contract(self) -> None:
        agent = YouthLMAgent(
            provider=FakeModelProvider(
                [
                    ModelTurn(
                        stop_reason="tool_use",
                        tool_calls=[
                            ModelToolCall(
                                call_id="call-population",
                                name="query_population_dataset",
                                arguments={
                                    "dataset_id": POPULATION_DATASET_ID,
                                    "geographies": ["板橋區"],
                                    "age_groups": ["20-24"],
                                    "sexes": ["all"],
                                    "start_year": 2024,
                                    "end_year": 2024,
                                },
                            )
                        ],
                    ),
                    ModelTurn(stop_reason="end_turn", text="板橋區人口分析。"),
                ]
            ),
            tools=build_default_tool_registry(),
        )

        response = request(
            create_app(agent),
            "POST",
            "/v1/analysis",
            json=analysis_request(query="分析板橋區20至24歲人口"),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(
            payload["sources"][0]["source_id"],
            POPULATION_DATASET_ID,
        )
        self.assertEqual(
            payload["result_data"]["records"][0]["population_count"],
            27049,
        )
        self.assertEqual(
            payload["result_data"]["columns"][-1]["data_type"],
            "integer",
        )
        self.assertEqual(
            payload["visualization"]["series_fields"],
            ["geography", "age_group", "sex"],
        )

    def test_rejects_missing_upstream_context_without_running_agent(self) -> None:
        agent = StubAgent(AgentResult(answer="unused", model_steps=1))

        response = request(
            create_app(agent),
            "POST",
            "/v1/analysis",
            json=analysis_request(upstream_module_ids=["analysis_missing"]),
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(agent.prompts, [])
        self.assertEqual(response.json()["error"]["code"], "module_not_found")
        self.assertEqual(
            response.json()["error"]["details"]["missing_module_ids"],
            ["analysis_missing"],
        )

    def test_returns_structured_validation_error(self) -> None:
        response = request(
            create_app(),
            "POST",
            "/v1/analysis",
            json=analysis_request(contract_version="0.2.0", query="   "),
        )

        self.assertEqual(response.status_code, 422)
        payload = response.json()
        self.assertEqual(payload["contract_version"], "0.1.0")
        self.assertEqual(payload["error"]["code"], "validation_error")
        self.assertFalse(payload["error"]["retriable"])

    def test_hides_provider_failure_details(self) -> None:
        response = request(
            create_app(FailingAgent()),
            "POST",
            "/v1/analysis",
            json=analysis_request(),
        )

        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.json(),
            {
                "contract_version": "0.1.0",
                "error": {
                    "code": "provider_unavailable",
                    "message": "Model provider request failed",
                    "retriable": True,
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
