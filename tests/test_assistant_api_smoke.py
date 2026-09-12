"""Tests for the live Assistant HTTP smoke helper."""

import unittest

from spikes.assistant_api_smoke import AssistantApiSmokeError, run_smoke


class AssistantApiSmokeTests(unittest.TestCase):
    def test_requires_exactly_resolved_context(self) -> None:
        captured: dict = {}

        def transport(url: str, payload: dict, timeout_seconds: int) -> dict:
            captured.update(url=url, payload=payload, timeout=timeout_seconds)
            return {
                "contract_version": "0.1.0",
                "project_id": "project_frontend_demo",
                "assistant_id": "assistant_demo_preflight",
                "status": "completed",
                "answer": "資料限於板橋區、20至24歲與2022至2024年。",
                "model_steps": 1,
                "resolved_references": [
                    {
                        "kind": reference["kind"],
                        "reference_id": reference["reference_id"],
                        "title": reference["reference_id"],
                    }
                    for reference in payload["context_references"]
                ],
                "tool_executions": [],
            }

        result = run_smoke(
            "http://127.0.0.1:8123/",
            project_id="project_frontend_demo",
            analysis_id="analysis_population_chart",
            presentation_id="presentation_1",
            timeout_seconds=42,
            transport=transport,
        )

        self.assertEqual(captured["url"], "http://127.0.0.1:8123/v1/assistant")
        self.assertEqual(captured["timeout"], 42)
        self.assertEqual(result.model_steps, 1)
        self.assertEqual(len(result.resolved_references), 3)

    def test_rejects_missing_selected_context(self) -> None:
        with self.assertRaisesRegex(AssistantApiSmokeError, "exact selected context"):
            run_smoke(
                "http://127.0.0.1:8000",
                project_id="project_frontend_demo",
                analysis_id="analysis_population_chart",
                presentation_id="presentation_1",
                transport=lambda *_args: {
                    "contract_version": "0.1.0",
                    "project_id": "project_frontend_demo",
                    "assistant_id": "assistant_demo_preflight",
                    "status": "completed",
                    "answer": "answer",
                    "model_steps": 1,
                    "resolved_references": [],
                    "tool_executions": [],
                },
            )
