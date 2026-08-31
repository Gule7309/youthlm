import unittest
from pathlib import Path


class GeminiApiRunnerContractTests(unittest.TestCase):
    def test_selects_provider_before_starting_uvicorn(self) -> None:
        script = Path("scripts/run-gemini-api.ps1").read_text(encoding="utf-8")
        selection = script.index("select-provider.ps1")
        server_start = script.index("uv run uvicorn app.api:app")

        self.assertLess(selection, server_start)
        self.assertNotIn("$LASTEXITCODE", script[selection:server_start])

    def test_checks_native_server_exit_code(self) -> None:
        script = Path("scripts/run-gemini-api.ps1").read_text(encoding="utf-8")
        server_start = script.index("uv run uvicorn app.api:app")

        self.assertIn("$LASTEXITCODE", script[server_start:])


if __name__ == "__main__":
    unittest.main()
