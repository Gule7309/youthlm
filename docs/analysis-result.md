# Analysis result contract

YouthLM keeps the model's narrative separate from numeric data used by the UI.

After a successful `query_youth_dataset` execution, `AgentResult.analysis` contains:

- the original question and the model's final summary;
- a stable dataset reference and exact query filters;
- source rows, dimensions, and measure metadata;
- a provider-neutral line-chart specification with ready-to-plot points;
- provenance, snapshot version, Youth Basic Act age compatibility, and warnings.

The rows and chart points are derived directly from the deterministic tool result.
Gemini or Bedrock does not copy, recalculate, or reformat those numbers. A direct
model answer, a calculation-only answer, or a failed dataset query returns
`analysis: null`.

This is the frontend boundary for the current MVP. It intentionally does not choose
a JavaScript chart library, generate image files, predict future values, or combine
multiple datasets.
