"""HTTP integration tests for project-scoped Assistant context."""

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

import httpx
from app.agent import AgentResult
from app.tooling import ToolExecution

from contract_models import AnalysisResult, PresentationResult
from main import create_app
from module_store import InMemoryModuleStore
from presentation_generator import PresentationGenerator
from presentation_result_store import InMemoryPresentationResultStore
from presentation_service import PresentationService
from presentation_store import LocalPresentationArtifactStore

REPOSITORY_ROOT = Path(__file__).parents[3]
ANALYSIS_FIXTURE = (
    REPOSITORY_ROOT / "contracts/examples/analysis-result.json"
)
PRESENTATION_FIXTURE = (
    REPOSITORY_ROOT / "contracts/examples/presentation-result.json"
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


class StubAgent:
    def __init__(self, result: AgentResult | None = None) -> None:
        self.prompts: list[str] = []
        self.result = result

    def run(self, prompt: str) -> AgentResult:
        self.prompts.append(prompt)
        return self.result or AgentResult(
            answer="決策者應保留年齡涵蓋與資料年度限制。",
            model_steps=2,
            tool_executions=[
                ToolExecution(
                    call_id="call_1",
                    name="inspect_source",
                    arguments={
                        "source_id": "ntpc_unemployment_by_age_sex",
                    },
                    result={"status": "available"},
                )
            ],
        )


class UnusedGenerator(PresentationGenerator):
    def generate(self, request, modules) -> bytes:
        raise AssertionError("Assistant context must not regenerate a presentation")


def build_test_app(agent: StubAgent):
    module_store = InMemoryModuleStore()
    analysis = AnalysisResult.model_validate_json(
        ANALYSIS_FIXTURE.read_text(encoding="utf-8")
    )
    module_store.save(analysis)

    presentation_store = InMemoryPresentationResultStore()
    presentation = PresentationResult.model_validate_json(
        PRESENTATION_FIXTURE.read_text(encoding="utf-8")
    )
    presentation_store.save(presentation)

    temporary_directory = tempfile.TemporaryDirectory()
    service = PresentationService(
        module_store,
        UnusedGenerator(),
        LocalPresentationArtifactStore(temporary_directory.name),
        result_store=presentation_store,
    )
    app = create_app(
        agent,
        module_store=module_store,
        presentation_service=service,
    )
    return app, temporary_directory


def assistant_request(**overrides) -> dict:
    payload = json.loads(
        (
            REPOSITORY_ROOT / "contracts/examples/assistant-request.json"
        ).read_text(encoding="utf-8")
    )
    payload.update(overrides)
    return payload


class AssistantRuntimeTests(unittest.TestCase):
    def test_frontend_fixture_matches_assistant_endpoint(self) -> None:
        fixture_root = REPOSITORY_ROOT / "contracts/fixtures/frontend-integration"
        expected = json.loads(
            (fixture_root / "assistant-result.example.json").read_text(
                encoding="utf-8"
            )
        )
        agent = StubAgent(
            AgentResult(
                answer=expected["answer"],
                model_steps=expected["model_steps"],
            )
        )
        app, temporary_directory = build_test_app(agent)
        self.addCleanup(temporary_directory.cleanup)
        request_payload = json.loads(
            (fixture_root / "assistant-request.example.json").read_text(
                encoding="utf-8"
            )
        )

        response = request(app, "POST", "/v1/assistant", json=request_payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), expected)

    def test_resolves_source_analysis_and_presentation_before_agent_call(self) -> None:
        agent = StubAgent()
        app, temporary_directory = build_test_app(agent)
        self.addCleanup(temporary_directory.cleanup)

        response = request(app, "POST", "/v1/assistant", json=assistant_request())

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "completed")
        self.assertEqual(payload["answer"], "決策者應保留年齡涵蓋與資料年度限制。")
        self.assertEqual(
            [item["kind"] for item in payload["resolved_references"]],
            ["source", "analysis", "presentation"],
        )
        self.assertEqual(
            payload["tool_executions"],
            [
                {
                    "call_id": "call_1",
                    "name": "inspect_source",
                    "arguments": {
                        "source_id": "ntpc_unemployment_by_age_sex",
                    },
                    "status": "completed",
                }
            ],
        )
        self.assertEqual(len(agent.prompts), 1)
        self.assertIn("失業率－年齡別", agent.prompts[0])
        self.assertIn("板橋區青年人口趨勢", agent.prompts[0])
        self.assertIn("source_modules", agent.prompts[0])
        self.assertNotIn('"x":', agent.prompts[0])
        self.assertNotIn('"y":', agent.prompts[0])

    def test_missing_cross_project_reference_does_not_call_agent(self) -> None:
        agent = StubAgent()
        app, temporary_directory = build_test_app(agent)
        self.addCleanup(temporary_directory.cleanup)

        response = request(
            app,
            "POST",
            "/v1/assistant",
            json=assistant_request(
                project_id="different_project",
                context_references=[
                    {
                        "kind": "analysis",
                        "reference_id": "analysis_1",
                    },
                    {
                        "kind": "presentation",
                        "reference_id": "presentation_1",
                    },
                ],
            ),
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"]["code"], "context_not_found")
        self.assertEqual(
            response.json()["error"]["details"]["missing_references"],
            [
                {"kind": "analysis", "reference_id": "analysis_1"},
                {"kind": "presentation", "reference_id": "presentation_1"},
            ],
        )
        self.assertEqual(agent.prompts, [])

    def test_rejects_filters_on_non_source_reference(self) -> None:
        agent = StubAgent()
        app, temporary_directory = build_test_app(agent)
        self.addCleanup(temporary_directory.cleanup)

        response = request(
            app,
            "POST",
            "/v1/assistant",
            json=assistant_request(
                context_references=[
                    {
                        "kind": "analysis",
                        "reference_id": "analysis_1",
                        "filters": {"year": 2024},
                    }
                ]
            ),
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "validation_error")
        self.assertEqual(
            response.json()["error"]["message"],
            "Assistant request validation failed",
        )
        self.assertEqual(agent.prompts, [])


if __name__ == "__main__":
    unittest.main()
