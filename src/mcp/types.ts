/** codebase-memory-mcp index_repository 返回 */
export interface IndexResult {
  project: string;
  status: 'indexed';
  nodes: number;
  edges: number;
  excluded?: { dirs: string[]; count: number; truncated: boolean };
}

/** get_architecture 返回（基于实测） */
export interface ArchitectureData {
  total_nodes: number;
  total_edges: number;
  node_labels: Array<{ label: string; count: number }>;
  edge_types: Array<{ type: string; count: number }>;
  languages: Array<{ language: string; file_count: number }>;
  packages: Array<{ name: string; node_count: number; fan_in: number; fan_out: number }>;
  entry_points: Array<{ name: string; qualified_name: string; file: string }>;
  hotspots: Array<{ name: string; qualified_name: string; fan_in: number }>;
  boundaries: Array<{ from: string; to: string; call_count: number }>;
  layers: Array<{ name: string; layer: string; reason: string }>;
  clusters: Array<{ id: number; label: string; members: number; cohesion: number; top_nodes: string[] }>;
}

/** get_code_snippet 返回 */
export interface SnippetData {
  name: string;
  qualified_name: string;
  label: string;
  file_path: string;
  start_line: number;
  end_line: number;
  source: string;
  signature?: string;
  return_type?: string;
  docstring?: string;
  complexity?: number;
  callers?: number;
  callees?: number;
  caller_names?: string[];
  parent_class?: string;
  is_exported?: boolean;
  is_entry_point?: boolean;
}

/** trace_path 返回的节点 */
export interface TraceNode {
  name: string;
  qualified_name: string;
  hop: number;
}

/** trace_path 返回 */
export interface TraceResult {
  function: string;
  direction: string;
  callers?: TraceNode[];
  callees?: TraceNode[];
}

/** search_graph 返回的节点 */
export interface GraphSearchResult {
  name: string;
  qualified_name: string;
  label: string;
  file_path: string;
  in_degree: number;
  out_degree: number;
  complexity: number;
  lines: number;
  is_exported: boolean;
  is_test: boolean;
  is_entry_point: boolean;
}

/** query_graph (Cypher) 返回 */
export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  total?: number;
}

/** detect_changes 返回 */
export interface ChangeResult {
  project: string;
  changed?: boolean;
  summary?: string;
}

/** search_graph 查询参数 */
export interface SearchGraphParams {
  query?: string;
  label?: string;
  name_pattern?: string;
  file_pattern?: string;
  limit?: number;
}
