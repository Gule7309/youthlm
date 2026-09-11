# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS web-build

WORKDIR /build/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web/ ./
RUN npm run build


FROM ghcr.io/astral-sh/uv:0.11.21 AS uv-bin


FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/srv/youthlm:/srv/youthlm/apps/api \
    YOUTHLM_SERVE_WEB=1 \
    YOUTHLM_WEB_DIST_DIR=/srv/youthlm/apps/web/dist \
    YOUTHLM_SQLITE_PATH=/data/youthlm.sqlite3 \
    YOUTHLM_ARTIFACT_DIR=/data/artifacts

WORKDIR /srv/youthlm

COPY --from=uv-bin /uv /uvx /usr/local/bin/
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app/ ./app/
COPY apps/api/ ./apps/api/
COPY data/ ./data/
COPY --from=web-build /build/apps/web/dist/ ./apps/web/dist/

RUN groupadd --gid 10001 youthlm \
    && useradd --uid 10001 --gid youthlm --no-create-home youthlm \
    && mkdir -p /data/artifacts \
    && chown -R youthlm:youthlm /data

USER 10001:10001

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["/srv/youthlm/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2).read()"]

CMD ["/srv/youthlm/.venv/bin/python", "-m", "uvicorn", "main:app", "--app-dir", "apps/api", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
