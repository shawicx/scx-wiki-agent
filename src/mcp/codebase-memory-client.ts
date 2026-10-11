import { execFileSync } from 'child_process';
import { resolve } from 'path';
import type {
  IndexResult,
  ArchitectureData,
  SnippetData,
  TraceResult,
  QueryResult,
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

/** 日志记录形态：顶层键全部属于常见结构化日志字段（level/msg/time/ts/caller…） */
const LOG_RECORD_KEYS = new Set(['level', 'msg', 'message', 'time', 'ts', 'caller', 'module', 'func', 'line']);

function isLogRecord(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const keys = Object.keys(parsed as Record<string, unknown>);
  return keys.length > 0 && keys.every(k => LOG_RECORD_KEYS.has(k));
}

/**
 * 扫描文本中所有完整的顶层 JSON 对象/数组候选子串（字符串感知的括号配对）。
 * 覆盖：单行 JSON、多行 pretty-printed JSON；忽略裸日志文本与行内杂讯。
 */
function topLevelJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' || ch === ']') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  return candidates;
}

export class CodebaseMemoryClient {
  private readonly binaryPath: string;
  private readonly projectName: string;
  private readonly repoPath: string;
  /** getArchitecture 实例级缓存：最重的全量查询，一次 build 10+ 消费点只跑一次子进程，
   *  同时消灭不同消费点拿到不同响应的口径漂移（客户端每 build 一个实例） */
  private archCache: ArchitectureData | null = null;

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

  /** 架构概览（实例级 memoize：一次 build 只跑一次子进程） */
  getArchitecture(): ArchitectureData {
    if (this.archCache !== null) return this.archCache;
    const raw = this.exec('get_architecture', {
      project: this.projectName,
      aspects: ['all'],
      format: 'json',
    });
    this.archCache = adaptArchitecture(raw as Record<string, any>);
    return this.archCache;
  }

  /** 双向调用链追踪。**experimental**：生产管线未用（CALLS 走 queryGraph），仅测试/调试。 */
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

  /**
   * 词法搜索存在性探测（grep + 图谱增强的 files 模式）。
   * 默认字面量匹配（regex=false）；totalGrepMatches > 0 即字面量在仓库中存在
   * （含 import/注释/配置中的出现），适合断言核验的兜底通道。
   */
  searchCode(pattern: string, limit = 20): { totalGrepMatches: number; files: string[] } {
    const raw = this.exec('search_code', {
      project: this.projectName,
      pattern,
      mode: 'files',
      limit,
      format: 'json',
    }) as { total_grep_matches?: number; files?: string[] };
    return {
      totalGrepMatches: raw.total_grep_matches ?? 0,
      files: raw.files ?? [],
    };
  }

  /**
   * 词法搜索的 (file, line) 命中清单（compact 模式；断言核验的证据分类通道）：
   * 图谱符号内命中 + 符号外原始命中合并；无命中空数组，老版 binary 抛错（fail-open）。
   */
  searchCodeMatches(pattern: string, limit = 20): Array<{ file: string; line: number }> {
    const raw = this.exec('search_code', {
      project: this.projectName,
      pattern,
      mode: 'compact',
      limit,
      format: 'json',
    }) as {
      cols?: string[];
      rows?: unknown[][];
      raw_matches?: { cols?: string[]; rows?: unknown[][] };
    };
    const out: Array<{ file: string; line: number }> = [];
    // 图谱符号内命中：cols = [qn, label, file, lines, matches, in, out, ...]
    const cols = raw.cols ?? [];
    const fileIdx = cols.indexOf('file');
    const matchesIdx = cols.indexOf('matches');
    for (const row of raw.rows ?? []) {
      const file = fileIdx >= 0 ? row[fileIdx] : undefined;
      const lines = matchesIdx >= 0 ? row[matchesIdx] : undefined;
      if (typeof file !== 'string' || !Array.isArray(lines)) continue;
      for (const line of lines) {
        if (typeof line === 'number') out.push({ file, line });
      }
    }
    // 符号外原始命中：cols = [file, line, content]
    const rawCols = raw.raw_matches?.cols ?? [];
    const rawFileIdx = rawCols.indexOf('file');
    const rawLineIdx = rawCols.indexOf('line');
    for (const row of raw.raw_matches?.rows ?? []) {
      const file = rawFileIdx >= 0 ? row[rawFileIdx] : row[0];
      const line = rawLineIdx >= 0 ? row[rawLineIdx] : row[1];
      if (typeof file === 'string' && typeof line === 'number') out.push({ file, line });
    }
    return out;
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
   * MCP 的 info 日志（logfmt 或 JSON 行）可能泄漏到 stdout，因此从末尾向前
   * 找最后一个**完整的**顶层 JSON 对象/数组：按括号配对扫描（字符串感知，
   * 支持多行 pretty-printed JSON），而非按行探测——按行探测在两类真实场景下
   * 失效：尾部跟随 `{"level":"info",...}` 日志行会被误当结果（下游静默产出空
   * 数据）；多行 pretty JSON 永远无法整行 parse。
   */
  private parseJsonOutput(raw: string): unknown {
    const candidates = topLevelJsonCandidates(raw);
    let lastParsed: unknown;
    for (let i = candidates.length - 1; i >= 0; i--) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidates[i]);
      } catch {
        continue;
      }
      if (lastParsed === undefined) lastParsed = parsed;
      if (!isLogRecord(parsed)) return parsed; // 跳过尾随的 JSON 日志行，取真正的结果负载
    }
    if (lastParsed !== undefined) return lastParsed; // 全部候选都是日志形态：退回最后一个
    throw new Error(`MCP 返回无法解析 JSON: ${raw.slice(0, 200)}`);
  }

  /**
   * 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`）。
   * 必须与 MCP 侧 repo_path 派生规则**逐字对齐**（掺哈希/改名 → project not
   * found，实测）。已知局限（MCP 侧解决）：`:`/`-` 折叠同键，冒号目录罕见。
   */
  private toProjectName(repoPath: string): string {
    return repoPath.replace(/^\//, '').replace(/[/:]/g, '-');
  }

  private findBinary(): string {
    return process.env.CODEBASE_MEMORY_MCP_BINARY ?? DEFAULT_BINARY;
  }
}
