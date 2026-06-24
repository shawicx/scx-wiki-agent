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
 * 约束：要求用户机器预装 codebase-memory-mcp。
 */
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
    return this.exec('index_repository', { repo_path: this.repoPath, mode }) as IndexResult;
  }

  /** 架构概览 */
  getArchitecture(): ArchitectureData {
    return this.exec('get_architecture', {
      project: this.projectName,
      aspects: ['all'],
    }) as ArchitectureData;
  }

  /** 双向调用链追踪 */
  tracePath(
    functionName: string,
    direction: 'inbound' | 'outbound' | 'both' = 'both',
    depth = 6,
  ): TraceResult {
    return this.exec('trace_path', {
      project: this.projectName,
      function_name: functionName,
      direction,
      depth,
    }) as TraceResult;
  }

  /** 代码片段+元数据 */
  getCodeSnippet(qualifiedName: string): SnippetData {
    return this.exec('get_code_snippet', {
      project: this.projectName,
      qualified_name: qualifiedName,
    }) as SnippetData;
  }

  /** BM25 全文检索 */
  searchGraph(params: SearchGraphParams): GraphSearchResult[] {
    const result = this.exec('search_graph', {
      project: this.projectName,
      ...params,
    }) as { results: GraphSearchResult[]; total: number };
    return result.results ?? [];
  }

  /** Cypher 查询 */
  queryGraph(cypher: string, maxRows = 100): QueryResult {
    return this.exec('query_graph', {
      project: this.projectName,
      query: cypher,
      max_rows: maxRows,
    }) as QueryResult;
  }

  /** 增量变更检测 */
  detectChanges(): ChangeResult {
    return this.exec('detect_changes', { project: this.projectName }) as ChangeResult;
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
