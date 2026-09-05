# YouthLM web integration reference

`apps/web` currently contains a framework-neutral Chart Artifact adapter, not a
frontend application scaffold. This prevents the backend checkpoint from choosing
React, Vite, Next.js, React Flow, styling, or Canvas state on behalf of the
frontend owner.

The reference adapter converts the public Contract v0 response into one of four
explicit states:

- `chart`: render `chartOption` with Apache ECharts;
- `table`: render the declared columns and deterministic records;
- `blocked`: show the blocking explanation and do not render a chart;
- `error`: show the HTTP/API failure and retry only when `retriable` is true.

Run the reference tests without installing dependencies:

```bash
cd apps/web
npm test
```

In the actual frontend, install ECharts using the package manager already chosen
by the frontend team. Pass the API JSON and HTTP status to
`buildChartArtifactView()`, then give `view.chartOption` to the ECharts instance
only when `view.kind === "chart"`.

See [`docs/frontend-chart-artifact.md`](../../docs/frontend-chart-artifact.md)
for rendering, interaction, trust-state, and future Presentation Artifact rules.
