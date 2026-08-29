"""Run the real YouthLM agent loop with the explicitly selected provider."""

import os

from app.agent import YouthLMAgent
from app.provider_factory import create_model_provider
from app.tooling import build_default_tool_registry


def main() -> None:
    provider_name = os.environ.get("MODEL_PROVIDER", "<unset>")
    agent = YouthLMAgent(
        provider=create_model_provider(),
        tools=build_default_tool_registry(),
    )
    result = agent.run(
        "青年失業率從 8.6 降到 8.2。請務必使用 calculate_change 工具，"
        "再用繁體中文說明絕對變化與百分比變化。"
    )

    print(f"provider={provider_name}")
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    main()
