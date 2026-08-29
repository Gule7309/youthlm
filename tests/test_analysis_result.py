import unittest

from app.analysis_result import AnalysisResultError, build_analysis_result
from app.provider import ModelToolCall
from app.tooling import ToolExecution, build_default_tool_registry
from app.youth_data import DATASET_ID


def run_dataset_query() -> ToolExecution:
    return build_default_tool_registry().execute(
        ModelToolCall(
            call_id="call-1",
            name="query_youth_dataset",
            arguments={
                "dataset_id": DATASET_ID,
                "age_groups": ["25-29", "30-34"],
                "sexes": ["male", "female"],
                "start_year": 2023,
                "end_year": 2024,
            },
        )
    )


class AnalysisResultTests(unittest.TestCase):
    def test_builds_ui_ready_result_from_dataset_tool(self) -> None:
        analysis = build_analysis_result(
            question="比較青年失業率",
            summary="男性與女性趨勢不同。",
            executions=[run_dataset_query()],
        )

        self.assertIsNotNone(analysis)
        assert analysis is not None
        self.assertEqual(analysis.dataset_ref.dataset_id, DATASET_ID)
        self.assertEqual(analysis.dataset_ref.agency, "新北市政府主計處")
        self.assertEqual(analysis.measure.unit, "%")
        self.assertEqual(len(analysis.rows), 8)
        self.assertEqual(analysis.visualization_spec.type, "line")
        self.assertEqual(
            [series.key for series in analysis.visualization_spec.series],
            [
                "25-29:male",
                "25-29:female",
                "30-34:male",
                "30-34:female",
            ],
        )
        self.assertEqual(
            analysis.visualization_spec.series[0].points[0].model_dump(),
            {"x": 2023, "y": 5.4},
        )

    def test_preserves_warnings_compatibility_and_version(self) -> None:
        analysis = build_analysis_result(
            question="比較青年失業率",
            summary="摘要",
            executions=[run_dataset_query()],
        )

        assert analysis is not None
        self.assertEqual(
            analysis.youth_definition_compatibility["status"],
            "partial",
        )
        self.assertIn("不可用未加權平均", analysis.warnings[0])
        self.assertEqual(
            analysis.dataset_version["source_sha256"],
            analysis.provenance["source_sha256"],
        )

    def test_returns_none_without_successful_dataset_query(self) -> None:
        analysis = build_analysis_result(
            question="Hello",
            summary="Direct answer",
            executions=[
                ToolExecution(
                    call_id="call-1",
                    name="calculate_change",
                    arguments={"old_value": 1, "new_value": 2},
                    result={"absolute_change": 1},
                ),
                ToolExecution(
                    call_id="call-2",
                    name="query_youth_dataset",
                    arguments={},
                    error="invalid query",
                ),
            ],
        )

        self.assertIsNone(analysis)

    def test_rejects_malformed_successful_tool_result(self) -> None:
        with self.assertRaisesRegex(AnalysisResultError, "missing required"):
            build_analysis_result(
                question="Hello",
                summary="Answer",
                executions=[
                    ToolExecution(
                        call_id="call-1",
                        name="query_youth_dataset",
                        arguments={},
                        result={"rows": []},
                    )
                ],
            )


if __name__ == "__main__":
    unittest.main()
