import copy
import json
import unittest
from pathlib import Path

from spikes.analysis_api_smoke import AnalysisApiSmokeError, run_smoke

FIXTURE_ROOT = Path("contracts/fixtures/frontend-integration")


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


class AnalysisApiSmokeTests(unittest.TestCase):
    def test_posts_exact_source_fixture_then_uses_stored_module(self) -> None:
        source_request = load_fixture("analysis-request.example.json")
        source_result = load_fixture("analysis-result.example.json")
        calls: list[tuple[str, dict, int]] = []

        def transport(url: str, payload: dict, timeout_seconds: int) -> dict:
            calls.append((url, copy.deepcopy(payload), timeout_seconds))
            if len(calls) == 1:
                return source_result

            upstream_result = copy.deepcopy(source_result)
            upstream_result["module_id"] = payload["module_id"]
            upstream_result["question"] = payload["query"]
            upstream_result["upstream_module_ids"] = payload[
                "upstream_module_ids"
            ]
            upstream_result["summary"] = "上游資料顯示人口逐年下降。"
            return upstream_result

        first, second = run_smoke(
            "http://127.0.0.1:8123/",
            timeout_seconds=123,
            transport=transport,
        )

        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0], "http://127.0.0.1:8123/v1/analysis")
        self.assertEqual(calls[0][1], source_request)
        self.assertEqual(calls[0][2], 123)
        self.assertEqual(
            calls[1][1]["upstream_module_ids"],
            [source_request["module_id"]],
        )
        self.assertEqual(calls[1][1]["source_selections"], [])
        self.assertEqual(first.module_id, source_request["module_id"])
        self.assertEqual(second.module_id, "analysis_population_followup")

    def test_rejects_source_response_without_visualization(self) -> None:
        invalid_result = load_fixture("analysis-result.example.json")
        invalid_result.pop("visualization")

        with self.assertRaisesRegex(
            AnalysisApiSmokeError,
            "no visualization",
        ):
            run_smoke(
                "http://127.0.0.1:8000",
                transport=lambda _url, _payload, _timeout: invalid_result,
            )


if __name__ == "__main__":
    unittest.main()
