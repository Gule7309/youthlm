import unittest
from typing import Any

from app.bedrock_provider import BedrockConverseProvider
from app.gemini_provider import GeminiGenerateContentProvider
from app.provider_factory import (
    ProviderConfigurationError,
    create_model_provider,
)


class FakeBedrockClientFactory:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.client = object()

    def __call__(self, service_name: str, **kwargs: Any) -> object:
        self.calls.append({"service_name": service_name, **kwargs})
        return self.client


class ProviderFactoryTests(unittest.TestCase):
    def test_selects_gemini_explicitly(self) -> None:
        provider = create_model_provider(
            {
                "MODEL_PROVIDER": "gemini",
                "GEMINI_API_KEY": "test-key",
                "GEMINI_MODEL_ID": "gemini-test",
            }
        )

        self.assertIsInstance(provider, GeminiGenerateContentProvider)

    def test_selects_bedrock_explicitly(self) -> None:
        client_factory = FakeBedrockClientFactory()

        provider = create_model_provider(
            {
                "MODEL_PROVIDER": "bedrock",
                "AWS_REGION": "us-west-2",
                "BEDROCK_MODEL_ID": "test-model",
            },
            bedrock_client_factory=client_factory,
        )

        self.assertIsInstance(provider, BedrockConverseProvider)
        self.assertEqual(
            client_factory.calls,
            [
                {
                    "service_name": "bedrock-runtime",
                    "region_name": "us-west-2",
                }
            ],
        )

    def test_requires_an_explicit_provider(self) -> None:
        with self.assertRaisesRegex(
            ProviderConfigurationError,
            "MODEL_PROVIDER",
        ):
            create_model_provider({})

    def test_missing_bedrock_setting_does_not_fall_back_to_gemini(self) -> None:
        with self.assertRaisesRegex(
            ProviderConfigurationError,
            "BEDROCK_MODEL_ID",
        ):
            create_model_provider(
                {
                    "MODEL_PROVIDER": "bedrock",
                    "AWS_REGION": "us-west-2",
                    "GEMINI_API_KEY": "would-have-worked",
                    "GEMINI_MODEL_ID": "gemini-test",
                },
                bedrock_client_factory=FakeBedrockClientFactory(),
            )

    def test_rejects_unknown_provider(self) -> None:
        with self.assertRaisesRegex(
            ProviderConfigurationError,
            "Unsupported MODEL_PROVIDER",
        ):
            create_model_provider({"MODEL_PROVIDER": "automatic"})


if __name__ == "__main__":
    unittest.main()
