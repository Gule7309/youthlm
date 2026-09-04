"""Monorepo entrypoint for the YouthLM HTTP API."""

from app.api import app, create_app

__all__ = ["app", "create_app"]
