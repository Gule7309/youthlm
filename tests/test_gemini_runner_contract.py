import unittest
from pathlib import Path


class GeminiRunnerContractTests(unittest.TestCase):
    def test_does_not_read_stale_native_exit_code_after_provider_script(self) -> None:
        script = Path("scripts/run-gemini-agent.ps1").read_text(encoding="utf-8")
        selection = script.index("select-provider.ps1")
        agent_invocation = script.index("uv run python -m spikes.agent_smoke")

        self.assertNotIn("$LASTEXITCODE", script[selection:agent_invocation])

    def test_checks_native_agent_process_exit_code(self) -> None:
        script = Path("scripts/run-gemini-agent.ps1").read_text(encoding="utf-8")
        agent_invocation = script.index("uv run python -m spikes.agent_smoke")

        self.assertIn("$LASTEXITCODE", script[agent_invocation:])


if __name__ == "__main__":
    unittest.main()
