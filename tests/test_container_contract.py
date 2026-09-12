"""Static safety contract for the deployable single-container image."""

import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


class ContainerContractTests(unittest.TestCase):
    def test_image_builds_web_and_runs_one_non_root_api_worker(self) -> None:
        dockerfile = (REPOSITORY_ROOT / "Dockerfile").read_text(encoding="utf-8")

        for required in (
            "FROM node:22-bookworm-slim AS web-build",
            "npm ci --no-audit --no-fund",
            "npm run build",
            "FROM python:3.11-slim AS runtime",
            "COPY --from=web-build /build/apps/web/dist/ ./apps/web/dist/",
            "YOUTHLM_SERVE_WEB=1",
            "YOUTHLM_SQLITE_PATH=/data/youthlm.sqlite3",
            "YOUTHLM_ARTIFACT_DIR=/data/artifacts",
            "USER 10001:10001",
            'VOLUME ["/data"]',
            '"--host", "0.0.0.0"',
            '"--workers", "1"',
        ):
            with self.subTest(required=required):
                self.assertIn(required, dockerfile)

    def test_build_context_excludes_credentials_and_local_state(self) -> None:
        dockerignore = (REPOSITORY_ROOT / ".dockerignore").read_text(
            encoding="utf-8"
        ).splitlines()

        for required in (".env", ".env.*", ".venv", "**/node_modules", "var"):
            with self.subTest(required=required):
                self.assertIn(required, dockerignore)


if __name__ == "__main__":
    unittest.main()
