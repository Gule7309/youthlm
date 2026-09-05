import unittest
from pathlib import Path


class GeminiApiRunnerContractTests(unittest.TestCase):
    def test_clipboard_handling_accepts_null_and_clears_without_null_value(self) -> None:
        for path in (
            "scripts/run-gemini-api.ps1",
            "scripts/run-gemini-agent.ps1",
        ):
            with self.subTest(path=path):
                script = Path(path).read_text(encoding="utf-8")
                self.assertIn("if ($null -ne $clipboardKey)", script)
                self.assertNotIn("(Get-Clipboard -Raw).Trim()", script)
                self.assertNotIn('Set-Clipboard -Value ""', script)

    def test_selects_provider_before_starting_uvicorn(self) -> None:
        script = Path("scripts/run-gemini-api.ps1").read_text(encoding="utf-8")
        selection = script.index("select-provider.ps1")
        server_start = script.index("uv run uvicorn main:app --app-dir apps/api")

        self.assertLess(selection, server_start)
        self.assertNotIn("$LASTEXITCODE", script[selection:server_start])
        self.assertNotIn("uv run uvicorn app.api:app", script)

    def test_checks_native_server_exit_code(self) -> None:
        script = Path("scripts/run-gemini-api.ps1").read_text(encoding="utf-8")
        server_start = script.index("uv run uvicorn main:app --app-dir apps/api")

        self.assertIn("$LASTEXITCODE", script[server_start:])


if __name__ == "__main__":
    unittest.main()
