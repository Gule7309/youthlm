"""Create the explicitly selected model provider from environment settings."""

import os
from collections.abc import Callable, Mapping
from typing import Any

from app.bedrock_provider import BedrockConverseProvider
from app.gemini_provider import GeminiGenerateContentProvider, GeminiTransport
from app.provider import ModelProvider

BedrockClientFactory = Callable[..., Any]


class ProviderConfigurationError(RuntimeError):
    """Raised when the selected provider is missing required configuration."""


def create_model_provider(
    environ: Mapping[str, str] | None = None,
    *,
    bedrock_client_factory: BedrockClientFactory | None = None,
    gemini_transport: GeminiTransport | None = None,
) -> ModelProvider:
    """Create one provider without silently falling back to another provider."""
    settings = environ if environ is not None else os.environ
    provider_name = _required(settings, "MODEL_PROVIDER").lower()

    if provider_name == "gemini":
        return GeminiGenerateContentProvider(
            api_key=_required(settings, "GEMINI_API_KEY"),
            model_id=_required(settings, "GEMINI_MODEL_ID"),
            transport=gemini_transport,
        )

    if provider_name == "bedrock":
        region = _required(settings, "AWS_REGION")
        model_id = _required(settings, "BEDROCK_MODEL_ID")

        if bedrock_client_factory is None:
            import boto3

            bedrock_client_factory = boto3.client

        client = bedrock_client_factory(
            "bedrock-runtime",
            region_name=region,
        )
        return BedrockConverseProvider(client=client, model_id=model_id)

    raise ProviderConfigurationError(
        f"Unsupported MODEL_PROVIDER: {provider_name}. Use 'gemini' or 'bedrock'."
    )


def _required(settings: Mapping[str, str], name: str) -> str:
    value = settings.get(name)
    if value is None or not value.strip():
        raise ProviderConfigurationError(
            f"Missing required environment variable: {name}"
        )
    return value.strip()
