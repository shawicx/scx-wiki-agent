import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { SnippetData } from '../mcp/types.js';
import type { ScanResult } from '../core/scanner.js';
import type { SymbolType, RelationType } from '../core/types.js';
import { PAGE_REGISTRY } from './page-registry.js';
import { ConfigDetector } from './config-detector.js';
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
  CallsContext,
  ClassesContext,
  ReadmeContext,
  EnvironmentContext,
  TestingContext,
  ConventionsContext,
  ConstraintsContext,
  CliContext,
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
    private detector: ConfigDetector,
  ) {}

  /** 按页面名派发上下文构建（供 PageRegistry 调用） */
  buildByName(page: string): unknown {
    switch (page) {
      case 'overview': return this.buildOverviewContext();
      case 'architecture': return this.buildArchitectureContext();
      case 'data-flow': return this.buildDataFlowContext();
      case 'modules': return this.buildModulesContext();
      case 'api': return this.buildApiContext();
      case 'business': return this.buildBusinessContext();
      case 'design-decisions': return this.buildDesignDecisionsContext();
      case 'onboarding': return this.buildOnboardingContext();
      case 'troubleshooting': return this.buildTroubleshootingContext();
      case 'glossary': return this.buildGlossaryContext();
      case 'calls': return this.buildCallsContext();
      case 'classes': return this.buildClassesContext();
      case 'readme': return this.buildReadmeContext();
      case 'environment': return this.buildEnvironmentContext();
      case 'testing': return this.buildTestingContext();
      case 'conventions': return this.buildConventionsContext();
      case 'constraints': return this.buildConstraintsContext();
      case 'cli': return this.buildCliContext();
      default: return null;
    }
  }

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

    // 为每个 package 查核心符号（按复杂度，有 docstring 优先），填充 symbols
    const symQ = this.client.queryGraph(
      `MATCH (n) WHERE n.is_test = false AND n.docstring IS NOT NULL
         AND n.label IN ['Class', 'Function', 'Method']
       RETURN n.name AS name, n.label AS label, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file
       ORDER BY n.complexity DESC LIMIT 50`,
    );
    // 按 package（文件路径段）聚合
    const symbolsByPkg = new Map<string, ModuleSummary['symbols']>();
    for (const row of symQ.rows) {
      const file = (row[5] as string) ?? '';
      const pkg = arch.packages.find(p => file.includes(`/${p.name}/`));
      if (!pkg) continue;
      if (!symbolsByPkg.has(pkg.name)) symbolsByPkg.set(pkg.name, []);
      const syms = symbolsByPkg.get(pkg.name)!;
      if (syms.length < 6) {
        syms.push({
          name: row[0] as string,
          type: this.labelToSymbolType(row[1] as string),
          docstring: (row[2] as string | null) ?? null,
          signature: (row[3] as string | null) ?? null,
          complexity: row[4] as number | undefined,
        });
      }
    }

    const modules: ModuleSummary[] = arch.packages.map(pkg => ({
      name: pkg.name,
      files: [],
      symbols: symbolsByPkg.get(pkg.name) ?? [],
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

    for (const entry of arch.entry_points.slice(0, 6)) {
      const seq = this.buildCallChainFromEdges(entry.name, entry.file);
      if (seq) sequences.push(seq);
    }

    return { sequences };
  }

  /**
   * 基于 CALLS 边 BFS 构建真实调用链（修复伪线性化问题）。
   * trace_path 返回扁平的 callee 列表（只有 hop 层级，无 caller→callee 边），
   * 直接线性化会把并行分支误画成串行序列。
   * 这里改用 Cypher 查精确的 CALLS 边，按 BFS 层级还原真实的 caller→callee 关系。
   */
  private buildCallChainFromEdges(entryName: string, entryFile: string): ExecutionSequence | null {
    const MAX_DEPTH = 3;
    const MAX_NODES = 25;

    const participants = new Map<string, { name: string; type: SymbolType; filePath: string }>();
    const messages: ExecutionSequence['messages'] = [];
    participants.set(entryName, { name: entryName, type: 'function', filePath: entryFile });

    // BFS：按层级查询精确 CALLS 边
    let frontier = [entryName];
    const visited = new Set<string>([entryName]);

    for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0 && participants.size < MAX_NODES; depth++) {
      // 查当前 frontier 中每个节点的直接 callee（过滤测试节点）
      // 注意：该 Cypher 实现不支持 NOT ... CONTAINS 语法，用 is_test 过滤 + 结果后处理
      const callerList = frontier.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',');
      const q = this.client.queryGraph(
        `MATCH (caller)-[:CALLS]->(callee)
         WHERE caller.name IN [${callerList}]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, callee.name AS callee,
                callee.file_path AS file, callee.label AS label
         LIMIT 40`,
      );

      const nextFrontier: string[] = [];
      for (const row of q.rows) {
        const callerName = row[0] as string;
        const calleeName = row[1] as string;
        const calleeFile = (row[2] as string) ?? '';
        const calleeLabel = row[3] as string;

        // 跳过自调用
        if (callerName === calleeName) continue;

        // JS 层兜底过滤测试文件（Cypher 的 NOT CONTAINS 不兼容）
        if (/\.(test|spec)\.|__tests__/.test(calleeFile)) continue;

        if (!participants.has(calleeName)) {
          participants.set(calleeName, {
            name: calleeName,
            type: this.labelToSymbolType(calleeLabel),
            filePath: calleeFile,
          });
        }

        // 每条 message 对应一条真实的 CALLS 边
        messages.push({
          from: callerName,
          to: calleeName,
          label: calleeName,
          callLine: 0,
          filePath: calleeFile,
        });

        if (!visited.has(calleeName)) {
          visited.add(calleeName);
          nextFrontier.push(calleeName);
        }
      }

      frontier = nextFrontier;
      if (q.rows.length === 0) break;
    }

    if (messages.length === 0) return null;

    return {
      name: entryName,
      entrySymbol: entryName,
      participants: Array.from(participants.values()),
      messages,
    };
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

    // entry_points 即 CLI 命令：用 getCodeSnippet 获取源码片段，提升信息密度
    const commands = arch.entry_points.slice(0, 8).map(e => {
      const snippet = this.safeGetSnippet(e.name);
      return {
        name: e.name,
        filePath: e.file,
        startLine: snippet?.start_line ?? 0,
        description: snippet?.docstring ?? '',
      };
    });

    // 查导出函数（有 signature/docstring 的），对核心函数取源码片段
    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.is_exported = true AND n.is_test = false
         AND n.label IN ['Function', 'Method']
       RETURN n.name AS name, n.qualified_name AS qn, n.file_path AS file,
              n.signature AS sig, n.docstring AS doc, n.complexity AS cx
       ORDER BY n.complexity DESC LIMIT 15`,
    );

    const exportedFunctions = q.rows.map(row => {
      const qn = row[1] as string | null;
      const snippet = qn ? this.safeGetSnippet(qn) : null;
      return {
        name: row[0] as string,
        filePath: row[2] as string,
        startLine: snippet?.start_line ?? 0,
        signature: (row[3] as string | null) ?? snippet?.signature ?? null,
        docstring: (row[4] as string | null) ?? snippet?.docstring ?? null,
      };
    });

    return {
      commands,
      exportedFunctions,
      frameworkNodes: [],
    };
  }

  buildBusinessContext(): BusinessContext {
    // Cypher 查核心业务类（Service/Repository/Client/Scanner/Builder 等）及其方法
    // 注意：DEFINES_METHOD 方向是 Class -> Method（类定义方法）
    const q = this.client.queryGraph(
      `MATCH (c)-[:DEFINES_METHOD]->(m)
       WHERE c.is_test = false
         AND (c.name ENDS WITH 'Service' OR c.name ENDS WITH 'Repository'
              OR c.name ENDS WITH 'Client' OR c.name ENDS WITH 'Scanner'
              OR c.name ENDS WITH 'Builder' OR c.name ENDS WITH 'Generator')
       RETURN c.name AS cls, c.qualified_name AS qn, m.name AS method, m.docstring AS doc,
              m.visibility AS vis, c.file_path AS file
       ORDER BY cls, m.start_line LIMIT 200`,
    );

    const serviceMap = new Map<string, { filePath: string; qn: string; methods: BusinessContext['services'][number]['methods'] }>();
    for (const row of q.rows) {
      const cls = row[0] as string;
      if (!serviceMap.has(cls)) {
        serviceMap.set(cls, { filePath: row[5] as string, qn: row[1] as string, methods: [] });
      }
      serviceMap.get(cls)!.methods.push({
        name: row[2] as string,
        visibility: (row[4] as string | null) ?? null,
        docstring: (row[3] as string | null) ?? null,
      });
    }

    return {
      services: Array.from(serviceMap.entries()).map(([name, data]) => {
        // 取服务类的类定义源码片段，让 LLM 能看到完整的类结构
        const snippet = this.safeGetSnippet(data.qn);
        return {
          name,
          filePath: data.filePath,
          methods: data.methods.slice(0, 10),
          dependencies: [],
          codeSnippet: snippet?.source ?? '',
        };
      }),
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

  /**
   * calls.md 数据源：调用边表（R2 边表优于时序图）。
   * 用 Cypher 查 (a:Method|Function)-[:CALLS]->(b)，按入口分组。
   * trace_path 不可靠（对 Method 返回空、无 file/line），改用 Cypher CALLS 边。
   */
  buildCallsContext(): CallsContext {
    const arch = this.client.getArchitecture();

    // 对每个 entry_point，BFS 查 2 层 CALLS 边
    const groups: CallsContext['groups'] = [];
    const globalSeen = new Set<string>();

    for (const entry of arch.entry_points.slice(0, 6)) {
      const edges: CallsContext['groups'][number]['edges'] = [];
      let frontier = [entry.name];
      const visited = new Set<string>([entry.name]);

      for (let depth = 0; depth < 2 && frontier.length > 0; depth++) {
        const callerList = frontier.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',');
        // 必须给源节点指定 label（裸 MATCH 会返回 0 行）；分两次查 Method 和 Function
        const qM = this.client.queryGraph(
          `MATCH (a:Method)-[:CALLS]->(b) WHERE a.name IN [${callerList}] AND a.is_test = false AND b.is_test = false
           RETURN a.name AS caller, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT 30`,
        );
        const qF = this.client.queryGraph(
          `MATCH (a:Function)-[:CALLS]->(b) WHERE a.name IN [${callerList}] AND a.is_test = false AND b.is_test = false
           RETURN a.name AS caller, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT 30`,
        );

        const nextFrontier: string[] = [];
        for (const row of [...qM.rows, ...qF.rows]) {
          const callerName = row[0] as string;
          const calleeName = row[1] as string;
          const calleeFile = (row[2] as string) ?? '';
          const calleeLine = (row[3] as number) ?? 0;

          if (callerName === calleeName) continue;
          if (/\.(test|spec)\.|__tests__/.test(calleeFile)) continue;

          const edgeKey = `${callerName}->${calleeName}`;
          if (globalSeen.has(edgeKey)) continue;
          globalSeen.add(edgeKey);

          edges.push({ caller: callerName, callee: calleeName, calleeFile, calleeLine });

          if (!visited.has(calleeName)) {
            visited.add(calleeName);
            nextFrontier.push(calleeName);
          }
        }
        frontier = nextFrontier;
      }

      if (edges.length > 0) {
        groups.push({ entry: entry.name, entryFile: entry.file, edges });
      }
    }

    // 扇入表：被调用最多的符号（从 hotspots 取）
    const fanIn: CallsContext['fanIn'] = arch.hotspots.slice(0, 15).map(h => ({
      symbol: h.name,
      file: h.qualified_name.split('.').slice(-2, -1)[0] ?? '',
      inDegree: h.fan_in,
    }));

    return { groups, fanIn };
  }

  /**
   * classes.md 数据源：类清单 + 每类方法表（降级适配）。
   * MCP 无 INHERITS 边、Class 无 parent_class/is_abstract，故只做扁平类表。
   * 方向是 (c:Class)-[:DEFINES_METHOD]->(m:Method)。
   */
  buildClassesContext(): ClassesContext {
    // 查所有类及其方法（DEFINES_METHOD 方向：Class → Method）
    const q = this.client.queryGraph(
      `MATCH (c:Class)-[:DEFINES_METHOD]->(m:Method)
       WHERE c.is_test = false
       RETURN c.name AS cls, c.qualified_name AS qn, c.file_path AS cfile, c.start_line AS cline,
              m.name AS mname, m.signature AS msig, m.visibility AS mvis,
              m.docstring AS mdoc, m.file_path AS mfile, m.start_line AS mline
       ORDER BY c.name, m.start_line LIMIT 500`,
    );

    const classMap = new Map<string, ClassesContext['classes'][number]>();
    for (const row of q.rows) {
      const clsName = row[0] as string;
      if (!classMap.has(clsName)) {
        classMap.set(clsName, {
          name: clsName,
          qualifiedName: row[1] as string,
          filePath: (row[2] as string) ?? '',
          startLine: (row[3] as number) ?? 0,
          parentClass: null, // MCP 未提供继承数据
          methods: [],
        });
      }
      classMap.get(clsName)!.methods.push({
        name: row[4] as string,
        signature: (row[5] as string) ?? '',
        visibility: (row[6] as string) ?? 'public',
        docstring: (row[7] as string) ?? null,
        filePath: (row[8] as string) ?? '',
        startLine: (row[9] as number) ?? 0,
      });
    }

    return {
      classes: Array.from(classMap.values()),
      hasInheritance: false, // MCP 当前不支持 INHERITS 边
    };
  }

  /**
   * README.md 数据源：文档索引（来自 PAGE_REGISTRY）+ 项目元数据（package.json）。
   * README 是 wiki 总入口，索引表必须覆盖全部文档。
   */
  buildReadmeContext(): ReadmeContext {
    let projectName = '';
    let version = '';
    let license = '';
    let description = '';
    let runtime = '';

    try {
      const pkgPath = join(this.scanResult.rootDir, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        projectName = pkg.name ?? '';
        version = pkg.version ?? '';
        license = pkg.license ?? '';
        description = pkg.description ?? '';
        runtime = pkg.type === 'module' ? 'ESM' : 'CJS';
      }
    } catch { /* ignore */ }

    const docIndex = PAGE_REGISTRY.map(p => ({
      file: `${p.name}.md`,
      tier: p.tier,
      answer: p.answer,
    }));

    return { projectName, version, license, description, runtime, docIndex };
  }

  /**
   * environment.md 数据源：运行态信息（来自 ConfigDetector）。
   * 包名/版本/运行时/Node 版本/包管理器/脚本命令/env 变量。
   */
  buildEnvironmentContext(): EnvironmentContext {
    return this.detector.detectEnvironment();
  }

  /**
   * testing.md 数据源：测试框架/目录/夹具（来自 ConfigDetector）+ 运行命令。
   */
  buildTestingContext(): TestingContext {
    const info = this.detector.detectTesting();
    const env = this.detector.detectEnvironment();
    return {
      ...info,
      runCommand: env.scripts.test ?? '',
    };
  }

  /**
   * conventions.md 数据源：规约信息（来自 ConfigDetector）。
   * Linter/EditorConfig/AGENTS.md 探测结果，诚实标注缺失项。
   */
  buildConventionsContext(): ConventionsContext {
    return this.detector.detectConventions();
  }

  /**
   * constraints.md 数据源：限制常量（ConfigDetector 源码扫描）+ 高复杂度函数（MCP）。
   *
   * 关键：MCP 的 complexity 仅在 Method/Function 节点可靠（Class/Interface 恒 0），
   * 故 Cypher 显式限定 label IN ['Method', 'Function']，避免拉入噪声。
   */
  buildConstraintsContext(): ConstraintsContext {
    const constants = this.detector.detectConstraints().constants;

    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.complexity > 3 AND n.is_test = false
         AND n.label IN ['Method', 'Function']
       RETURN n.name AS name, n.file_path AS file, n.complexity AS cx, n.loop_depth AS ld
       ORDER BY n.complexity DESC LIMIT 20`,
    );
    const hotFunctions = q.rows.map(row => ({
      name: row[0] as string,
      filePath: (row[1] as string) ?? '',
      complexity: row[2] as number,
      loopDepth: (row[3] as number) ?? 0,
    }));

    return { constants, hotFunctions };
  }

  /**
   * cli.md 数据源：命令注册（MCP entry_points + getCodeSnippet 解析 commander options）
   * + 退出码（源码扫 process.exit(N)）。
   *
   * entry_points 即 CLI 命令入口；getCodeSnippet 读 register*Command 源码，
   * 从 .option() 调用提取参数定义。
   */
  buildCliContext(): CliContext {
    const arch = this.client.getArchitecture();

    const commands = arch.entry_points
      .filter(e => e.name.startsWith('register') || e.name.includes('Command'))
      .slice(0, 10)
      .map(e => {
        const snippet = this.safeGetSnippet(e.name);
        const options = this.parseCommanderOptions(snippet?.source ?? '');
        const cleanName = e.name.replace(/^register/, '').replace(/Command$/, '').toLowerCase() || e.name;
        return {
          name: cleanName,
          description: snippet?.docstring ?? '',
          filePath: e.file,
          startLine: snippet?.start_line ?? 0,
          options,
        };
      });

    // 退出码：从 scanResult 源码扫 process.exit(N)
    const exitCodes = this.scanResult.files
      .filter(f => f.extension === '.ts' || f.extension === '.js')
      .flatMap(f => this.extractExitCodes(f.absolutePath, f.relativePath))
      .slice(0, 20);

    return { commands, exitCodes };
  }

  /** 从 commander 源码解析 .option('flag', 'description') 调用 */
  private parseCommanderOptions(source: string): Array<{ flag: string; description: string }> {
    const options: Array<{ flag: string; description: string }> = [];
    const optRegex = /\.option\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;
    let match: RegExpExecArray | null;
    while ((match = optRegex.exec(source)) !== null) {
      options.push({ flag: match[1], description: match[2] });
    }
    return options;
  }

  /** 从源码逐行提取 process.exit(N) 调用 */
  private extractExitCodes(absPath: string, relPath: string): Array<{ code: number; context: string; filePath: string }> {
    const codes: Array<{ code: number; context: string; filePath: string }> = [];
    try {
      const source = readFileSync(absPath, 'utf-8');
      const lines = source.split('\n');
      const exitRegex = /process\.exit\((\d+)\)/;
      lines.forEach((line) => {
        const m = exitRegex.exec(line);
        if (m) {
          codes.push({
            code: parseInt(m[1], 10),
            context: line.trim().slice(0, 80),
            filePath: relPath,
          });
        }
      });
    } catch { /* skip unreadable */ }
    return codes;
  }

  /**
   * 容错地获取代码片段。getCodeSnippet 失败或无结果时返回 null，不抛错。
   */
  private safeGetSnippet(qualifiedName: string): SnippetData | null {
    if (!qualifiedName) return null;
    try {
      const s = this.client.getCodeSnippet(qualifiedName);
      return s && s.source ? s : null;
    } catch {
      return null;
    }
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
