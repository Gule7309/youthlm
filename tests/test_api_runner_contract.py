import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).parents[1].resolve()


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
        python_path = script.index("$env:PYTHONPATH =")
        server_start = script.index("uv run uvicorn main:app --app-dir apps/api")

        self.assertLess(selection, server_start)
        self.assertLess(python_path, server_start)
        self.assertNotIn("$LASTEXITCODE", script[selection:server_start])
        self.assertNotIn("uv run uvicorn app.api:app", script)
        self.assertIn("[IO.Path]::PathSeparator", script)

    def test_contract_app_imports_with_explicit_api_and_repo_paths(self) -> None:
        environment = os.environ.copy()
        environment["PYTHONPATH"] = os.pathsep.join(
            (
                str(REPOSITORY_ROOT),
                str(REPOSITORY_ROOT / "apps/api"),
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            completed = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    "from main import app; print(app.title)",
                ],
                cwd=directory,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(completed.stdout.strip(), "YouthLM API")

    def test_checks_native_server_exit_code(self) -> None:
        script = Path("scripts/run-gemini-api.ps1").read_text(encoding="utf-8")
        server_start = script.index("uv run uvicorn main:app --app-dir apps/api")

        self.assertIn("$LASTEXITCODE", script[server_start:])


if __name__ == "__main__":
    unittest.main()
