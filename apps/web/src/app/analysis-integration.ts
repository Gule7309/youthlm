import type {
  AnalysisRequestPayload,
  CanvasNode,
  RegistryDataSource,
  ResultConfig,
  SourceFilters,
} from './types';

export const CONTRACT_VERSION = '0.1.0' as const;

export function buildDefaultSourceFilters(source: RegistryDataSource): SourceFilters {
  const endYear = source.available_years.end;
  const startYear = Math.max(source.available_years.start, endYear - 2);
  const defaultGeography = source.available_dimensions.includes('geography')
    ? source.available_geographies.find(
      geography => geography !== source.geography,
    ) ?? source.available_geographies[0]
    : undefined;
  const defaultSex = source.available_sexes.includes('all')
    ? 'all'
    : source.available_sexes[0];

  return {
    ...(defaultGeography ? { geographies: [defaultGeography] } : {}),
    ...(source.available_age_groups[0]
      ? { age_groups: [source.available_age_groups[0]] }
      : {}),
    ...(defaultSex ? { sexes: [defaultSex] } : {}),
    start_year: startYear,
    end_year: endYear,
  };
}

export function buildAnalysisRequest({
  projectId,
  moduleId,
  result,
  sourceNodes,
}: {
  projectId: string;
  moduleId: string;
  result: ResultConfig;
  sourceNodes: CanvasNode[];
}): AnalysisRequestPayload {
  if (result.kind !== 'chart') {
    throw new Error('目前只有圖表成果可以執行分析');
  }
  const query = result.prompt.trim();
  if (!query) throw new Error('圖表分析需求不可空白');

  const sourcesByNodeId = new Map(sourceNodes.map(node => [node.id, node]));
  const selections = result.sourceNodeIds.map(sourceNodeId => {
    const source = sourcesByNodeId.get(sourceNodeId)?.source;
    if (!source?.enabled || source.kind !== 'registry' || !source.registrySourceId) {
      throw new Error(`來源卡尚未綁定可執行的已安裝資料集：${sourceNodeId}`);
    }

    return {
      source_id: source.registrySourceId,
      filters: structuredClone(source.filters ?? {}),
    };
  });

  if (selections.length === 0) {
    throw new Error('至少需要一個已安裝資料集');
  }
  const sourceIds = selections.map(selection => selection.source_id);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new Error('同一個已安裝資料集不能重複選取');
  }

  return {
    contract_version: CONTRACT_VERSION,
    project_id: projectId,
    module_id: moduleId,
    query,
    upstream_module_ids: [],
    source_selections: selections,
  };
}
