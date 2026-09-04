# Source Registry v0

The Source Registry is the deterministic catalog behind the shared Youth Data
Commons. It prevents the model from guessing whether a dataset can support a
statistical claim.

## Installed sources

Every notebook currently receives two installed sources:

### Unemployment rate

| Field | Value |
|---|---|
| Source ID | `ntpc_unemployment_by_age_sex` |
| Title | 失業率－年齡別 |
| Agency | 新北市政府主計處 |
| Geography | 新北市, municipality level |
| Time | Annual, 2006–2024 |
| Age bands | 25–29 and 30–34 in the installed snapshot |
| Sex | Male and female separately |
| Unit | Percent |
| Query tool | `query_youth_dataset` |
| Status | `available`; shared and mounted by default |

### Resident population

| Field | Value |
|---|---|
| Source ID | `ntpc_population_by_age_sex_district` |
| Title | 現住人口之年齡分配 |
| Agency | 新北市政府主計處 |
| Geography | 新北市 plus 29 districts |
| Time | Annual, 2000–2024 |
| Age bands | 21 published 5-year groups from 0–4 through 100+ |
| Sex | Official all, male, and female counts |
| Unit | People |
| Query tool | `query_population_dataset` |
| Status | `available`; shared and mounted by default |

The registry also exposes source URL, download URL, dimensions, join keys,
limitations, last sync date, snapshot hash, and an immutable dataset version ID.
`GET /v1/data-sources` returns this same metadata contract to the frontend.

## Agent tools

### `search_sources`

Searches source summaries by keyword, source ID, agency, policy domain, indicator,
or capability. It does not load data rows.

### `inspect_source`

Returns the full metadata record for one exact `source_id`. Unknown IDs fail
explicitly.

### `check_compatibility`

Checks requested age, year, geography, sex, and unit dimensions. The result
contains:

- an overall `exact`, `partial`, `estimated`, or `incompatible` status;
- per-dimension evidence;
- `safe_to_query` and `safe_to_claim_requested_scope` flags;
- `refusal_required` and a recommended narrower claim;
- the source's known limitations.

## Youth age rule

The unemployment source supports exact claims for the union of its whole published
bands, such as ages 25–34. The population source supports more 5-year bands and
districts, but a full 18–35 claim still returns `partial` and
`refusal_required=true`: 18–19 are inside 15–19 and age 35 is inside 35–39.

The engine does not proportionally split a published group. It also rejects an
invented all-sex unemployment rate because that source publishes only male and
female rates separately. The population source's `all` value is safe because it is
an official published count.

## Deferred work

This checkpoint does not add runtime source downloads, document RAG, cross-source
joins, or a Research Graph. The checked-in snapshots keep the demo reproducible
even when a government endpoint is unavailable.
