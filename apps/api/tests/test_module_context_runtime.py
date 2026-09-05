"""HTTP tests for persistent, project-scoped upstream module context."""

import asyncio
import json
import tempfile
import unittest
from pathlib import Path

import httpx
from app.agent import AgentResult

from contract_models import AnalysisResult
from main import create_app
from module_store import ModuleStoreError, SQLiteModuleStore

REPOSITORY_ROOT = Path(__file__).parents[3]
RESULT_FIXTURE = (
    REPOSITORY_ROOT
    / "contracts/fixtures/frontend-integration/analysis-result.example.json"
)


def request(app, payload: dict) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            return await client.post("/v1/analysis", json=payload)

    return asyncio.run(send())


def analysis_request(
    module_id: str,
    *,
    project_id: str = "project_1",
    upstream_module_ids: list[str] | None = None,
) -> dict:
    return {
        "contract_version": "0.1.0",
        "project_id": project_id,
        "module_id": module_id,
        "query": f"Analyze {module_id}",
        "upstream_module_ids": upstream_module_ids or [],
    }


class CapturingAgent:
    def __init__(self, answers: list[str]) -> None:
        self._answers = iter(answers)
        self.prompts: list[str] = []

    def run(self, prompt: str) -> AgentResult:
        self.prompts.append(prompt)
        return AgentResult(
            answer=next(self._answers),
            model_steps=1,
        )


class FailingModuleStore:
    def __init__(self, *, fail_on: str) -> None:
        self._fail_on = fail_on

    def get_context(self, project_id: str, module_id: str):
        if self._fail_on == "load":
            raise ModuleStoreError(f"private load failure: {project_id}/{module_id}")

    def save(self, result) -> None:
        if self._fail_on == "save":
            raise ModuleStoreError(f"private save failure: {result.module_id}")


class ModuleContextRuntimeTests(unittest.TestCase):
    def test_persists_then_supplies_structured_upstream_context(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "youthlm.sqlite3"
            store = SQLiteModuleStore(database_path)
            agent = CapturingAgent(["First result", "Downstream result"])
            app = create_app(agent, module_store=store)

            first = request(app, analysis_request("analysis_1"))
            downstream = request(
                app,
                analysis_request(
                    "analysis_2",
                    upstream_module_ids=["analysis_1"],
                ),
            )

            self.assertEqual(first.status_code, 200)
            self.assertEqual(downstream.status_code, 200)
            self.assertEqual(agent.prompts[0], "Analyze analysis_1")
            self.assertIn(
                "YouthLM verified upstream module contexts",
                agent.prompts[1],
            )
            self.assertIn('"module_id":"analysis_1"', agent.prompts[1])
            self.assertIn('"summary":"First result"', agent.prompts[1])
            stored = store.get_context("project_1", "analysis_2")
            self.assertEqual(stored.upstream_module_ids, ["analysis_1"])

    def test_supplies_upstream_rows_sources_and_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteModuleStore(Path(directory) / "youthlm.sqlite3")
            stored_result = AnalysisResult.model_validate(
                json.loads(RESULT_FIXTURE.read_text(encoding="utf-8"))
            )
            store.save(stored_result)
            agent = CapturingAgent(["Downstream analysis"])

            response = request(
                create_app(agent, module_store=store),
                analysis_request(
                    "analysis_2",
                    project_id=stored_result.project_id,
                    upstream_module_ids=[stored_result.module_id],
                ),
            )

            self.assertEqual(response.status_code, 200)
            prompt = agent.prompts[0]
            self.assertIn('"population_count":28472', prompt)
            self.assertIn(
                '"source_id":"ntpc_population_by_age_sex_district"',
                prompt,
            )
            self.assertIn('"query_tool":"query_population_dataset"', prompt)

    def test_context_survives_api_and_store_recreation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            database_path = Path(directory) / "youthlm.sqlite3"
            first_agent = CapturingAgent(["Persisted result"])
            first_app = create_app(
                first_agent,
                module_store=SQLiteModuleStore(database_path),
            )
            self.assertEqual(
                request(first_app, analysis_request("analysis_1")).status_code,
                200,
            )

            restarted_agent = CapturingAgent(["Result after restart"])
            restarted_app = create_app(
                restarted_agent,
                module_store=SQLiteModuleStore(database_path),
            )
            response = request(
                restarted_app,
                analysis_request(
                    "analysis_2",
                    upstream_module_ids=["analysis_1"],
                ),
            )

            self.assertEqual(response.status_code, 200)
            self.assertIn(
                '"summary":"Persisted result"',
                restarted_agent.prompts[0],
            )

    def test_same_module_id_cannot_be_read_from_another_project(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteModuleStore(Path(directory) / "youthlm.sqlite3")
            first_agent = CapturingAgent(["Private project result"])
            app = create_app(first_agent, module_store=store)
            self.assertEqual(
                request(
                    app,
                    analysis_request("analysis_1", project_id="project_a"),
                ).status_code,
                200,
            )

            other_project_agent = CapturingAgent(["must not run"])
            other_project_app = create_app(
                other_project_agent,
                module_store=store,
            )
            response = request(
                other_project_app,
                analysis_request(
                    "analysis_2",
                    project_id="project_b",
                    upstream_module_ids=["analysis_1"],
                ),
            )

            self.assertEqual(response.status_code, 404)
            self.assertEqual(
                response.json()["error"]["details"]["missing_module_ids"],
                ["analysis_1"],
            )
            self.assertEqual(other_project_agent.prompts, [])

    def test_reports_only_missing_upstream_module_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = SQLiteModuleStore(Path(directory) / "youthlm.sqlite3")
            agent = CapturingAgent(["Stored result"])
            app = create_app(agent, module_store=store)
            self.assertEqual(
                request(app, analysis_request("analysis_1")).status_code,
                200,
            )

            response = request(
                app,
                analysis_request(
                    "analysis_2",
                    upstream_module_ids=[
                        "analysis_1",
                        "analysis_missing",
                    ],
                ),
            )

            self.assertEqual(response.status_code, 404)
            self.assertEqual(
                response.json()["error"]["details"]["missing_module_ids"],
                ["analysis_missing"],
            )
            self.assertEqual(len(agent.prompts), 1)

    def test_returns_safe_internal_error_when_context_load_fails(self) -> None:
        agent = CapturingAgent(["must not run"])

        response = request(
            create_app(
                agent,
                module_store=FailingModuleStore(fail_on="load"),
            ),
            analysis_request(
                "analysis_2",
                upstream_module_ids=["analysis_1"],
            ),
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.json(),
            {
                "contract_version": "0.1.0",
                "error": {
                    "code": "internal_error",
                    "message": "Module context storage failed",
                    "retriable": True,
                },
            },
        )
        self.assertEqual(agent.prompts, [])

    def test_does_not_return_success_when_context_save_fails(self) -> None:
        agent = CapturingAgent(["Result that cannot be stored"])

        response = request(
            create_app(
                agent,
                module_store=FailingModuleStore(fail_on="save"),
            ),
            analysis_request("analysis_1"),
        )

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["error"]["code"], "internal_error")
        self.assertEqual(len(agent.prompts), 1)


if __name__ == "__main__":
    unittest.main()
