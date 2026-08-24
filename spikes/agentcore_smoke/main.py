"""Isolated AgentCore smoke test.

This file proves AWS model access and AgentCore hosting. It is deliberately not
imported by the YouthLM application package.
"""

import os
from typing import Any

import boto3
from bedrock_agentcore import BedrockAgentCoreApp


app = BedrockAgentCoreApp()


def _required_environment(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@app.entrypoint
def handler(request: dict[str, Any]) -> dict[str, str]:
    prompt = request.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string")

    client = boto3.client(
        "bedrock-runtime",
        region_name=_required_environment("AWS_REGION"),
    )
    response = client.converse(
        modelId=_required_environment("BEDROCK_MODEL_ID"),
        messages=[
            {
                "role": "user",
                "content": [{"text": prompt}],
            }
        ],
        inferenceConfig={"maxTokens": 256, "temperature": 0},
    )

    text = "".join(
        block.get("text", "")
        for block in response["output"]["message"]["content"]
        if "text" in block
    )
    return {
        "result": text,
        "stop_reason": response["stopReason"],
    }


if __name__ == "__main__":
    app.run()

