import { vi } from 'vitest';
import type { ArchitectureData, SnippetData, TraceResult, QueryResult } from '../../src/mcp/types.js';

const DEFAULT_ARCHITECTURE: ArchitectureData = {
  total_nodes: 20,
  total_edges: 30,
  node_labels: [{ label: 'Class', count: 5 }, { label: 'Method', count: 10 }],
  edge_types: [{ type: 'CALLS', count: 15 }, { type: 'DEFINES_METHOD', count: 10 }],
  languages: [{ language: 'TypeScript', file_count: 8 }],
  packages: [
    { name: 'core', node_count: 8, fan_in: 3, fan_out: 1 },
    { name: 'services', node_count: 5, fan_in: 1, fan_out: 4 },
    { name: 'cli', node_count: 2, fan_in: 0, fan_out: 5 },
  ],
  entry_points: [
    { name: 'registerBuildCommand', qualified_name: 'proj.registerBuildCommand', file: 'src/cli/commands/build.ts' },
    { name: 'createProgram', qualified_name: 'proj.createProgram', file: 'src/cli/index.ts' },
  ],
  hotspots: [
    { name: 'build', qualified_name: 'proj.build', fan_in: 8 },
    { name: 'init', qualified_name: 'proj.init', fan_in: 5 },
  ],
  boundaries: [
    { from: 'services', to: 'core', call_count: 5 },
    { from: 'cli', to: 'services', call_count: 3 },
  ],
  layers: [
    { name: 'core', layer: 'core', reason: 'high fan-in (8 in, 1 out)' },
    { name: 'services', layer: 'internal', reason: 'fan-in=3, fan-out=9' },
  ],
  clusters: [
    { id: 0, label: 'src', members: 6, cohesion: 0.9, top_nodes: ['build', 'init'] },
  ],
};

/**
 * 创建 CodebaseMemoryClient 的可配置 mock，用于 wiki-context-builder 单测。
 * 不依赖真实 codebase-memory-mcp 二进制。
 */
export function createMockClient(overrides?: Partial<{
  architecture: ArchitectureData;
  tracePath: TraceResult;
  codeSnippet: SnippetData;
  queryResults: Map<string, QueryResult>;
}>) {
  return {
    ensureIndexed: vi.fn().mockReturnValue({
      project: 'test',
      status: 'indexed' as const,
      nodes: 20,
      edges: 30,
    }),
    getArchitecture: vi.fn().mockReturnValue(overrides?.architecture ?? DEFAULT_ARCHITECTURE),
    tracePath: vi.fn().mockReturnValue(
      overrides?.tracePath ?? {
        function: 'registerBuildCommand',
        direction: 'outbound',
        callees: [
          { name: 'WikiService', qualified_name: 'proj.WikiService', hop: 1 },
          { name: 'buildWiki', qualified_name: 'proj.buildWiki', hop: 1 },
        ],
      },
    ),
    getCodeSnippet: vi.fn().mockReturnValue(
      overrides?.codeSnippet ?? ({
        name: 'buildWiki',
        qualified_name: 'proj.buildWiki',
        label: 'Method',
        file_path: 'src/services/wiki-service.ts',
        start_line: 34,
        end_line: 59,
        source: 'async buildWiki() {}',
      } as SnippetData),
    ),
    searchGraph: vi.fn().mockReturnValue([]),
    queryGraph: vi.fn().mockImplementation((cypher: string) => {
      const exact = overrides?.queryResults?.get(cypher);
      if (exact) return exact;
      // 模糊匹配：若 cypher 不在 map 中但含特定关键词，返回空结果
      return { columns: [], rows: [], total: 0 } as QueryResult;
    }),
    detectChanges: vi.fn().mockReturnValue({ project: 'test', changed: false }),
  };
}
