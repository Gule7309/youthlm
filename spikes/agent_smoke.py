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
        "請務必使用 query_youth_dataset，查詢2022到2024年新北市25-29歲"
        "與30-34歲的男性及女性失業率，簡潔說明趨勢、單位、來源與資料限制。"
        "不得自行編造或合併官方未提供的數字。"
    )

    print(f"provider={provider_name}")
    print(result.model_dump_json(indent=2))


def cli() -> None:
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"YouthLM agent failed: {error}") from None


if __name__ == "__main__":
    cli()
