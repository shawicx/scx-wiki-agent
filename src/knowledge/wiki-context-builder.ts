import { readFileSync, existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { SnippetData, ArchitectureData } from '../mcp/types.js';
import type { ScanResult } from '../core/scanner.js';
import type { SymbolType, RelationType } from '../core/types.js';
import { isTestPath, languageDomainOf, matchPackageForFile, importedPackageName } from '../shared/utils.js';
import { PAGE_REGISTRY, pageRelPath, isTopicPage, topicIdFromPage, TOPIC_DIR, TOPIC_ANSWER, isChapterPage, parseChapterPage, CHAPTER_DIR, CHAPTER_ANSWER } from './page-registry.js';
import { ConfigDetector } from './config-detector.js';
import { collectEvidenceFiles, toKnownRelativePath, EVIDENCE_MIN_FILES } from './wiki-evidence.js';
import { findSymbolDefinitions } from './source-fallback.js';
import { IntentEvidenceProvider } from './intent-evidence.js';
import { isTauriProject, scanIpcSurface } from './tauri-ipc.js';
import type { TopicDefinition } from './topic-discovery.js';
import type { OutlineChapter } from './outline.js';
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
  GlossaryContext,
  CallsContext,
  ClassesContext,
  ReadmeContext,
  EnvironmentContext,
  TestingContext,
  ConventionsContext,
  ConstraintsContext,
  CliContext,
  TechStackContext,
  TopicContext,
  ChapterPageContext,
  DecisionsContext,
  SupplementalSymbol,
  DepUsage,
} from './types.js';

const ENTRY_FILE_NAMES = ['index.ts', 'index.js', 'main.ts', 'main.js', 'cli.ts', 'cli.js'];

/** calls 页目标入口组数：入口组不足时以高扇入热点锚定回填（覆盖稀疏的主力补偿） */
const CALLS_MIN_GROUPS = 6;
/** calls 页单次查询边数上限（BFS 每层两次查询各限此数） */
const CALLS_EDGE_LIMIT = 40;

/** modules 页详述上限：超过后其余模块聚合为概要（DeepWiki 目录分组分块的防超限映射） */
const MODULE_DETAIL_LIMIT = 12;
/** 每个生产包的图谱符号候选上限（分包查询，避免全局 Top N 挤占小模块） */
const MODULE_SYMBOL_CANDIDATE_LIMIT = 60;
/** Architecture 页每模块代表符号上限 */
const ARCHITECTURE_SYMBOL_LIMIT = 6;
/** Modules 页每模块代表符号 / 代表文件上限 */
const MODULES_SYMBOL_LIMIT = 10;
/** Modules 页单个文件最多贡献的符号数（防单文件垄断） */
const MODULES_SYMBOLS_PER_FILE_LIMIT = 5;
const MODULES_REPRESENTATIVE_FILE_LIMIT = 12;

/** 走 LLM 路径且证据可能偏薄的 structure 页，触发 hotspot 补强 */
const EVIDENCE_ENRICH_PAGES = [
  'overview', 'architecture', 'data-flow', 'modules', 'api', 'glossary',
];

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

  private knownFiles: Set<string> | null = null;
  /** 主题页定义（由 WikiService 从 topics.json 装配注入） */
  private topics: TopicDefinition[] = [];
  /** 章节树净页（由 WikiService 从 outline.json 校验后注入） */
  private outlineChapters: OutlineChapter[] = [];
  /** 声明依赖名全集（package.json + techStack；断言校验 universe 回填用，构建内缓存） */
  private depNames: Set<string> | null = null;
  /** 意图证据提供器（「为什么」证据源；由 WikiService 注入，缺省时各页 intent 字段省略） */
  private intentProvider: IntentEvidenceProvider | null = null;
  private intentModulesReady = false;
  /** 生产包索引与分包符号证据缓存（同一构建内 Architecture / Modules 复用） */
  private architectureSnapshotCache: ArchitectureData | null = null;
  private productionModulesCache: Array<{ pkg: ArchitectureData['packages'][number]; files: string[]; index: number }> | null = null;
  private moduleEvidenceCache = new Map<string, ModuleSummary['symbols']>();

  setIntentProvider(provider: IntentEvidenceProvider): void {
    this.intentProvider = provider;
  }

  setTopics(topics: TopicDefinition[]): void {
    this.topics = topics;
  }

  setOutlineChapters(chapters: OutlineChapter[]): void {
    this.outlineChapters = chapters;
  }

  /** 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 */
  buildByName(page: string, plannedPages?: string[]): unknown {
    const ctx = this.dispatchContext(page, plannedPages);
    if (ctx === null || ctx === undefined) return ctx;
    return this.enrichIfThinEvidence(page, ctx);
  }

  private dispatchContext(page: string, plannedPages?: string[]): unknown {
    if (isTopicPage(page)) return this.buildTopicContext(topicIdFromPage(page));
    if (isChapterPage(page)) return this.buildChapterPageContext(page);
    switch (page) {
      case 'overview': return this.buildOverviewContext();
      case 'architecture': return this.buildArchitectureContext();
      case 'data-flow': return this.buildDataFlowContext();
      case 'modules': return this.buildModulesContext();
      case 'api': return this.buildApiContext();
      case 'onboarding': return this.buildOnboardingContext();
      case 'troubleshooting': return this.buildTroubleshootingContext();
      case 'glossary': return this.buildGlossaryContext();
      case 'calls': return this.buildCallsContext();
      case 'classes': return this.buildClassesContext();
      case 'readme': return this.buildReadmeContext(plannedPages);
      case 'environment': return this.buildEnvironmentContext();
      case 'testing': return this.buildTestingContext();
      case 'conventions': return this.buildConventionsContext();
      case 'constraints': return this.buildConstraintsContext();
      case 'decisions': return this.buildDecisionsContext();
      case 'cli': return this.buildCliContext();
      case 'tech-stack': return this.buildTechStackContext();
      default: return null;
    }
  }

  /**
   * 证据补强（DeepWiki「二次扩展检索」的图谱版）：
   * LLM 路径的 structure 页证据文件低于下限时，从图谱补一批高复杂度真实符号，
   * 只保留扫描清单内的文件路径。图谱查无的热点/入口名回落源码正则探测
   * （mcp 对 .vue/部分 Rust 索引不全，避免 LLM 把真实符号标成「待确认」）。
   */
  private enrichIfThinEvidence(page: string, ctx: unknown): unknown {
    if (!EVIDENCE_ENRICH_PAGES.includes(page)) return ctx;
    const known = this.getKnownFiles();
    if (collectEvidenceFiles(ctx, known, this.scanResult.rootDir).length >= EVIDENCE_MIN_FILES) {
      return ctx;
    }
    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.is_test = false AND n.file_path IS NOT NULL
         AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.label AS label, n.file_path AS file,
              n.complexity AS cx, n.signature AS sig, n.docstring AS doc
       ORDER BY n.complexity DESC LIMIT 8`,
    );
    const supplementalSymbols: SupplementalSymbol[] = q.rows
      .map(row => ({
        name: row[0] as string,
        type: this.labelToSymbolType(row[1] as string),
        file: row[2] as string,
        complexity: row[3] as number | undefined,
        signature: (row[4] as string | null) ?? null,
        docstring: (row[5] as string | null) ?? null,
      }))
      .map(s => ({ ...s, file: toKnownRelativePath(s.file, known, this.scanResult.rootDir) ?? '' }))
      .filter(s => s.file !== '' && !isTestPath(s.file));
    for (const s of this.appendSourceFallback(supplementalSymbols)) {
      supplementalSymbols.push(s);
    }
    if (supplementalSymbols.length === 0) return ctx;
    return { ...(ctx as Record<string, unknown>), supplementalSymbols };
  }

  /**
   * 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。
   * 找到的名字记入 fallbackSymbolNames（供断言校验 universe 回填）。
   */
  private appendSourceFallback(existing: Array<{ name: string }>): SupplementalSymbol[] {
    const existingNames = new Set(existing.map(s => s.name));
    const arch = this.client.getArchitecture();
    const wanted = [
      ...arch.hotspots.slice(0, 10).map(h => h.name),
      ...arch.entry_points.slice(0, 8).map(e => e.name),
    ].filter(n => !existingNames.has(n));
    if (wanted.length === 0) return [];
    const found = findSymbolDefinitions(wanted, this.scanResult, this.sourceCache)
      .filter(s => !existingNames.has(s.name));
    for (const s of found) this.fallbackSymbolNames.add(s.name);
    return found;
  }

  private getKnownFiles(): Set<string> {
    if (!this.knownFiles) {
      this.knownFiles = new Set(this.scanResult.files.map(f => f.relativePath));
    }
    return this.knownFiles;
  }

  /** 模块级意图证据预聚合（构建内幂等）：候选文件按体积降序作重要性代理，
 *  提供方内部截 GIT_FILE_CAP 控住子进程成本 */
  private prepareIntentModules(pkgNames: string[]): void {
    if (!this.intentProvider || this.intentModulesReady) return;
    this.intentModulesReady = true;
    const candidates = this.scanResult.files
      .filter(f => !isTestPath(f.relativePath))
      .sort((a, b) => b.size - a.size)
      .map(f => f.relativePath);
    this.intentProvider.prepareModules(pkgNames, candidates);
  }

  buildOverviewContext(): OverviewContext {
    const arch = this.client.getArchitecture();
    // 入口文件只认生产代码（tests/fixtures 下的同名文件不算项目入口）
    const entryFiles = this.scanResult.files
      .filter(f => !isTestPath(f.relativePath))
      .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
      .map(f => ({ name: f.relativePath.split('/').pop()!, path: f.relativePath }));

    // hotspots 即高扇入符号，用作 topSymbols，体现项目核心（qn 供锚点与 trace 复用）
    const topSymbols = arch.hotspots.slice(0, 10).map(h => ({
      name: h.name,
      type: 'function' as SymbolType,
      qualifiedName: h.qualified_name,
      complexity: h.fan_in,
    }));

    const pkgMeta = this.readPackageMeta();

    return {
      projectType: this.scanResult.projectType,
      hasTypeScript: this.scanResult.hasTypeScript,
      fileCount: this.scanResult.files.length,
      techStack: this.scanResult.techStack,
      sourceDirs: this.scanResult.sourceDirs,
      languages: arch.languages.map(l => ({
        language: l.language,
        fileCount: l.file_count,
        // 各语言真实文件锚点：防止 LLM 以「未提供该语言文件路径」为由整段标待确认
        exampleFiles: this.exampleFilesForLanguage(l.language),
      })),
      readmeExcerpt: this.readRepoFileExcerpt('README.md', 2000),
      docsFiles: this.scanResult.files
        .map(f => f.relativePath)
        .filter(p => p.startsWith('docs/') && p.endsWith('.md') && !isTestPath(p))
        .slice(0, 10),
      packageName: pkgMeta.name,
      packageDescription: pkgMeta.description,
      entryFiles,
      topSymbols,
      depUsage: this.buildDepUsage(),
      ...(this.intentProvider ? { intent: this.intentProvider.overviewIntent(entryFiles.map(f => f.path)) } : {}),
    };
  }

  /** 语言名 → 扫描清单内真实文件样本（≤3 个，优先生产代码） */
  private exampleFilesForLanguage(language: string): string[] {
    const want = language.toLowerCase();
    const byLang = this.scanResult.files
      .filter(f => !isTestPath(f.relativePath) && f.language.toLowerCase() === want)
      .map(f => f.relativePath);
    if (byLang.length > 0) return byLang.slice(0, 3);
    // 语言名与扫描 language 字段不一致时按扩展名兑底（vue/css/json 等资源语言）
    const extMap: Record<string, string[]> = {
      typescript: ['.ts', '.tsx'], javascript: ['.js', '.jsx', '.mjs'],
      rust: ['.rs'], vue: ['.vue'], python: ['.py'], go: ['.go'],
      css: ['.css', '.scss', '.less'], markdown: ['.md'],
      json: ['.json'], yaml: ['.yaml', '.yml'], toml: ['.toml'], html: ['.html', '.htm'],
    };
    const exts = extMap[want];
    if (!exts) return [];
    return this.scanResult.files
      .filter(f => !isTestPath(f.relativePath) && exts.includes(f.extension))
      .map(f => f.relativePath)
      .slice(0, 3);
  }

  /**
   * 技术栈依赖的使用证据（overview/onboarding/troubleshooting 等元数据页用）。
   * 依赖名本身有 package.json 声明实据；用途证据分三级：生产 import 点 /
   * 测试文件 import 点 / scripts 命令引用（如 vitest 仅由 `vitest run` 触发）。
   * usageKind ≠ none 的依赖严禁被写成「声明未用」——防止把测试/脚本型工具
   * 误标成死依赖（R5 噪音大头）。
   */
  private buildDepUsage(): Array<DepUsage> {
    const declared = this.declaredPackageDeps();
    const prodImports = this.collectImportFiles(declared, 'prod');
    const testImports = this.collectImportFiles(declared, 'test');
    let scripts: Record<string, string> = {};
    try {
      scripts = this.detector?.detectEnvironment().scripts ?? {};
    } catch {
      scripts = {};
    }
    return this.scanResult.techStack.map(name => {
      const prod = prodImports.get(name) ?? [];
      if (prod.length > 0) {
        return { name, importFiles: prod.slice(0, 5), importCount: prod.length, usageKind: 'import' as const };
      }
      const test = testImports.get(name) ?? [];
      if (test.length > 0) {
        return { name, importFiles: test.slice(0, 5), importCount: test.length, usageKind: 'test' as const };
      }
      const inScript = Object.values(scripts).some(cmd => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(cmd));
      if (inScript) {
        return { name, importFiles: [], importCount: 0, usageKind: 'script' as const };
      }
      return { name, importFiles: [], importCount: 0, usageKind: 'none' as const };
    });
  }

  /** 声明依赖名全集（dependencies + devDependencies；非 Node 项目为空集，构建内缓存） */
  private declaredDepsCache: Set<string> | null = null;
  private declaredPackageDeps(): Set<string> {
    if (this.declaredDepsCache === null) {
      const names = new Set<string>();
      try {
        const pkg = JSON.parse(readFileSync(join(this.scanResult.rootDir, 'package.json'), 'utf-8'));
        for (const n of Object.keys(pkg.dependencies ?? {})) names.add(n);
        for (const n of Object.keys(pkg.devDependencies ?? {})) names.add(n);
      } catch {
        // 无 package.json 的项目诚实返回空集
      }
      this.declaredDepsCache = names;
    }
    return this.declaredDepsCache;
  }

  /** 依赖名全集（声明名 + techStack 探测名）：断言校验 universe 回填用。
   *  正文反引号里的依赖名有 package.json/import 双重实据，不该被标「待确认」 */
  getDepNames(): Set<string> {
    if (this.depNames === null) {
      this.depNames = new Set([...this.declaredPackageDeps(), ...this.scanResult.techStack]);
    }
    return this.depNames;
  }

  /** 读仓库根下文本文件的前 N 字符（段落边界截断；不可读返回 undefined） */
  private readRepoFileExcerpt(relPath: string, maxLen: number): string | undefined {
    try {
      const content = readFileSync(join(this.scanResult.rootDir, relPath), 'utf-8');
      if (content.length <= maxLen) return content;
      const cut = content.slice(0, maxLen);
      const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n#'));
      return (lastBreak > maxLen * 0.5 ? cut.slice(0, lastBreak) : cut).trimEnd() + '\n\n（已截断）';
    } catch {
      return undefined;
    }
  }

  /** package.json 的 name/description（读取失败返回空串，诚实降级） */
  private readPackageMeta(): { name: string; description: string } {
    try {
      const pkg = JSON.parse(readFileSync(join(this.scanResult.rootDir, 'package.json'), 'utf-8'));
      return { name: pkg.name ?? '', description: pkg.description ?? '' };
    } catch {
      return { name: '', description: '' };
    }
  }

  /**
   * 生产包索引：graph package 必须能映射到至少一个非测试扫描文件。
   * tests/fixtures/helpers 等无生产文件支撑的图谱包不进入 Architecture / Modules 主叙事。
   */
  private productionModules(): Array<{ pkg: ArchitectureData['packages'][number]; files: string[]; index: number }> {
    if (this.productionModulesCache !== null) return this.productionModulesCache;

    const arch = this.getArchitectureSnapshot();
    const pkgNames = arch.packages.map(p => p.name);
    const filesByPackage = new Map<string, string[]>();
    for (const file of this.scanResult.files) {
      if (isTestPath(file.relativePath)) continue;
      const pkg = matchPackageForFile(file.relativePath, pkgNames);
      if (!pkg) continue;
      const files = filesByPackage.get(pkg) ?? [];
      files.push(file.relativePath);
      filesByPackage.set(pkg, files);
    }

    this.productionModulesCache = arch.packages
      .map((pkg, index) => ({ pkg, files: filesByPackage.get(pkg.name) ?? [], index }))
      .filter(({ pkg, files }) => pkg.name.length > 0 && files.length > 0);
    return this.productionModulesCache;
  }

  /** 分包查询 + 文件级 round-robin 公平采样，避免单个高复杂度文件垄断模块代表符号 */
  private moduleEvidence(pkgName: string, files: string[], hotspotNames: ReadonlySet<string>): ModuleSummary['symbols'] {
    if (this.moduleEvidenceCache.has(pkgName)) {
      return this.moduleEvidenceCache.get(pkgName)!;
    }
    const fileList = files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(',');
    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.file_path IN [${fileList}] AND n.is_test = false
       AND (n.docstring IS NOT NULL OR n.complexity > 0) AND n.label IN ['Class', 'Function', 'Method']
       RETURN n.name AS name, n.label AS label, n.docstring AS doc, n.signature AS sig,
              n.complexity AS cx, n.file_path AS file, n.start_line AS line
       ORDER BY n.complexity DESC, n.file_path ASC, n.start_line ASC LIMIT ${MODULE_SYMBOL_CANDIDATE_LIMIT}`,
      MODULE_SYMBOL_CANDIDATE_LIMIT,
    );

    const seen = new Set<string>();
    const byFile = new Map<string, ModuleSummary['symbols']>();
    for (const row of q.rows) {
      const file = (row[5] as string) ?? '';
      if (!file || isTestPath(file) || !files.includes(file)) continue;
      const name = String(row[0] ?? '');
      if (!name) continue;
      const startLine = Number(row[6] ?? 0) || undefined;
      const identity = `${name}@${file}:${startLine ?? 0}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      const symbols = byFile.get(file) ?? [];
      symbols.push({
        name,
        type: this.labelToSymbolType(row[1] as string),
        file,
        ...(startLine !== undefined ? { startLine } : {}),
        docstring: (row[2] as string | null) ?? null,
        signature: (row[3] as string | null) ?? null,
        complexity: Number(row[4] ?? 0) || 0,
      });
      byFile.set(file, symbols);
    }

    const score = (symbol: { name: string; docstring?: string | null; complexity?: number } | undefined) =>
      symbol === undefined
        ? Number.NEGATIVE_INFINITY
        : (symbol.complexity ?? 0) + (symbol.docstring ? 4 : 0) + (hotspotNames.has(symbol.name) ? 8 : 0);
    const groups = [...byFile.entries()]
      .map(([file, symbols]) => ({
        file,
        symbols: [...symbols].sort((a, b) =>
          score(b) - score(a) || a.name.localeCompare(b.name) || (a.startLine ?? 0) - (b.startLine ?? 0)),
      }))
      .sort((a, b) => score(b.symbols[0]) - score(a.symbols[0]) || a.file.localeCompare(b.file));

    const ordered: ModuleSummary['symbols'] = [];
    const usedByFile = new Map<string, number>();
    while (ordered.length < MODULES_SYMBOL_LIMIT && groups.length > 0) {
      const group = groups[0];
      if ((usedByFile.get(group.file) ?? 0) >= MODULES_SYMBOLS_PER_FILE_LIMIT) {
        groups.shift();
        continue;
      }
      const symbol = group.symbols.shift();
      if (symbol) {
        ordered.push(symbol);
        usedByFile.set(group.file, (usedByFile.get(group.file) ?? 0) + 1);
      }
      if (group.symbols.length === 0) groups.shift();
      else groups.push(groups.shift()!);
    }

    this.moduleEvidenceCache.set(pkgName, ordered);
    return ordered;
  }

  /** Architecture / Modules 共用同一架构快照，避免分包索引与页面边界数据来自不同响应 */
  private getArchitectureSnapshot(): ArchitectureData {
    if (this.architectureSnapshotCache === null) {
      this.architectureSnapshotCache = this.client.getArchitecture();
    }
    return this.architectureSnapshotCache;
  }

  private representativeFiles(files: string[], symbols: ModuleSummary['symbols']): string[] {
    const symbolFiles = [...new Set(symbols.map(s => s.file).filter((f): f is string => !!f))];
    const remaining = files.filter(f => !symbolFiles.includes(f));
    return [...symbolFiles, ...remaining].slice(0, MODULES_REPRESENTATIVE_FILE_LIMIT);
  }

  private buildFileSymbols(files: string[], symbols: ModuleSummary['symbols']): ModuleSummary['fileSymbols'] {
    const byFile = new Map<string, ModuleSummary['symbols']>();
    for (const symbol of symbols) {
      if (!symbol.file) continue;
      const group = byFile.get(symbol.file) ?? [];
      group.push(symbol);
      byFile.set(symbol.file, group);
    }
    return files.map(file => ({ file, symbols: (byFile.get(file) ?? []).slice(0, 5) }));
  }

  buildArchitectureContext(): ArchitectureContext {
    const arch = this.getArchitectureSnapshot();
    const production = this.productionModules();
    const productionNames = production.map(m => m.pkg.name);
    const hotspotNames = new Set(arch.hotspots.map(h => h.name));
    this.prepareIntentModules(productionNames);

    // 模块间依赖从 boundaries 回填：detail 分节按模块读 outgoing/incoming，
    // 空数组会让 LLM 如实写出「无依赖证据」并成页标注待确认
    const outgoing = new Map<string, ModuleSummary['outgoingRelations']>();
    const incoming = new Map<string, ModuleSummary['incomingRelations']>();
    for (const b of arch.boundaries) {
      if (!productionNames.includes(b.from) || !productionNames.includes(b.to)) continue;
      const out = outgoing.get(b.from) ?? [];
      out.push({ target: b.to, type: 'calls' as RelationType });
      outgoing.set(b.from, out);
      const inc = incoming.get(b.to) ?? [];
      inc.push({ source: b.from, type: 'calls' as RelationType });
      incoming.set(b.to, inc);
    }

    const modules: ModuleSummary[] = production.map(({ pkg, files }) => {
      const symbols = this.moduleEvidence(pkg.name, files, hotspotNames).slice(0, ARCHITECTURE_SYMBOL_LIMIT);
      return {
        name: pkg.name,
        fileCount: files.length,
        files: this.representativeFiles(files, symbols),
        symbols,
        fileSymbols: [],
        outgoingRelations: outgoing.get(pkg.name) ?? [],
        incomingRelations: incoming.get(pkg.name) ?? [],
        codeSnippets: [],
        languages: this.languagesForFiles(files),
        fanIn: pkg.fan_in,
        fanOut: pkg.fan_out,
        ...(this.intentProvider?.moduleIntent(pkg.name)
          ? { intent: this.intentProvider.moduleIntent(pkg.name) }
          : {}),
      };
    });

    const interModuleRelations = arch.boundaries.map(b => ({
      source: b.from,
      target: b.to,
      type: 'calls' as RelationType,
    })).filter(b => productionNames.includes(b.source) && productionNames.includes(b.target));

    return {
      modules,
      interModuleRelations,
      layers: this.filterLayers(arch.layers, productionNames),
      boundaries: arch.boundaries
        .filter(b => productionNames.includes(b.from) && productionNames.includes(b.to))
        .map(b => ({ from: b.from, to: b.to, callCount: b.call_count })),
      clusters: arch.clusters.map(c => ({
        label: c.label,
        members: c.members,
        topNodes: c.top_nodes,
        cohesion: c.cohesion,
      })),
    };
  }

  /** 分层表消费侧过滤（延续「图谱边不可信」防线）：只保留锚定到真实包的行，
 *  拦上游把 .d.ts/空包名误判为 api 层的脏行；技术栈无 HTTP 框架时拦「HTTP route」误判 */
  private filterLayers(layers: ArchitectureData['layers'], pkgNames: string[]): ArchitectureData['layers'] {
    const known = new Set(pkgNames);
    const hasHttpFramework = this.scanResult.projectType === 'backend'
      || this.scanResult.techStack.some(t => /express|fastify|nest|koa|hono|apollo|restify/i.test(t));
    return layers.filter(l => {
      if (!l.name || !known.has(l.name)) return false;
      if (!hasHttpFramework && /HTTP route/i.test(l.reason)) return false;
      return true;
    });
  }

  buildDataFlowContext(): DataFlowContext {
    const arch = this.client.getArchitecture();

    // 已被先前序列覆盖的符号不再单独成节（前缀序列已包含其调用链，避免重复展示）
    const sequences: ExecutionSequence[] = [];
    const covered = new Set<string>();
    for (const entry of arch.entry_points.slice(0, 6)) {
      if (!this.isAppEntryPoint(entry.file)) continue;
      if (covered.has(entry.name)) continue;
      const seq = this.buildCallChainFromEdges(entry.name, entry.file);
      if (seq) {
        sequences.push(seq);
        for (const m of seq.messages) {
          covered.add(m.from);
          covered.add(m.to);
        }
      }
    }

    // 锚点回填：入口序列不足时以高出边符号补序列（图谱 entry_points 漏采/
    // 跨语言入口被滤时不至于整页因「无执行序列」被剔除）
    if (sequences.length < 3) {
      for (const anchor of this.topCallerAnchors()) {
        if (sequences.length >= 3) break;
        if (covered.has(anchor.name)) continue;
        const seq = this.buildCallChainFromEdges(anchor.name, anchor.file);
        if (seq) {
          sequences.push(seq);
          for (const m of seq.messages) {
            covered.add(m.from);
            covered.add(m.to);
          }
        }
      }
    }

    return { sequences };
  }

  /** entry_points 消费端过滤：排除非代码文件与构建脚本（build.rs/deps.rs 是构建期代码，不是应用入口） */
  private isAppEntryPoint(file: string): boolean {
    if (languageDomainOf(file) === null) return false;
    if (/(^|\/)(build|deps)\.rs$/.test(file)) return false;
    return true;
  }

  /**
   * 调用边可信性判定（图谱消费端防线，拦上游误建边）：
   * 1. 语言域一致——caller/callee 文件必须同属一个语言域（ts/rust），排除跨语言
   *    幽灵边（如 Rust run() 调 TS 前端函数）与非代码节点（tauri.conf.json 作被调方）；
   * 2. 词法核验——caller 源码中必须出现 callee 名（拦 constructor→write 这类
   *    把类成员定义误判为调用的边）。文件缺失/不可读时按可信处理（宁漏勿误）。
   */
  private isTrustedCallEdge(callerFile: string, calleeFile: string, calleeName: string): boolean {
    const callerDomain = languageDomainOf(callerFile);
    const calleeDomain = languageDomainOf(calleeFile);
    if (callerDomain === null || calleeDomain === null || callerDomain !== calleeDomain) return false;
    return this.edgeHasLexicalEvidence(callerFile, calleeName);
  }

  /** caller 源码缓存（词法核验用；不可读文件缓存为 null） */
  private sourceCache = new Map<string, string | null>();

  /** 源码回落找到的符号名全集（供 WikiService 回填断言校验 universe，防自证矛盾） */
  private fallbackSymbolNames = new Set<string>();

  getFallbackSymbolNames(): Set<string> {
    return this.fallbackSymbolNames;
  }

  private edgeHasLexicalEvidence(callerFile: string, calleeName: string): boolean {
    if (!callerFile || !calleeName) return true;
    let src = this.sourceCache.get(callerFile);
    if (src === undefined) {
      const abs = isAbsolute(callerFile) ? callerFile : join(this.scanResult.rootDir, callerFile);
      try {
        src = readFileSync(abs, 'utf-8');
      } catch {
        src = null;
      }
      this.sourceCache.set(callerFile, src);
    }
    if (src === null) return true;
    const escaped = calleeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(src);
  }

  /**
   * 基于 CALLS 边 BFS 构建真实调用链（修复伪线性化问题）。
   * trace_path 返回扁平的 callee 列表（只有 hop 层级，无 caller→callee 边），
   * 直接线性化会把并行分支误画成串行序列。
   * 这里改用 Cypher 查精确的 CALLS 边，按 BFS 层级还原真实的 caller→callee 关系。
   * frontier 用 name@file 双键，防止同名符号跨语言/跨文件互相污染。
   */
  private buildCallChainFromEdges(entryName: string, entryFile: string): ExecutionSequence | null {
    const MAX_DEPTH = 3;
    const MAX_NODES = 25;

    const participants = new Map<string, { name: string; type: SymbolType; filePath: string }>();
    const messages: ExecutionSequence['messages'] = [];
    participants.set(entryName, { name: entryName, type: 'function', filePath: entryFile });

    // BFS：按层级查询精确 CALLS 边
    let frontier = new Set<string>([`${entryName}@${entryFile}`]);
    const visited = new Set<string>([entryName]);

    for (let depth = 0; depth < MAX_DEPTH && frontier.size > 0 && participants.size < MAX_NODES; depth++) {
      const nameList = [...frontier].map(k => `"${k.split('@')[0].replace(/"/g, '\\"')}"`).join(',');
      // 查当前 frontier 中每个节点的直接 callee（过滤测试节点）
      // 注意：该 Cypher 实现不支持 NOT ... CONTAINS 语法，用 is_test 过滤 + 结果后处理
      const q = this.client.queryGraph(
        `MATCH (caller)-[:CALLS]->(callee)
         WHERE caller.name IN [${nameList}]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, caller.file_path AS callerFile,
                callee.name AS callee, callee.file_path AS file, callee.label AS label, callee.start_line AS line
         LIMIT 40`,
      );

      const nextFrontier = new Set<string>();
      for (const row of q.rows) {
        const callerName = row[0] as string;
        const callerFile = (row[1] as string) ?? '';
        const calleeName = row[2] as string;
        const calleeFile = (row[3] as string) ?? '';
        const calleeLabel = row[4] as string;
        const calleeLine = Number(row[5] ?? 0);

        // 跳过自调用
        if (callerName === calleeName) continue;

        // JS 层兜底过滤测试文件（Cypher 的 NOT CONTAINS 不兼容）
        if (/\.(test|spec)\.|__tests__/.test(calleeFile)) continue;

        // 双键校验：caller 必须是本轮 frontier 中的具体符号（同名的其他语言/文件符号不算）
        if (!frontier.has(`${callerName}@${callerFile}`)) continue;

        // 可信边判定：语言域一致 + caller 源码词法核验
        if (!this.isTrustedCallEdge(callerFile, calleeFile, calleeName)) continue;

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
          callLine: calleeLine,
          filePath: calleeFile,
        });

        if (!visited.has(calleeName)) {
          visited.add(calleeName);
          nextFrontier.add(`${calleeName}@${calleeFile}`);
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
    const arch = this.getArchitectureSnapshot();
    const production = this.productionModules();
    const productionNames = production.map(m => m.pkg.name);
    const hotspotNames = new Set(arch.hotspots.map(h => h.name));
    this.prepareIntentModules(productionNames);

    // 模块间依赖从 boundaries 回填（detail 分节依赖此数据，空数组=成页「无依赖证据」待确认）
    const outOf = new Map<string, ModuleSummary['outgoingRelations']>();
    const inOf = new Map<string, ModuleSummary['incomingRelations']>();
    for (const b of arch.boundaries) {
      if (!productionNames.includes(b.from) || !productionNames.includes(b.to)) continue;
      const out = outOf.get(b.from) ?? [];
      out.push({ target: b.to, type: 'calls' as RelationType });
      outOf.set(b.from, out);
      const inc = inOf.get(b.to) ?? [];
      inc.push({ source: b.from, type: 'calls' as RelationType });
      inOf.set(b.to, inc);
    }
    const modules = production.map(({ pkg, files, index }) => {
      const symbols = this.moduleEvidence(pkg.name, files, hotspotNames).slice(0, MODULES_SYMBOL_LIMIT);
      const representativeFiles = this.representativeFiles(files, symbols);
      return {
        name: pkg.name,
        fileCount: files.length,
        files: representativeFiles,
        symbols,
        fileSymbols: this.buildFileSymbols(representativeFiles, symbols),
        outgoingRelations: outOf.get(pkg.name) ?? [],
        incomingRelations: inOf.get(pkg.name) ?? [],
        codeSnippets: [],
        languages: this.languagesForFiles(files),
        fanIn: pkg.fan_in,
        fanOut: pkg.fan_out,
        ...(this.intentProvider?.moduleIntent(pkg.name)
          ? { intent: this.intentProvider.moduleIntent(pkg.name) }
          : {}),
      };
    });

    // 大仓库防超限：按扇入/扇出/节点数/生产文件数综合重要性取前 N 详述，其余聚合为概要
    if (modules.length <= MODULE_DETAIL_LIMIT) {
      return { modules, ...(this.moduleIntentPageExtra()) };
    }
    const metadataByName = new Map(production.map(({ pkg, files, index }) => [pkg.name, { pkg, files, index }]));
    const ranked = modules
      .map(module => {
        const meta = metadataByName.get(module.name)!;
        const importance = meta.pkg.fan_in * 2
          + meta.pkg.fan_out
          + meta.pkg.node_count
          + (module.fileCount ?? module.files.length);
        return { module, meta, importance };
      })
      .sort((a, b) => b.importance - a.importance || a.meta.index - b.meta.index);
    const detailed = ranked.slice(0, MODULE_DETAIL_LIMIT).map(r => r.module);
    const otherModules = ranked.slice(MODULE_DETAIL_LIMIT).map(({ module, meta }) => ({
      name: module.name,
      fileCount: meta.files.length,
      symbolCount: meta.pkg.node_count,
    }));
    return { modules: detailed, otherModules, ...this.moduleIntentPageExtra() };
  }

  /** modules 页的页级意图证据：仓库级文档小节（模块无关的「为什么」） */
  private moduleIntentPageExtra(): Pick<ModulesContext, 'intent'> {
    if (!this.intentProvider) return {};
    const docs = this.intentProvider.docEvidence().slice(0, 6);
    return docs.length > 0 ? { intent: docs } : {};
  }

  buildApiContext(): ApiContext {
    const arch = this.client.getArchitecture();

    // entry_points 的语义是"无内部调用者的导出符号"，不等于 CLI 命令——
    // MCP 会把普通导出函数（如 saveWidgets）也列为 entry point。
    // project-wiki 规则「图谱结果与源码抽查一致，冲突以源码为准」：
    // 只有 register*/*Command 命名约定的入口才标为命令，其余并入导出函数表。
    const isCommandEntry = (name: string) =>
      name.startsWith('register') || name.includes('Command');
    const entries = arch.entry_points
      .filter(e => this.isAppEntryPoint(e.file))
      .slice(0, 8);
    const commands = entries
      .filter(e => isCommandEntry(e.name))
      .map(e => {
        const { description, startLine } = this.commandDescription(e.name);
        return {
          name: e.name,
          filePath: e.file,
          startLine,
          description,
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

    const exportedFunctions = q.rows
      .filter(row => !isTestPath((row[2] as string) ?? ''))
      .map(row => {
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

    // 非命令的 entry point（无调用者的导出函数）并入导出函数表，按名去重
    const seen = new Set(exportedFunctions.map(f => f.name));
    for (const e of entries) {
      if (isCommandEntry(e.name) || seen.has(e.name) || isTestPath(e.file)) continue;
      const snippet = this.safeGetSnippet(e.name);
      exportedFunctions.push({
        name: e.name,
        filePath: e.file,
        startLine: snippet?.start_line ?? 0,
        signature: snippet?.signature ?? null,
        docstring: snippet?.docstring ?? null,
      });
    }

    // Tauri 项目：IPC 面是真正的对外 API（图谱 CALLS 边不覆盖 IPC 边界），
    // 作为 api 页主数据；导出函数降为辅助（截 8 条）
    let ipc;
    if (isTauriProject(this.scanResult.rootDir)) {
      ipc = scanIpcSurface(this.scanResult, this.sourceCache);
      for (const cmd of ipc.commands) this.fallbackSymbolNames.add(cmd.name);
      for (const evt of ipc.events) this.fallbackSymbolNames.add(evt.name);
    }

    return {
      commands,
      exportedFunctions: ipc ? exportedFunctions.slice(0, 8) : exportedFunctions,
      frameworkNodes: [],
      ipc,
    };
  }

  buildGlossaryContext(): GlossaryContext {
    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file,
              n.start_line AS line
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`,
    );

    const seen = new Set<string>();
    const symbols = q.rows
      .filter(row => !isTestPath((row[5] as string) ?? ''))
      .map(row => ({
        name: row[0] as string,
        type: this.labelToSymbolType(row[1] as string),
        filePath: row[5] as string,
        startLine: row[6] as number | undefined,
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
      .filter(f => !isTestPath(f.relativePath))
      .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
      .map(f => ({ name: f.relativePath.split('/').pop()!, path: f.relativePath }));

    // 复用 ConfigDetector 提取的 scripts 和 packageManager
    const env = this.detector.detectEnvironment();
    const packageManager = env.packageManager;
    const nodeVersion = env.nodeVersion;

    const arch = this.client.getArchitecture();
    // CLI 命令名启发式（register*/*Command）只对 cli/agent 类型项目成立：
    // frontend 项目的 Vue composable（如 openCreateQuickCommandGroup 含 "Command"）
    // 会被误认为 CLI 命令，产成假命令表与无法核验的小写命令名
    const isCliProject = this.scanResult.projectType === 'cli' || this.scanResult.projectType === 'agent';
    const cliCommands = (isCliProject ? arch.entry_points : [])
      .filter(e => this.isAppEntryPoint(e.file))
      .filter(e => e.name.startsWith('register') || e.name.includes('Command'))
      .filter(e => !isTestPath(e.file))
      .slice(0, 10)
      .map(e => {
        const snippet = this.safeGetSnippet(e.name);
        // 派生命令名登记入断言校验 universe：工具自己派生的标识符不能反手标「待确认」
        const derived = e.name.replace(/^register/, '').replace(/Command$/, '').toLowerCase() || e.name;
        this.fallbackSymbolNames.add(derived);
        return {
          name: derived,
          description: this.commandDescription(e.name).description || `CLI command in ${e.file}`,
          options: snippet ? this.parseCommanderOptions(snippet.source ?? '') : [],
        };
      });

    // 首次运行最小示例
    const buildCmd = env.scripts.build ?? `${packageManager} run build`;
    const runCmd = cliCommands[0]?.name
      ?? env.scripts.dev ?? env.scripts.start ?? buildCmd;
    const firstRunExample = cliCommands[0]?.name
      ? `${packageManager} install\n${buildCmd}\nnode dist/bin.js ${runCmd}`
      : `${packageManager} install\n${runCmd}`;

    return {
      projectType: this.scanResult.projectType,
      techStack: this.scanResult.techStack,
      entryFiles,
      sourceDirs: this.scanResult.sourceDirs,
      hasTypeScript: this.scanResult.hasTypeScript,
      packageManager,
      nodeVersion,
      cliCommands,
      scripts: env.scripts,
      envVars: env.envVars,
      depUsage: this.buildDepUsage(),
      sourceDirFiles: this.scanResult.sourceDirs.map(dir => ({
        dir,
        files: this.scanResult.files
          .map(f => f.relativePath)
          .filter(p => p.startsWith(`${dir}/`) && !isTestPath(p))
          .slice(0, 8),
      })),
      firstRunExample,
    };
  }

  buildTroubleshootingContext(): TroubleshootingContext {
    const arch = this.client.getArchitecture();
    this.prepareIntentModules(arch.packages.map(p => p.name));

    // 运行态与常量数据补强：排障页最常缺的就是"实际命令、env、边界常量"
    const env = this.detector.detectEnvironment();
    const constants = this.detector.detectConstraints().constants;
    const entryFiles = this.scanResult.files
      .filter(f => !isTestPath(f.relativePath))
      .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
      .map(f => f.relativePath);

    // 意图证据：源码 why-marker（TODO/FIXME 是真实风险信号）+ git 高频变更热点
    const intent = this.intentProvider
      ? [...this.intentProvider.whyMarkers(8), ...this.intentProvider.churnEvidence(5)]
      : undefined;

    return {
      projectType: this.scanResult.projectType,
      techStack: this.scanResult.techStack,
      modules: arch.packages.map(p => ({ name: p.name })),
      scripts: env.scripts,
      packageManager: env.packageManager,
      nodeVersion: env.nodeVersion,
      envVars: env.envVars,
      constants,
      entryFiles,
      depUsage: this.buildDepUsage(),
      ...(intent && intent.length > 0 ? { intent } : {}),
    };
  }

  /**
   * 高出边符号（调用方）锚点清单：采样 CALLS 边后在客户端聚合出边数排序。
   * fan-in 热点是被调方（出边常为 0，立不出组）；调用方锚点才能铺开边表覆盖面。
   */
  private topCallerAnchors(): Array<{ name: string; file: string }> {
    const q = this.client.queryGraph(
      `MATCH (a)-[:CALLS]->(b) WHERE a.is_test = false AND b.is_test = false
       RETURN a.name AS name, a.file_path AS file, b.name AS callee LIMIT 300`,
    );
    const degree = new Map<string, { name: string; file: string; count: number }>();
    for (const row of q.rows) {
      const name = row[0] as string;
      const file = (row[1] as string) ?? '';
      if (!file || isTestPath(file)) continue;
      const key = `${name}@${file}`;
      const entry = degree.get(key) ?? { name, file, count: 0 };
      entry.count++;
      degree.set(key, entry);
    }
    return [...degree.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map(e => ({ name: e.name, file: e.file }));
  }

  /**
   * calls.md 数据源：调用边表（R2 边表优于时序图）。
   * 用 Cypher 查 (a:Method|Function)-[:CALLS]->(b)，按入口分组。
   * trace_path 不可靠（对 Method 返回空、无 file/line），改用 Cypher CALLS 边。
   * 消费端防线：入口过滤（非代码/构建脚本不立组）+ name@file 双键 BFS（防同名污染）
   * + isTrustedCallEdge（跨语言幽灵边与无词法佐证的边丢弃）。
   * 覆盖面兜底：入口组不足时以高扇入热点锚定补组（图谱 entry_points 漏采/跨语言
   * 入口被滤时不至于整页只剩零星入口）；Tauri 项目附加 IPC 命令对表（真实跨语言执行边）。
   */
  buildCallsContext(): CallsContext {
    const arch = this.client.getArchitecture();

    const groups: CallsContext['groups'] = [];

    const appEntries = arch.entry_points
      .filter(e => this.isAppEntryPoint(e.file))
      .slice(0, 8);

    for (const entry of appEntries) {
      const edges = this.collectCallEdges(entry.name, entry.file);
      if (edges.length > 0) {
        groups.push({ entry: entry.name, entryFile: entry.file, kind: 'entry', edges });
      }
    }

    // 扇入表：被调用最多的符号（从 hotspots 取），文件列查图谱取真实 file_path
    const hotspotSlice = arch.hotspots.slice(0, 15);
    const nameList = hotspotSlice.map(n => `"${n.name.replace(/"/g, '\\"')}"`).join(',');
    const fileQ = this.client.queryGraph(
      `MATCH (n) WHERE n.name IN [${nameList}] AND n.is_test = false
       RETURN n.name AS name, n.file_path AS file LIMIT 15`,
    );
    const fileBySymbol = new Map<string, string>();
    for (const row of fileQ.rows) {
      const file = (row[1] as string) ?? '';
      if (file && !isTestPath(file)) fileBySymbol.set(row[0] as string, file);
    }
    const fanIn: CallsContext['fanIn'] = hotspotSlice.map(h => ({
      symbol: h.name,
      file: fileBySymbol.get(h.name) ?? '',
      qualifiedName: h.qualified_name,
      inDegree: h.fan_in,
    }));

    // 锚点回填：入口组不足 CALLS_MIN_GROUPS 时补组。fan-in 热点多是被调方
    // （出边少，立组常空），先取高出边符号作锚点，热点兜底；锚点文件去重
    // （同一文件不重复立组，优先跨模块铺开覆盖面）
    if (groups.length < CALLS_MIN_GROUPS) {
      const covered = new Set<string>();
      const anchorFiles = new Set<string>();
      for (const g of groups) {
        anchorFiles.add(g.entryFile);
        for (const e of g.edges) {
          covered.add(e.caller);
          covered.add(e.callee);
        }
      }
      const candidates = [
        ...this.topCallerAnchors(),
        ...hotspotSlice.map(h => ({ name: h.name, file: fileBySymbol.get(h.name) ?? '' })),
      ];
      for (const cand of candidates) {
        if (groups.length >= CALLS_MIN_GROUPS) break;
        if (covered.has(cand.name)) continue;
        if (!cand.file || anchorFiles.has(cand.file)) continue;
        const edges = this.collectCallEdges(cand.name, cand.file);
        if (edges.length === 0) continue;
        anchorFiles.add(cand.file);
        for (const e of edges) {
          covered.add(e.caller);
          covered.add(e.callee);
        }
        groups.push({ entry: cand.name, entryFile: cand.file, kind: 'hotspot', edges });
      }
    }

    // Tauri IPC：前端 invoke → Rust 命令是真实执行边，但跨语言 CALLS 边被可信性过滤
    // 拦截，图谱不可见；用 tauri-ipc 正则对表补上（与 api 页同源）
    let ipc: CallsContext['ipc'];
    if (isTauriProject(this.scanResult.rootDir)) {
      ipc = scanIpcSurface(this.scanResult, this.sourceCache);
    }

    return { groups, fanIn, ...(ipc ? { ipc } : {}) };
  }

  /**
   * 单锚点（入口或热点）多层 CALLS 边采集。
   * 组内按 caller->callee 去重（同一被调链在多个入口下重复出现是常态，
   * 跨组全局去重会饿死后续入口组）；visited 按 name@file 双键去重——
   * 同名函数（如 Rust 的 new/run）在不同文件是不同符号，按名去重会截断覆盖。
   */
  private collectCallEdges(
    anchorName: string,
    anchorFile: string,
  ): CallsContext['groups'][number]['edges'] {
    const edges: CallsContext['groups'][number]['edges'] = [];
    const seen = new Set<string>();
    let frontier = new Set<string>([`${anchorName}@${anchorFile}`]);
    const visited = new Set<string>([`${anchorName}@${anchorFile}`]);

    for (let depth = 0; depth < 3 && frontier.size > 0; depth++) {
      const callerList = [...frontier].map(k => `"${k.split('@')[0].replace(/"/g, '\\"')}"`).join(',');
      // 必须给源节点指定 label（裸 MATCH 会返回 0 行）；分两次查 Method 和 Function
      const qM = this.client.queryGraph(
        `MATCH (a:Method)-[:CALLS]->(b) WHERE a.name IN [${callerList}] AND a.is_test = false AND b.is_test = false
         RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT ${CALLS_EDGE_LIMIT}`,
      );
      const qF = this.client.queryGraph(
        `MATCH (a:Function)-[:CALLS]->(b) WHERE a.name IN [${callerList}] AND a.is_test = false AND b.is_test = false
         RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT ${CALLS_EDGE_LIMIT}`,
      );

      const nextFrontier = new Set<string>();
      for (const row of [...qM.rows, ...qF.rows]) {
        const callerName = row[0] as string;
        const callerFile = (row[1] as string) ?? '';
        const calleeName = row[2] as string;
        const calleeFile = (row[3] as string) ?? '';
        const calleeLine = (row[4] as number) ?? 0;
        const calleeParent = (row[5] as string | null) ?? null;

        if (callerName === calleeName && callerFile === calleeFile) continue;
        if (isTestPath(calleeFile)) continue;
        if (!frontier.has(`${callerName}@${callerFile}`)) continue;
        if (!this.isTrustedCallEdge(callerFile, calleeFile, calleeName)) continue;

        const edgeKey = `${callerName}->${calleeName}`;
        if (seen.has(edgeKey)) continue;
        seen.add(edgeKey);

        edges.push({ caller: callerName, callee: calleeName, calleeParent, calleeFile, calleeLine });

        const calleeKey = `${calleeName}@${calleeFile}`;
        if (!visited.has(calleeKey)) {
          visited.add(calleeKey);
          nextFrontier.add(calleeKey);
        }
      }
      frontier = nextFrontier;
    }

    return edges;
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
      if (isTestPath((row[2] as string) ?? '')) continue;
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
   * 主题页数据源：主题文件集的符号 + 文件间 CALLS 边 + 相关跨包边界。
   * 文件清单来自 topics.json（确定性锁定），查询复用现有 Cypher 模式。
   */
  buildTopicContext(topicId: string): TopicContext | null {
    const def = this.topics.find(t => t.id === topicId);
    if (!def) return null;

    const { symbols, edges, boundaries } = this.fileEvidence(def.files);
    return {
      id: def.id,
      title: def.title,
      files: def.files,
      symbols,
      edges,
      boundaries,
      ...(this.intentProvider ? { intent: this.intentProvider.intentForFiles(def.files) } : {}),
    };
  }

  /**
   * 章节页数据源：与主题页同一套图谱查询（符号/边/边界），
   * 叠加 outline.json 锁定的章信息与写作简报（brief 驱动生成）。
   */
  buildChapterPageContext(page: string): ChapterPageContext | null {
    const ref = parseChapterPage(page);
    if (!ref) return null;
    const chapter = this.outlineChapters.find(c => c.id === ref.chapter);
    if (!chapter) return null;
    const pg = chapter.pages.find(p => p.id === ref.page);
    if (!pg) return null;

    const { symbols, edges, boundaries } = this.fileEvidence(pg.files);
    return {
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      pageId: pg.id,
      title: pg.title,
      brief: pg.brief,
      files: pg.files,
      symbols, edges, boundaries,
      ...(this.intentProvider ? { intent: this.intentProvider.intentForFiles(pg.files) } : {}),
    };
  }

  /** 文件集的图谱证据：符号 + 文件间 CALLS 边 + 相关跨包边界（主题页/章节页共用） */
  private fileEvidence(files: string[]): Pick<TopicContext, 'symbols' | 'edges' | 'boundaries'> {
    const fileList = files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(',');
    const symQ = this.client.queryGraph(
      `MATCH (n) WHERE n.file_path IN [${fileList}] AND n.is_test = false
         AND (n.docstring IS NOT NULL OR n.complexity > 5) AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.label AS label, n.file_path AS file, n.start_line AS line,
              n.docstring AS doc, n.signature AS sig, n.complexity AS cx
       ORDER BY n.complexity DESC LIMIT 25`,
    );
    const symbols = symQ.rows
      .filter(row => !isTestPath((row[2] as string) ?? ''))
      .map(row => ({
        name: row[0] as string,
        type: this.labelToSymbolType(row[1] as string),
        file: row[2] as string,
        startLine: row[3] as number | undefined,
        docstring: (row[4] as string | null) ?? null,
        signature: (row[5] as string | null) ?? null,
        complexity: row[6] as number | undefined,
      }));

    const edgeQ = this.client.queryGraph(
      `MATCH (a)-[:CALLS]->(b)
       WHERE a.file_path IN [${fileList}] AND b.file_path IN [${fileList}]
         AND a.is_test = false AND b.is_test = false
       RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line
       LIMIT 30`,
    );
    const edges = edgeQ.rows
      .filter(row => {
        const callerFile = (row[1] as string) ?? '';
        const calleeFile = (row[3] as string) ?? '';
        if (isTestPath(calleeFile)) return false;
        return this.isTrustedCallEdge(callerFile, calleeFile, row[2] as string);
      })
      .map(row => ({
        caller: row[0] as string,
        callee: row[2] as string,
        file: row[3] as string,
        line: (row[4] as number) ?? 0,
      }));

    // 文件涉及的跨包边界（文件所属 package 与边界端点匹配，路径段精确归属）
    const arch = this.client.getArchitecture();
    const pkgNames = arch.packages.map(p => p.name);
    const pkgs = new Set<string>();
    for (const file of files) {
      const pkg = matchPackageForFile(file, pkgNames);
      if (pkg) pkgs.add(pkg);
    }
    const boundaries = arch.boundaries
      .filter(b => pkgs.has(b.from) || pkgs.has(b.to))
      .slice(0, 5)
      .map(b => ({ from: b.from, to: b.to, callCount: b.call_count }));

    return { symbols, edges, boundaries };
  }

  /**
   * README.md 数据源：文档索引（来自 PAGE_REGISTRY）+ 项目元数据（package.json）。
   * README 是 wiki 总入口，索引表必须覆盖全部文档。
   */
  buildReadmeContext(plannedPages?: string[]): ReadmeContext {
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

    const planned = plannedPages ?? PAGE_REGISTRY.map(p => p.name);
    const docIndex = PAGE_REGISTRY
      .filter(p => planned.includes(p.name) && p.name !== 'readme')
      .map(p => ({
        file: pageRelPath(p.name),
        dir: p.dir,
        tier: p.tier,
        answer: p.answer,
      }));

    // 主题页动态纳入索引（08-topics 组）
    for (const name of planned) {
      if (!isTopicPage(name)) continue;
      docIndex.push({ file: pageRelPath(name), dir: TOPIC_DIR, tier: 'structure', answer: TOPIC_ANSWER });
    }

    // 章节页动态纳入索引（09-chapters/<章> 组，answer 用页标题）
    for (const name of planned) {
      const ref = parseChapterPage(name);
      if (!ref) continue;
      const chapter = this.outlineChapters.find(c => c.id === ref.chapter);
      const pg = chapter?.pages.find(p => p.id === ref.page);
      docIndex.push({
        file: pageRelPath(name),
        dir: `${CHAPTER_DIR}/${ref.chapter}`,
        tier: 'structure',
        answer: pg?.title ?? CHAPTER_ANSWER,
      });
    }

    // 仓库既有文档（根 README/AGENTS.md + docs/**.md）：标题取首个 # 行
    const relatedDocs: Array<{ path: string; title: string }> = [];
    for (const rel of ['README.md', 'AGENTS.md']) {
      if (this.scanResult.files.some(f => f.relativePath === rel)) {
        relatedDocs.push({ path: rel, title: this.docTitleOf(rel) ?? rel });
      }
    }
    for (const rel of this.scanResult.files
      .map(f => f.relativePath)
      .filter(p => p.startsWith('docs/') && p.endsWith('.md') && !isTestPath(p))
      .slice(0, 15 - relatedDocs.length)) {
      relatedDocs.push({ path: rel, title: this.docTitleOf(rel) ?? rel });
    }

    return {
      projectName, version, license, description, runtime, docIndex,
      relatedDocs,
    };
  }

  /** 读 markdown 文件首个 # 标题（前 50 行内；失败返回 null） */
  private docTitleOf(relPath: string): string | null {
    try {
      const content = readFileSync(join(this.scanResult.rootDir, relPath), 'utf-8');
      for (const line of content.split('\n').slice(0, 50)) {
        const m = line.match(/^#\s+(.{1,80})/);
        if (m) return m[1].trim();
      }
      return null;
    } catch {
      return null;
    }
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

    // 常量注释证据：每个限制「防什么失控场景」的直接叙述源（源码同行/上邻注释）
    const constFiles = [...new Set(constants.map(c => c.filePath))].slice(0, 12);
    const intent = this.intentProvider ? this.intentProvider.constComments(constFiles) : undefined;

    return {
      constants,
      hotFunctions,
      ...(intent && intent.length > 0 ? { intent } : {}),
    };
  }

  /**
   * decisions.md 数据源：设计决策与演进（git 提交 + 文档小节证据锚定）。
   * 只承载真实证据，无任何证据时返回 null（WikiService 剔除页面并给出原因），
   * 规避旧版「自动推导条目伪装成决策记录」的失败模式。
   */
  buildDecisionsContext(): DecisionsContext | null {
    if (!this.intentProvider) return null;
    const arch = this.client.getArchitecture();
    const pkgNames = arch.packages.map(p => p.name);
    this.prepareIntentModules(pkgNames);

    const gitTimeline = this.intentProvider.gitTimeline();
    const docDecisions = this.intentProvider.docEvidence();
    const hotFileChurn = this.intentProvider.hotFileChurn(10);
    if (gitTimeline.length === 0 && docDecisions.length === 0 && hotFileChurn.length === 0) {
      return null;
    }
    const depCommits = this.intentProvider.depCommitEvidence([...this.getDepNames()].slice(0, 20));

    return {
      gitTimeline,
      docDecisions,
      hotFileChurn,
      ...(depCommits.length > 0 ? { depCommits } : {}),
    };
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
      .filter(e => this.isAppEntryPoint(e.file))
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

  /** 命令入口的真实描述：docstring 优先，缺失时从 commander 源码 .command('name', 'desc') 提取 */
  private commandDescription(entryName: string): { description: string; startLine: number } {
    const snippet = this.safeGetSnippet(entryName);
    const fromDoc = snippet?.docstring ?? '';
    const fromCommand = snippet ? this.parseCommanderDescription(snippet.source ?? '') : '';
    return {
      description: fromDoc || fromCommand,
      startLine: snippet?.start_line ?? 0,
    };
  }

  /** 从 commander 源码提取命令描述：`.command('name', 'desc')` 双参式 → 链式 `.description('desc')` */
  private parseCommanderDescription(source: string): string {
    const pair = source.match(/\.command\(\s*['"`][^'"`]+['"`]\s*,\s*['"`]([^'"`]+)['"`]/);
    if (pair) return pair[1];
    const chained = source.match(/\.description\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    return chained ? chained[1] : '';
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
   * tech-stack.md 数据源：严格区分已用/未用依赖（R3 拒绝编造用途）。
   * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。
   * 复用 scanner 的死依赖过滤逻辑，并追踪每个依赖的 import 位置。
   */
  buildTechStackContext(): TechStackContext {
    const pkgPath = join(this.scanResult.rootDir, 'package.json');
    let pkg: any = {};
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch { /* ignore */ }

    const deps: Record<string, string> = pkg.dependencies ?? {};
    const devDeps: Record<string, string> = pkg.devDependencies ?? {};
    const allDeclared = new Set([...Object.keys(deps), ...Object.keys(devDeps)]);
    const usedDeps = new Set(this.scanResult.techStack); // scanner 已过滤死依赖

    // 收集每个已用依赖的 import 文件
    const importMap = this.collectImportFiles(allDeclared);

    const coreDeps = Object.entries(deps)
      .filter(([name]) => usedDeps.has(name))
      .map(([name, version]) => ({ name, version, importFiles: importMap.get(name) ?? [] }));

    const devDepsUsed = Object.entries(devDeps)
      .filter(([name]) => usedDeps.has(name))
      .map(([name, version]) => ({ name, version, importFiles: importMap.get(name) ?? [] }));

    const unusedDeps = [...allDeclared]
      .filter(name => !usedDeps.has(name))
      .map(name => ({ name, version: deps[name] ?? devDeps[name] ?? '' }));

    // 依赖引入动机：提交主题中点名依赖的记录（选型理由的 git 佐证）
    const depNames = [...new Set([...coreDeps, ...devDepsUsed].map(d => d.name))];
    const intent = this.intentProvider?.depCommitEvidence(depNames);

    return {
      coreDeps,
      devDeps: devDepsUsed,
      unusedDeps,
      runtime: pkg.type === 'module' ? 'ESM' : 'CJS',
      buildTool: this.detectBuildTool(devDeps),
      packageManager: this.detector.detectEnvironment().packageManager,
      ...(intent && intent.length > 0 ? { intent } : {}),
    };
  }

  /** 扫描源码 import，返回 依赖名 → import 它的文件列表。
   *  scope：'prod' 仅生产代码（默认）；'test' 仅测试文件（测试型工具的使用证据）。
   *  覆盖 .vue SFC 的 <script> import、动态 import() 与 .css 的 @import（与 FileScanner 同口径） */
  private collectImportFiles(declaredDeps: Set<string>, scope: 'prod' | 'test' = 'prod'): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const importRegex = /(?:import\s+(?:[^\n'";]*?\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
    const cssImportRegex = /@import\s+(?:url\(\s*)?['"]([^'"./][^'"]*)['"]/g;
    for (const file of this.scanResult.files) {
      if (!file.extension.match(/^\.(ts|tsx|js|jsx|mjs|cjs|vue|css)$/)) continue;
      if (scope === 'prod' ? isTestPath(file.relativePath) : !isTestPath(file.relativePath)) continue;
      try {
        const source = readFileSync(file.absolutePath, 'utf-8');
        const regex = file.extension === '.css' ? cssImportRegex : importRegex;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(source)) !== null) {
          const pkgName = importedPackageName(match[1]);
          if (pkgName && declaredDeps.has(pkgName)) {
            if (!map.has(pkgName)) map.set(pkgName, []);
            const files = map.get(pkgName)!;
            if (!files.includes(file.relativePath)) files.push(file.relativePath);
          }
        }
      } catch { /* skip */ }
    }
    return map;
  }

  private detectBuildTool(devDeps: Record<string, string>): string {
    if (devDeps.tsup) return 'tsup';
    if (devDeps.vite) return 'vite';
    if (devDeps.webpack) return 'webpack';
    if (devDeps.rollup) return 'rollup';
    if (devDeps.esbuild) return 'esbuild';
    return 'unknown';
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

  /** 文件清单的语言域分布（模块多语言时供 LLM 分别说明职责域） */
  private languagesForFiles(files: string[]): Array<{ language: string; fileCount: number }> {
    const counts = new Map<string, number>();
    for (const f of files) {
      const domain = languageDomainOf(f) ?? 'other';
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([language, fileCount]) => ({ language, fileCount }));
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
