import { execFileSync } from 'child_process';
import { resolve } from 'path';
import type {
  IndexResult,
  ArchitectureData,
  SnippetData,
  TraceResult,
  GraphSearchResult,
  QueryResult,
  ChangeResult,
  SearchGraphParams,
} from './types.js';

const DEFAULT_BINARY = 'codebase-memory-mcp';

/**
 * codebase-memory-mcp 子进程客户端。
 *
 * 通过 `codebase-memory-mcp cli <tool> <json>` 子命令调用外部二进制，
 * 解析 stdout JSON。无需 MCP SDK 依赖。
 *
 * v0.10.x 起 CLI 默认输出人类可读的树状文本，所有调用统一携带
 * `format: 'json'` 获取结构化 JSON；返回的列式表（{cols, rows}）由
 * 下方 adapter 转回对象数组，兼容旧版直接返回对象数组的形态。
 *
 * 约束：要求用户机器预装 codebase-memory-mcp。
 */

/** 列式表 {cols, rows} → 对象数组（v0.10.x format=json 的结构） */
function tableToObjects(table: unknown): Array<Record<string, unknown>> {
  const t = table as { cols?: string[]; rows?: unknown[][] } | null;
  const cols = t?.cols;
  if (!cols || !Array.isArray(t?.rows)) return [];
  return t.rows!.map(row => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

/** 兼容两种形态：旧版对象数组 / 新版列式表 */
function asObjects(raw: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  const v = raw[key];
  if (Array.isArray(v)) return v as Array<Record<string, unknown>>;
  return tableToObjects(v);
}

/** qualified_name 末段 → 简名（列式表里 entry_points/hotspots 只提供 qn） */
const lastSegment = (qn: unknown): string => (typeof qn === 'string' ? qn.split('.').pop() ?? qn : '');

/** get_architecture 列式表 → ArchitectureData 对象数组 */
function adaptArchitecture(raw: Record<string, any>): ArchitectureData {
  return {
    total_nodes: raw.total_nodes ?? 0,
    total_edges: raw.total_edges ?? 0,
    node_labels: asObjects(raw, 'node_labels') as ArchitectureData['node_labels'],
    edge_types: asObjects(raw, 'edge_types') as ArchitectureData['edge_types'],
    languages: asObjects(raw, 'languages').map((l: any) => ({
      language: l.language,
      file_count: l.file_count ?? l.files ?? 0,
    })),
    packages: asObjects(raw, 'packages').map((p: any) => ({
      name: p.name,
      node_count: p.node_count ?? p.nodes ?? 0,
      fan_in: p.fan_in ?? 0,
      fan_out: p.fan_out ?? 0,
    })),
    entry_points: asObjects(raw, 'entry_points').map((e: any) => ({
      name: e.name ?? lastSegment(e.qualified_name ?? e.qn),
      qualified_name: e.qualified_name ?? e.qn ?? '',
      file: e.file ?? '',
    })),
    hotspots: asObjects(raw, 'hotspots').map((h: any) => ({
      name: h.name ?? lastSegment(h.qualified_name ?? h.qn),
      qualified_name: h.qualified_name ?? h.qn ?? '',
      fan_in: h.fan_in ?? 0,
    })),
    boundaries: asObjects(raw, 'boundaries').map((b: any) => ({
      from: b.from,
      to: b.to,
      call_count: b.call_count ?? b.calls ?? 0,
    })),
    layers: asObjects(raw, 'layers').map((l: any) => ({
      name: l.name ?? '',
      layer: l.layer ?? '',
      reason: l.reason ?? '',
    })),
    clusters: asObjects(raw, 'clusters').map((c: any) => ({
      id: c.id,
      label: c.label,
      members: c.members,
      cohesion: c.cohesion,
      top_nodes: c.top_nodes ?? [],
    })),
  };
}

/** trace_path 分组列式表 → 扁平 TraceNode[] */
function adaptTrace(raw: Record<string, any>): TraceResult {
  const adaptSide = (side: unknown): TraceNodeLike[] | undefined => {
    if (side === undefined) return undefined;
    if (Array.isArray(side)) return side; // 旧形态已是节点数组
    const groups = (side as { groups?: Array<{ qn_prefix?: string; rows?: unknown[][] }> }).groups ?? [];
    const nodes: TraceNodeLike[] = [];
    for (const g of groups) {
      for (const row of g.rows ?? []) {
        nodes.push({
          name: String(row[0]),
          qualified_name: g.qn_prefix ? `${g.qn_prefix}.${row[0]}` : String(row[0]),
          hop: Number(row[1] ?? 0),
        });
      }
    }
    return nodes;
  };
  return {
    function: raw.function,
    direction: raw.direction,
    callers: adaptSide(raw.callers),
    callees: adaptSide(raw.callees),
  };
}

type TraceNodeLike = { name: string; qualified_name: string; hop: number };

/** search_graph 列式表 → GraphSearchResult[] */
function adaptSearchResults(raw: Record<string, any>): GraphSearchResult[] {
  if (Array.isArray(raw.results)) return raw.results; // 旧形态
  return tableToObjects(raw).map((r: any) => ({
    name: r.name ?? lastSegment(r.qualified_name ?? r.qn),
    qualified_name: r.qualified_name ?? r.qn ?? '',
    label: r.label ?? '',
    file_path: r.file_path ?? r.file ?? '',
    in_degree: r.in_degree ?? 0,
    out_degree: r.out_degree ?? 0,
    complexity: r.complexity ?? 0,
    lines: r.lines ?? 0,
    is_exported: Boolean(r.is_exported),
    is_test: Boolean(r.is_test),
    is_entry_point: Boolean(r.is_entry_point),
  }));
}

export class CodebaseMemoryClient {
  private readonly binaryPath: string;
  private readonly projectName: string;
  private readonly repoPath: string;

  constructor(repoPath: string, binaryPath?: string) {
    this.repoPath = resolve(repoPath);
    this.binaryPath = binaryPath ?? this.findBinary();
    this.projectName = this.toProjectName(this.repoPath);
  }

  /** 确保图谱已索引（幂等） */
  ensureIndexed(mode: 'fast' | 'moderate' | 'full' = 'moderate'): IndexResult {
    return this.exec('index_repository', {
      repo_path: this.repoPath,
      mode,
      format: 'json',
    }) as IndexResult;
  }

  /** 架构概览 */
  getArchitecture(): ArchitectureData {
    const raw = this.exec('get_architecture', {
      project: this.projectName,
      aspects: ['all'],
      format: 'json',
    });
    return adaptArchitecture(raw as Record<string, any>);
  }

  /** 双向调用链追踪 */
  tracePath(
    functionName: string,
    direction: 'inbound' | 'outbound' | 'both' = 'both',
    depth = 6,
  ): TraceResult {
    const raw = this.exec('trace_path', {
      project: this.projectName,
      function_name: functionName,
      direction,
      depth,
      format: 'json',
    });
    return adaptTrace(raw as Record<string, any>);
  }

  /** 代码片段+元数据 */
  getCodeSnippet(qualifiedName: string): SnippetData {
    return this.exec('get_code_snippet', {
      project: this.projectName,
      qualified_name: qualifiedName,
      format: 'json',
    }) as SnippetData;
  }

  /** BM25 全文检索 */
  searchGraph(params: SearchGraphParams): GraphSearchResult[] {
    const raw = this.exec('search_graph', {
      project: this.projectName,
      ...params,
      format: 'json',
    });
    return adaptSearchResults(raw as Record<string, any>);
  }

  /** Cypher 查询 */
  queryGraph(cypher: string, maxRows = 100): QueryResult {
    const result = this.exec('query_graph', {
      project: this.projectName,
      query: cypher,
      max_rows: maxRows,
      format: 'json',
    });
    // format=json 下返回 {columns, rows, total}，与 QueryResult 一致
    return result as QueryResult;
  }

  /** 增量变更检测 */
  detectChanges(): ChangeResult {
    return this.exec('detect_changes', { project: this.projectName, format: 'json' }) as ChangeResult;
  }

  // --- 内部方法 ---

  private exec(tool: string, args: Record<string, unknown>): unknown {
    try {
      const raw = execFileSync(this.binaryPath, ['cli', tool, JSON.stringify(args)], {
        encoding: 'utf-8',
        timeout: 120000,
        maxBuffer: 100 * 1024 * 1024,
      });
      return this.parseJsonOutput(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          'codebase-memory-mcp 未安装。请先安装：参考 https://github.com/Julexar/codebase-memory-mcp 或运行其安装命令。',
        );
      }
      throw err;
    }
  }

  /**
   * 解析子进程 stdout。
   * MCP 的 info 日志（`level=info msg=...`）可能泄漏到 stdout，
   * 因此从末尾向前找最后一个完整的 JSON 对象。
   */
  private parseJsonOutput(raw: string): unknown {
    const lines = raw.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') || line.startsWith('[')) {
        try {
          return JSON.parse(line);
        } catch {
          continue;
        }
      }
    }
    throw new Error(`MCP 返回无法解析 JSON: ${raw.slice(0, 200)}`);
  }

  /** 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`） */
  private toProjectName(repoPath: string): string {
    return repoPath.replace(/^\//, '').replace(/[/:]/g, '-');
  }

  private findBinary(): string {
    return process.env.CODEBASE_MEMORY_MCP_BINARY ?? DEFAULT_BINARY;
  }
}
