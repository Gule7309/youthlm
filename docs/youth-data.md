# YouthLM data snapshot: New Taipei unemployment rate

## Source

- Dataset: `失業率－年齡別`
- Provider: 新北市政府主計處
- Government catalog: <https://data.gov.tw/dataset/125003>
- Original CSV: <https://data.ntpc.gov.tw/api/datasets/c29c80d4-bef1-452c-8d9a-659e72f07831/csv/file>
- Unit: `%`
- Update frequency: annual
- License: 政府資料開放授權條款－第1版

The bundled snapshot was retrieved on 2026-08-29. Its original-source SHA-256 is
stored in `data/ntpc_unemployment_by_age_sex.metadata.json`. The normalized file
contains 76 observations covering 2006–2024.

## Normalized dimensions

| Field | Supported values |
|---|---|
| `dataset_id` | `ntpc_unemployment_by_age_sex` |
| `age_group` | `25-29`, `30-34` |
| `sex` | `male`, `female` |
| `year` | `2006` through `2024` |
| value | `unemployment_rate_percent` |

## Query contract

`query_youth_dataset` requires:

```json
{
  "dataset_id": "ntpc_unemployment_by_age_sex",
  "age_groups": ["25-29", "30-34"],
  "sexes": ["male", "female"],
  "start_year": 2022,
  "end_year": 2024
}
```

The result contains:

- the filtered official rows;
- dataset title, agency, geography, unit, and available period;
- the exact normalized query;
- source page, download URL, snapshot date, hash, and license;
- YouthLM age-definition compatibility and warnings.

## Trust boundaries

The source publishes male and female rates separately. It does not publish an
all-sex rate in this dataset, and rates cannot be combined with an unweighted
average. The tool therefore rejects `sex = all`.

YouthLM targets ages 18–35, while this snapshot includes only ages 25–34. Every
query reports `partial` compatibility and must not be described as representing
all youth aged 18–35.

The application reads the checked-in snapshot at runtime. It does not depend on
the government endpoint being reachable during a demo, and it never silently
updates a prior analysis when the source changes.
