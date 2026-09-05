"""Contract models stay aligned with the published canonical examples."""

import json
import unittest
from pathlib import Path

from pydantic import ValidationError

from contract_models import AnalysisRequest, AnalysisResult, ModuleContext

REPOSITORY_ROOT = Path(__file__).parents[3]


class ContractModelTests(unittest.TestCase):
    def test_accepts_canonical_analysis_request(self) -> None:
        payload = json.loads(
            (REPOSITORY_ROOT / "contracts/examples/analysis-request.json").read_text(
                encoding="utf-8"
            )
        )

        request = AnalysisRequest.model_validate(payload)

        self.assertEqual(request.contract_version, "0.1.0")
        self.assertEqual(request.module_id, "analysis_2")
        self.assertEqual(request.source_selections, [])

    def test_accepts_canonical_analysis_result(self) -> None:
        payload = json.loads(
            (REPOSITORY_ROOT / "contracts/examples/analysis-result.json").read_text(
                encoding="utf-8"
            )
        )

        result = AnalysisResult.model_validate(payload)

        self.assertEqual(result.contract_version, "0.1.0")
        self.assertEqual(len(result.result_data.records), 6)

    def test_accepts_canonical_module_context(self) -> None:
        payload = json.loads(
            (REPOSITORY_ROOT / "contracts/examples/module-context.json").read_text(
                encoding="utf-8"
            )
        )

        context = ModuleContext.model_validate(payload)

        self.assertEqual(context.project_id, "project_1")
        self.assertEqual(context.module_id, "analysis_1")

    def test_rejects_visualization_using_undeclared_column(self) -> None:
        payload = json.loads(
            (REPOSITORY_ROOT / "contracts/examples/analysis-result.json").read_text(
                encoding="utf-8"
            )
        )
        payload["visualization"]["y_field"] = "invented_value"

        with self.assertRaisesRegex(ValidationError, "undeclared columns"):
            AnalysisResult.model_validate(payload)


if __name__ == "__main__":
    unittest.main()
