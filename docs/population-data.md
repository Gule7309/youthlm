# YouthLM data snapshot: New Taipei resident population

## Source

- Dataset: `現住人口之年齡分配`
- Provider: 新北市政府主計處
- Government catalog: <https://data.ntpc.gov.tw/datasets/8308AB58-62D1-424E-8314-24B65B7AB492>
- Original CSV: <https://data.ntpc.gov.tw/api/datasets/8308AB58-62D1-424E-8314-24B65B7AB492/csv/file>
- Unit: `人`
- Update frequency: annual
- License: 政府資料開放授權條款－第1版

The bundled snapshot was retrieved on 2026-08-31. Its original-source SHA-256 is
stored in `data/ntpc_population_by_age_sex_district.metadata.json`. The source file
contains 2,250 rows: 25 years, New Taipei City plus 29 districts, and official
all/male/female rows.

## Query dimensions

| Field | Supported values |
|---|---|
| `dataset_id` | `ntpc_population_by_age_sex_district` |
| `geography` | New Taipei City or one of its 29 districts |
| `age_group` | 21 published 5-year groups from `0-4` through `100+` |
| `sex` | `all`, `male`, `female` |
| `year` | `2000` through `2024` |
| value | `population_count` |

`query_population_dataset` normalizes only the requested cells into long-form rows.
It rejects requests above 500 result rows so a model call cannot accidentally load
the entire snapshot into context.

## Query example

```json
{
  "dataset_id": "ntpc_population_by_age_sex_district",
  "geographies": ["板橋區"],
  "age_groups": ["25-29", "30-34"],
  "sexes": ["all"],
  "start_year": 2022,
  "end_year": 2024
}
```

## Trust boundaries

The `all` rows are official published totals; YouthLM does not calculate them from
male and female rows. Geography is available only at city and district level.

The published age bands cannot represent exact ages 18–35: ages 18–19 are part of
15–19, while age 35 is part of 35–39. YouthLM may analyze whole published bands,
such as 20–34, but must narrow or refuse an exact 18–35 claim.

The checked-in version is immutable. A future source refresh creates a new hash and
dataset version instead of silently changing an existing analysis.
