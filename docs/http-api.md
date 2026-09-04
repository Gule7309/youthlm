# YouthLM HTTP API

The HTTP layer is a thin adapter around the provider-neutral `YouthLMAgent`.
It does not contain model or dataset business logic.

## Endpoints

- `GET /health` checks the process without loading provider credentials.
- `GET /v1/data-sources` lists shared sources installed and available to every
  notebook.
- `POST /v1/analysis` accepts `{"question": "..."}` and returns `AgentResult`,
  including the optional structured `analysis` object.

Local browser clients on ports `3000` and `5173` are allowed by the default CORS
policy. Deployed frontend origins must be passed explicitly when composing the app;
the API does not use a wildcard origin.

Two New Taipei City sources are currently available to every notebook: annual
age-by-sex unemployment rates and annual resident-population counts by district,
5-year age group, and sex. Planned education, other employment, entrepreneurship,
uploaded CSV, and PDF sources are not reported as available.

Start the Gemini API on Windows after copying the API key to the clipboard:

```powershell
.\scripts\run-gemini-api.ps1
```

Then open `http://127.0.0.1:8000/docs` or call:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/v1/data-sources"

$body = @{
    question = "比較2022到2024年新北市青年失業率"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:8000/v1/analysis" `
    -ContentType "application/json" `
    -Body $body
```
