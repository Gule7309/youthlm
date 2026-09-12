"""Static safety checks for the Windows demo preflight runner."""

import unittest
from pathlib import Path


class DemoPreflightRunnerContractTests(unittest.TestCase):
    def test_runner_supports_explicit_providers_and_cleans_up_api(self) -> None:
        script = Path("scripts/run-demo-preflight.ps1").read_text(encoding="utf-8")

        self.assertIn('ValidateSet("gemini", "bedrock")', script)
        self.assertIn("select-provider.ps1", script)
        self.assertIn("spikes.demo_preflight", script)
        self.assertIn("Invoke-RestMethod", script)
        self.assertIn('"$baseUrl/ready"', script)
        self.assertIn('"$baseUrl/v1/data-sources"', script)
        self.assertIn("--status-only", script)
        self.assertIn("Stop-Process -Id $serverProcess.Id", script)
        self.assertIn('".venv\\Scripts\\python.exe"', script)
        self.assertNotIn("print(sys.executable)", script)
        self.assertIn("finally {", script)

    def test_runner_checks_data_and_frontend_before_live_model_calls(self) -> None:
        script = Path("scripts/run-demo-preflight.ps1").read_text(encoding="utf-8")

        data_audit = script.index("python -m app.data_quality")
        python_tests = script.index("pytest -q")
        frontend_checks = script.index("run check")
        provider_selection = script.index("select-provider.ps1")

        self.assertLess(data_audit, python_tests)
        self.assertLess(python_tests, frontend_checks)
        self.assertLess(frontend_checks, provider_selection)
        self.assertIn("--frozen pytest -q tests apps/api/tests", script)

    def test_runner_uses_isolated_untracked_runtime_paths(self) -> None:
        script = Path("scripts/run-demo-preflight.ps1").read_text(encoding="utf-8")

        self.assertIn('"var\\demo-preflight\\$runId"', script)
        self.assertIn("$env:YOUTHLM_SQLITE_PATH", script)
        self.assertIn("$env:YOUTHLM_ARTIFACT_DIR", script)
        self.assertNotIn("Remove-Item", script)

    def test_runner_always_reports_log_directory_after_runtime_starts(self) -> None:
        script = Path("scripts/run-demo-preflight.ps1").read_text(encoding="utf-8")
        finally_block = script[script.index("finally {") :]

        self.assertIn('Write-Host "Demo artifacts and logs: $runRoot"', finally_block)

    def test_runner_handles_clipboard_without_printing_or_null_clear(self) -> None:
        script = Path("scripts/run-demo-preflight.ps1").read_text(encoding="utf-8")

        self.assertIn("if ($null -ne $clipboardKey)", script)
        self.assertIn('Set-Clipboard -Value " "', script)
        self.assertNotIn('Set-Clipboard -Value ""', script)
        self.assertNotIn("Write-Host $env:GEMINI_API_KEY", script)
        self.assertNotIn("Get-Content $stderrLog -Raw", script)

    def test_provider_selection_does_not_print_aws_identifiers(self) -> None:
        script = Path("scripts/select-provider.ps1").read_text(encoding="utf-8")
        output_section = script[script.rindex("Write-Host") :]

        self.assertNotIn("$accountId", output_section)
        self.assertNotIn("$resolvedProfile", output_section)
        self.assertNotIn("$resolvedRegion", output_section)
        self.assertNotIn("$resolvedModelId", output_section)

    def test_provider_selection_accepts_complete_sts_environment_credentials(self) -> None:
        selector = Path("scripts/select-provider.ps1").read_text(encoding="utf-8")
        runner = Path("scripts/run-demo-preflight.ps1").read_text(encoding="utf-8")
        event_runner = Path("scripts/event-day-preflight.ps1").read_text(encoding="utf-8")

        self.assertIn("UseEnvironmentCredentials", selector)
        self.assertIn("AWS credential environment variables are incomplete", selector)
        self.assertIn("AWS_PROFILE cannot be combined", selector)
        self.assertIn("UseEnvironmentCredentials", runner)
        self.assertIn("UseEnvironmentCredentials", event_runner)

    def test_event_day_command_delegates_to_full_bedrock_demo(self) -> None:
        script = Path("scripts/event-day-preflight.ps1").read_text(encoding="utf-8")

        self.assertIn('Provider = "bedrock"', script)
        self.assertIn("run-demo-preflight.ps1", script)
        self.assertNotIn("spikes.provider_smoke", script)
        self.assertIn("Gemini fallback is not permitted", script)
        self.assertIn("2026-09-12 08:00", script)
        self.assertIn("2026-09-13 13:00", script)
        self.assertIn("Get-Command aws", script)
        self.assertIn("AWS CLI v2 was not found", script)
        self.assertIn('@("us-east-1", "us-west-2")', script)
        self.assertIn("AllowOrganizerRegionOverride", script)
        self.assertIn("1.05-second minimum intervals", script)

    def test_build_preflight_proves_image_and_persistent_volume(self) -> None:
        script = Path("scripts/build-preflight.ps1").read_text(encoding="utf-8")

        event_preflight = script.index("event-day-preflight.ps1")
        image_build = script.index("docker build")

        self.assertLess(event_preflight, image_build)
        self.assertIn("docker info", script)
        self.assertIn('127.0.0.1:${Port}:8000', script)
        self.assertIn('"$baseUrl/health"', script)
        self.assertIn('"$baseUrl/ready"', script)
        self.assertIn('"$baseUrl/v1/data-sources"', script)
        self.assertIn("/data/build-preflight.marker", script)
        self.assertIn("Stop-PreflightContainer", script)
        self.assertIn("docker volume rm $volumeName", script)
        self.assertNotIn("AWS_ACCESS_KEY_ID", script)
        self.assertNotIn(".aws", script)


if __name__ == "__main__":
    unittest.main()
