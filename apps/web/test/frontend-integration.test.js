import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

async function loadTypeScriptModule(relativePath) {
  const moduleUrl = new URL(relativePath, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(moduleUrl, "utf8"), {
    fileName: moduleUrl.pathname,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const {
  buildAnalysisRequest,
  buildDefaultSourceFilters,
} = await loadTypeScriptModule("../src/app/analysis-integration.ts");
const { listDataSources, runAnalysis } = await loadTypeScriptModule("../src/app/api-client.ts");

function registrySource() {
  return {
    source_id: "ntpc_population_by_age_sex_district",
    title: "現住人口之年齡分配",
    agency: "新北市政府主計處",
    policy_domain: "demographics",
    status: "available",
    geography: "新北市",
    available_geographies: ["新北市", "板橋區"],
    available_age_groups: ["20-24", "25-29"],
    available_sexes: ["all", "male", "female"],
    available_dimensions: ["year", "geography", "age_group", "sex"],
    available_years: { start: 2000, end: 2024 },
    unit: "人",
    youth_compatibility: { target: "18-35", status: "partial", explanation: "五歲級距" },
  };
}

function sourceNode() {
  return {
    id: "canvas-source-1",
    type: "source",
    x: 100,
    y: 200,
    source: {
      kind: "registry",
      name: "板橋青年人口",
      enabled: true,
      autoClean: true,
      registrySourceId: "ntpc_population_by_age_sex_district",
      filters: {
        geographies: ["板橋區"],
        age_groups: ["20-24"],
        sexes: ["all"],
        start_year: 2022,
        end_year: 2024,
      },
    },
  };
}

test("registry defaults select a deterministic recent query window", () => {
  assert.deepEqual(buildDefaultSourceFilters(registrySource()), {
    geographies: ["板橋區"],
    age_groups: ["20-24"],
    sexes: ["all"],
    start_year: 2022,
    end_year: 2024,
  });
});

test("Source Node maps to Contract v0 without leaking Canvas state", () => {
  const request = buildAnalysisRequest({
    projectId: "project-1",
    moduleId: "analysis-1",
    result: {
      kind: "chart",
      name: "人口趨勢",
      sourceNodeIds: ["canvas-source-1"],
      prompt: "比較板橋區人口趨勢",
    },
    sourceNodes: [sourceNode()],
  });

  assert.deepEqual(request, {
    contract_version: "0.1.0",
    project_id: "project-1",
    module_id: "analysis-1",
    query: "比較板橋區人口趨勢",
    upstream_module_ids: [],
    source_selections: [{
      source_id: "ntpc_population_by_age_sex_district",
      filters: sourceNode().source.filters,
    }],
  });
  assert.equal(JSON.stringify(request).includes("canvas-source-1"), false);
  assert.equal(JSON.stringify(request).includes('"x"'), false);
  assert.equal(JSON.stringify(request).includes('"y"'), false);
});

test("unbound file/API sources fail before any HTTP request", () => {
  const source = sourceNode();
  source.source.kind = "file";
  delete source.source.registrySourceId;
  assert.throws(() => buildAnalysisRequest({
    projectId: "project-1",
    moduleId: "analysis-1",
    result: { kind: "chart", name: "圖表", sourceNodeIds: [source.id], prompt: "分析" },
    sourceNodes: [source],
  }), /尚未綁定可執行/);
});

test("multiple Source cards are blocked before an analysis API request can be sent", () => {
  const second = structuredClone(sourceNode());
  second.id = "canvas-source-2";
  second.source.name = "另一個官方資料來源";
  second.source.registrySourceId = "another_registry_dataset";
  let apiRequestCount = 0;

  const buildThenSend = () => {
    const request = buildAnalysisRequest({
      projectId: "project-1",
      moduleId: "analysis-1",
      result: {
        kind: "chart",
        name: "圖表",
        sourceNodeIds: ["canvas-source-1", "canvas-source-2"],
        prompt: "分析",
      },
      sourceNodes: [sourceNode(), second],
    });
    apiRequestCount += 1;
    return request;
  };

  assert.throws(buildThenSend, /目前每張圖表只支援一個資料來源；跨來源請分開分析後由簡報彙整/);
  assert.equal(apiRequestCount, 0);
});

test("HTTP client uses exact catalog and analysis endpoints", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith("/v1/data-sources")) {
      return new Response(JSON.stringify({ sources: [registrySource()] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ contract_version: "0.1.0", status: "blocked" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const sources = await listDataSources(fakeFetch, "http://api.test");
  const request = buildAnalysisRequest({
    projectId: "project-1",
    moduleId: "analysis-1",
    result: { kind: "chart", name: "圖表", sourceNodeIds: ["canvas-source-1"], prompt: "分析" },
    sourceNodes: [sourceNode()],
  });
  const response = await runAnalysis(request, fakeFetch, "http://api.test");

  assert.equal(sources.length, 1);
  assert.equal(calls[0].url, "http://api.test/v1/data-sources");
  assert.equal(calls[1].url, "http://api.test/v1/analysis");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), request);
  assert.equal(response.httpStatus, 200);
  assert.equal(response.payload.status, "blocked");
});
