"""Run the real YouthLM agent loop with the explicitly selected provider."""

import os

from app.agent import YouthLMAgent
from app.provider_factory import create_model_provider
from app.tooling import build_default_tool_registry

PROMPTS = {
    "unemployment": (
        "請務必使用 query_youth_dataset，查詢2022到2024年新北市25-29歲"
        "與30-34歲的男性及女性失業率，簡潔說明趨勢、單位、來源與資料限制。"
        "不得自行編造或合併官方未提供的數字。"
    ),
    "population": (
        "請先使用search_sources找到人口資料，再使用inspect_source及"
        "check_compatibility確認板橋區20-34歲是否可精確分析。最後務必使用"
        "query_population_dataset查詢2022到2024年板橋區20-24、25-29、"
        "30-34歲的官方男女合計人口，簡潔說明趨勢、單位、來源與資料限制。"
    ),
}


def main() -> None:
    provider_name = os.environ.get("MODEL_PROVIDER", "<unset>")
    scenario = os.environ.get("YOUTHLM_SMOKE_SCENARIO", "unemployment")
    prompt = PROMPTS.get(scenario)
    if prompt is None:
        raise RuntimeError(f"Unknown YouthLM smoke scenario: {scenario}")

    agent = YouthLMAgent(
        provider=create_model_provider(),
        tools=build_default_tool_registry(),
    )
    result = agent.run(prompt)

    print(f"provider={provider_name}")
    print(f"scenario={scenario}")
    print(result.model_dump_json(indent=2))


def cli() -> None:
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(f"YouthLM agent failed: {error}") from None


if __name__ == "__main__":
    cli()
