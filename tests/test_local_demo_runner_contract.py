"""Static safety checks for the full-stack Windows demo runner."""

import unittest
from pathlib import Path


class LocalDemoRunnerContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.script = Path("scripts/run-local-demo.ps1").read_text(encoding="utf-8")

    def test_uses_fresh_clipboard_key_by_default_without_printing_it(self) -> None:
        self.assertIn("Remove-Item Env:GEMINI_API_KEY", self.script)
        self.assertIn("Get-Clipboard -Raw", self.script)
        self.assertIn('Set-Clipboard -Value " "', self.script)
        self.assertIn("UseExistingGeminiKey", self.script)
        self.assertNotIn("Write-Host $env:GEMINI_API_KEY", self.script)
        self.assertNotIn('Set-Clipboard -Value ""', self.script)

    def test_validates_key_and_model_before_starting_servers(self) -> None:
        preflight = self.script.index("Assert-GeminiModelAccess $ModelId")
        api_start = self.script.index("$apiProcess = Start-Process")
        web_start = self.script.index("$webProcess = Start-Process")

        self.assertIn("x-goog-api-key", self.script)
        self.assertIn("supportedGenerationMethods", self.script)
        self.assertLess(preflight, api_start)
        self.assertLess(preflight, web_start)

    def test_starts_known_api_and_web_ports_with_isolated_runtime_state(self) -> None:
        self.assertIn("$apiPort = 8000", self.script)
        self.assertIn("$webPort = 5173", self.script)
        self.assertIn('"var\\demo-session\\$runId"', self.script)
        self.assertIn("$env:YOUTHLM_SQLITE_PATH", self.script)
        self.assertIn("$env:YOUTHLM_ARTIFACT_DIR", self.script)
        self.assertIn('"--strictPort"', self.script)

    def test_waits_for_both_services_and_cleans_up_both_processes(self) -> None:
        self.assertIn('Wait-HttpReady "YouthLM API"', self.script)
        self.assertIn('Wait-HttpReady "YouthLM web"', self.script)
        self.assertIn('"node_modules\\vite\\bin\\vite.js"', self.script)
        self.assertIn("-FilePath $nodeExecutable", self.script)
        self.assertIn('Stop-DemoProcess $webProcess "YouthLM web"', self.script)
        self.assertIn('Stop-DemoProcess $apiProcess "YouthLM API"', self.script)
        self.assertIn("finally {", self.script)

    def test_runs_backend_and_frontend_quality_gates(self) -> None:
        self.assertIn('Require-Command "npm.cmd"', self.script)
        self.assertIn("uv run pytest -q", self.script)
        self.assertIn("uv run ruff check .", self.script)
        self.assertIn("run check", self.script)
        self.assertIn("SkipQualityChecks", self.script)


if __name__ == "__main__":
    unittest.main()
