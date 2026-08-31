"""Call the provider selected by MODEL_PROVIDER through the YouthLM boundary."""

import os

from app.provider import ModelRequest
from app.provider_factory import create_model_provider


def main() -> None:
    provider_name = os.environ.get("MODEL_PROVIDER", "<unset>")
    provider = create_model_provider()
    turn = provider.converse(
        ModelRequest(
            messages=[
                {
                    "role": "user",
                    "content": "Reply with exactly: YouthLM provider smoke test passed",
                }
            ]
        )
    )

    print(f"provider={provider_name}")
    print(turn.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
