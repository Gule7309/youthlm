# Source Registry v0

The Source Registry is the deterministic catalog behind the shared Youth Data
Commons. It prevents the model from guessing whether a dataset can support a
statistical claim.

## Installed sources

This checkpoint intentionally registers exactly one source:

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

The current source supports exact claims for the union of whole published bands,
such as ages 25–34. It returns `partial` and `refusal_required=true` for ages
18–35 because ages 18–24 and 35 are absent from this snapshot.

The engine does not proportionally split a published rate. Such a calculation
would require the numerator and denominator for each target age, which this source
does not provide. It also rejects an invented all-sex rate because only male and
female rates are published separately.

## Deferred work

This checkpoint does not add a second dataset, runtime source downloads, document
RAG, cross-source joins, or a Research Graph. The next dataset should be added by
registering a new `SourceMetadata` record and a source-specific deterministic
query tool without changing the Agent's discovery contract.
