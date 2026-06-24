import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ScanResult } from '../core/scanner.js';
import type { SymbolType, RelationType } from '../core/types.js';
import type {
  OverviewContext,
  ArchitectureContext,
  ModuleSummary,
  DataFlowContext,
  ExecutionSequence,
  OnboardingContext,
  TroubleshootingContext,
  ModulesContext,
  ApiContext,
  BusinessContext,
  DesignDecisionsContext,
  DesignPattern,
  GlossaryContext,
} from './types.js';

const ENTRY_FILE_NAMES = ['index.ts', 'index.js', 'main.ts', 'main.js', 'cli.ts', 'cli.js'];

/**
 * 从 codebase-memory-mcp 知识图谱构建各 wiki 页面的上下文数据。
 *
 * 替代了旧的 SQLite 直查方式。所有数据来自 MCP 的架构概览、调用链追踪、
 * Cypher 查询，携带 docstring/signature/complexity 等富化属性。
 */
export class WikiContextBuilder {
  constructor(
    private client: CodebaseMemoryClient,
    private scanResult: ScanResult,
  ) {}

  buildOverviewContext(): OverviewContext {
    const arch = this.client.getArchitecture();
    const entryFiles = this.scanResult.files
      .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
      .map(f => ({ name: f.relativePath.split('/').pop()!, path: f.relativePath }));

    // hotspots 即高扇入符号，用作 topSymbols，体现项目核心
    const topSymbols = arch.hotspots.slice(0, 10).map(h => ({
      name: h.name,
      type: 'function' as SymbolType,
      complexity: h.fan_in,
    }));

    return {
      projectType: this.scanResult.projectType,
      hasTypeScript: this.scanResult.hasTypeScript,
      fileCount: this.scanResult.files.length,
      techStack: this.scanResult.techStack,
      sourceDirs: this.scanResult.sourceDirs,
      entryFiles,
      topSymbols,
    };
  }

  buildArchitectureContext(): ArchitectureContext {
    const arch = this.client.getArchitecture();

    const modules: ModuleSummary[] = arch.packages.map(pkg => ({
      name: pkg.name,
      files: [],
      symbols: [],
      fileSymbols: [],
      outgoingRelations: [],
      incomingRelations: [],
      codeSnippets: [],
    }));

    const interModuleRelations = arch.boundaries.map(b => ({
      source: b.from,
      target: b.to,
      type: 'calls' as RelationType,
    }));

    return {
      modules,
      interModuleRelations,
      layers: arch.layers,
      boundaries: arch.boundaries.map(b => ({ from: b.from, to: b.to, callCount: b.call_count })),
      clusters: arch.clusters.map(c => ({ label: c.label, members: c.members, topNodes: c.top_nodes })),
    };
  }

  buildDataFlowContext(): DataFlowContext {
    const arch = this.client.getArchitecture();
    const sequences: ExecutionSequence[] = [];

    for (const entry of arch.entry_points.slice(0, 8)) {
      const trace = this.client.tracePath(entry.name, 'outbound', 6);
      if (trace.callees && trace.callees.length > 0) {
        const participants = new Map<string, { name: string; type: SymbolType; filePath: string }>();
        participants.set(entry.name, { name: entry.name, type: 'function', filePath: entry.file });

        const messages: ExecutionSequence['messages'] = [];
        let prevName = entry.name;
        for (const callee of trace.callees) {
          if (!participants.has(callee.name)) {
            participants.set(callee.name, { name: callee.name, type: 'function', filePath: '' });
          }
          messages.push({
            from: prevName,
            to: callee.name,
            label: callee.name,
            callLine: 0,
            filePath: '',
          });
          prevName = callee.name;
        }

        sequences.push({
          name: entry.name,
          entrySymbol: entry.name,
          participants: Array.from(participants.values()),
          messages,
        });
      }
    }

    return { sequences };
  }

  buildModulesContext(): ModulesContext {
    const arch = this.client.getArchitecture();

    // 用 Cypher 查每个文件的核心符号（按复杂度排序，有 docstring 优先）
    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.is_test = false AND (n.docstring IS NOT NULL OR n.complexity > 0)
       RETURN n.name AS name, n.label AS label, n.docstring AS doc, n.signature AS sig,
              n.complexity AS cx, n.file_path AS file
       ORDER BY n.file_path, n.complexity DESC LIMIT 60`,
    );

    // 按文件聚合符号
    const symbolsByFile = new Map<string, Array<{ name: string; type: SymbolType; docstring?: string | null; signature?: string | null; complexity?: number }>>();
    for (const row of q.rows) {
      const file = row[5] as string;
      if (!file) continue;
      if (!symbolsByFile.has(file)) symbolsByFile.set(file, []);
      symbolsByFile.get(file)!.push({
        name: row[0] as string,
        type: this.labelToSymbolType(row[1] as string),
        docstring: (row[2] as string | null) ?? null,
        signature: (row[3] as string | null) ?? null,
        complexity: row[4] as number | undefined,
      });
    }

    // 把文件符号归属到对应的 package
    const modules: ModuleSummary[] = arch.packages.map(pkg => {
      const pkgFiles = Array.from(symbolsByFile.keys()).filter(f => f.includes(`/${pkg.name}/`));
      return {
        name: pkg.name,
        files: pkgFiles,
        symbols: pkgFiles.flatMap(f => symbolsByFile.get(f) ?? []).slice(0, 10),
        fileSymbols: pkgFiles.map(f => ({
          file: f,
          symbols: (symbolsByFile.get(f) ?? []).slice(0, 5).map(s => ({ name: s.name, type: s.type })),
        })),
        outgoingRelations: [],
        incomingRelations: [],
        codeSnippets: [],
      };
    });

    return { modules };
  }

  buildApiContext(): ApiContext {
    const arch = this.client.getArchitecture();

    // entry_points 即 CLI 命令
    const commands = arch.entry_points.map(e => ({
      name: e.name,
      filePath: e.file,
      startLine: 0,
      description: '',
    }));

    // 查导出函数（有 signature/docstring 的）
    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.is_exported = true AND n.is_test = false
         AND n.label IN ['Function', 'Method']
       RETURN n.name AS name, n.file_path AS file, n.signature AS sig, n.docstring AS doc
       ORDER BY n.complexity DESC LIMIT 30`,
    );

    const exportedFunctions = q.rows.map(row => ({
      name: row[0] as string,
      filePath: row[1] as string,
      startLine: 0,
      signature: (row[2] as string | null) ?? null,
      docstring: (row[3] as string | null) ?? null,
    }));

    return {
      commands,
      exportedFunctions,
      frameworkNodes: [],
    };
  }

  buildBusinessContext(): BusinessContext {
    // Cypher 查 Service/Repository 类及其方法
    const q = this.client.queryGraph(
      `MATCH (m)-[:DEFINES_METHOD]->(c)
       WHERE c.name ENDS WITH 'Service' OR c.name ENDS WITH 'Repository'
       RETURN c.name AS cls, m.name AS method, m.docstring AS doc,
              m.visibility AS vis, c.file_path AS file
       ORDER BY cls, m.start_line LIMIT 200`,
    );

    const serviceMap = new Map<string, { filePath: string; methods: BusinessContext['services'][number]['methods'] }>();
    for (const row of q.rows) {
      const cls = row[0] as string;
      if (!serviceMap.has(cls)) {
        serviceMap.set(cls, { filePath: row[4] as string, methods: [] });
      }
      serviceMap.get(cls)!.methods.push({
        name: row[1] as string,
        visibility: (row[3] as string | null) ?? null,
        docstring: (row[2] as string | null) ?? null,
      });
    }

    return {
      services: Array.from(serviceMap.entries()).map(([name, data]) => ({
        name,
        filePath: data.filePath,
        methods: data.methods.slice(0, 8),
        dependencies: [],
        codeSnippet: '',
      })),
    };
  }

  buildDesignDecisionsContext(): DesignDecisionsContext {
    const patterns: DesignPattern[] = [];

    // Strategy Pattern: Registry + Resolver
    const registryQ = this.client.queryGraph(
      `MATCH (c:Class) WHERE c.name CONTAINS 'Registry' AND c.is_test = false
       RETURN c.name AS name, c.file_path AS file LIMIT 5`,
    );
    if (registryQ.rows.length > 0) {
      patterns.push({
        pattern: 'Strategy Pattern',
        evidence: [
          `${registryQ.rows.length} 个 Registry 类：${registryQ.rows.map(r => r[0]).join(', ')}`,
          'Registry 模式实现可插拔策略注册与分发',
        ],
        files: registryQ.rows.map(r => r[1] as string),
      });
    }

    // Builder Pattern
    const builderQ = this.client.queryGraph(
      `MATCH (c:Class) WHERE c.name CONTAINS 'Builder' AND c.is_test = false
       RETURN c.name AS name, c.file_path AS file LIMIT 3`,
    );
    if (builderQ.rows.length > 0) {
      patterns.push({
        pattern: 'Builder Pattern',
        evidence: builderQ.rows.map(r => `${r[0]} 提供流式构造 API`),
        files: builderQ.rows.map(r => r[1] as string),
      });
    }

    const techChoices = this.scanResult.techStack.map(t => ({
      technology: t,
      category: 'detected',
      evidence: [`scanResult 检测到 ${t}`],
    }));

    return { patterns, techChoices };
  }

  buildGlossaryContext(): GlossaryContext {
    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`,
    );

    const seen = new Set<string>();
    const symbols = q.rows
      .map(row => ({
        name: row[0] as string,
        type: this.labelToSymbolType(row[1] as string),
        filePath: row[5] as string,
        docstring: (row[2] as string | null) ?? null,
        signature: (row[3] as string | null) ?? null,
        complexity: row[4] as number | undefined,
      }))
      .filter(s => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
      })
      .slice(0, 30);

    return { symbols };
  }

  buildOnboardingContext(): OnboardingContext {
    const entryFiles = this.scanResult.files
      .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
      .map(f => ({ name: f.relativePath.split('/').pop()!, path: f.relativePath }));

    let packageManager = 'npm';
    let nodeVersion = '';
    try {
      const pkgPath = join(this.scanResult.rootDir, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.packageManager) {
          packageManager = (pkg.packageManager as string).split('@')[0];
        }
        if (pkg.engines?.node) {
          nodeVersion = pkg.engines.node as string;
        }
      }
    } catch { /* ignore */ }

    if (packageManager === 'npm') {
      if (existsSync(join(this.scanResult.rootDir, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
      else if (existsSync(join(this.scanResult.rootDir, 'yarn.lock'))) packageManager = 'yarn';
    }

    const arch = this.client.getArchitecture();
    const cliCommands = arch.entry_points.map(e => ({
      name: e.name,
      description: `CLI command in ${e.file}`,
    }));

    return {
      projectType: this.scanResult.projectType,
      techStack: this.scanResult.techStack,
      entryFiles,
      sourceDirs: this.scanResult.sourceDirs,
      hasTypeScript: this.scanResult.hasTypeScript,
      packageManager,
      nodeVersion,
      cliCommands,
    };
  }

  buildTroubleshootingContext(): TroubleshootingContext {
    const arch = this.client.getArchitecture();
    return {
      projectType: this.scanResult.projectType,
      techStack: this.scanResult.techStack,
      modules: arch.packages.map(p => ({ name: p.name })),
    };
  }

  /** MCP 节点标签 → SymbolType */
  private labelToSymbolType(label: string): SymbolType {
    switch (label) {
      case 'Class': return 'class';
      case 'Method': return 'method';
      case 'Function': return 'function';
      case 'Interface': return 'interface';
      case 'Variable': return 'variable';
      default: return 'function';
    }
  }
}
