import { readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import type { CodebaseMemoryClient } from '../../mcp/codebase-memory-client.js';
import type { ArchitectureData, SnippetData } from '../../mcp/types.js';
import type { ScanResult } from '../../core/scanner.js';
import type { SymbolType } from '../../core/types.js';
import { isTestPath, languageDomainOf, importedPackageName } from '../../shared/utils.js';
import { ConfigDetector } from '../config-detector.js';
import { collectEvidenceFiles, toKnownRelativePath, EVIDENCE_MIN_FILES } from '../wiki-evidence.js';
import { findSymbolDefinitions } from '../source-fallback.js';
import { IntentEvidenceProvider } from '../intent-evidence.js';
import type { TopicDefinition } from '../topic-discovery.js';
import type { OutlineChapter } from '../outline.js';
import type { ModuleSummary, SupplementalSymbol, DepUsage } from '../types.js';

const ENTRY_FILE_NAMES = ['index.ts', 'index.js', 'main.ts', 'main.js', 'cli.ts', 'cli.js'];

/** 走 LLM 路径且证据可能偏薄的 structure 页，触发 hotspot 补强 */
const EVIDENCE_ENRICH_PAGES = [
  'overview', 'architecture', 'data-flow', 'modules', 'api', 'glossary',
];

/** WikiContextBuilder 拆分后的共享状态对象：client/scanResult/detector 与各缓存字段 */
export interface ContextDeps {
  client: CodebaseMemoryClient;
  scanResult: ScanResult;
  detector: ConfigDetector;
  /** 扫描文件清单缓存 */
  knownFiles: Set<string> | null;
  /** 生产扫描文件清单（主叙事页过滤图谱 is_test 失准节点的消费侧防线） */
  productionKnownFiles: Set<string> | null;
  /** 主题页定义（由 WikiService 从 topics.json 装配注入） */
  topics: TopicDefinition[];
  /** 章节树净页（由 WikiService 从 outline.json 校验后注入） */
  outlineChapters: OutlineChapter[];
  /** 声明依赖名全集（package.json + techStack；断言校验 universe 回填用，构建内缓存） */
  depNames: Set<string> | null;
  /** 意图证据提供器（「为什么」证据源；由 WikiService 注入，缺省时各页 intent 字段省略） */
  intentProvider: IntentEvidenceProvider | null;
  intentModulesReady: boolean;
  /** 生产包索引与分包符号证据缓存（同一构建内 Architecture / Modules 复用） */
  architectureSnapshotCache: ArchitectureData | null;
  productionModulesCache: ProductionModules | null;
  moduleEvidenceCache: Map<string, ModuleSummary['symbols']>;
  /** caller 源码缓存（词法核验用；不可读文件缓存为 null） */
  sourceCache: Map<string, string | null>;
  /** 源码回落找到的符号名全集（供 WikiService 回填断言校验 universe，防自证矛盾） */
  fallbackSymbolNames: Set<string>;
  /** 声明依赖名全集（dependencies + devDependencies；非 Node 项目为空集，构建内缓存） */
  declaredDepsCache: Set<string> | null;
}

export type ProductionModules = Array<{ pkg: ArchitectureData['packages'][number]; files: string[]; index: number }>;

export function createDeps(
  client: CodebaseMemoryClient,
  scanResult: ScanResult,
  detector: ConfigDetector,
): ContextDeps {
  return {
    client,
    scanResult,
    detector,
    knownFiles: null,
    productionKnownFiles: null,
    topics: [],
    outlineChapters: [],
    depNames: null,
    intentProvider: null,
    intentModulesReady: false,
    architectureSnapshotCache: null,
    productionModulesCache: null,
    moduleEvidenceCache: new Map(),
    sourceCache: new Map(),
    fallbackSymbolNames: new Set(),
    declaredDepsCache: null,
  };
}

export function getKnownFiles(deps: ContextDeps): Set<string> {
  if (!deps.knownFiles) {
    deps.knownFiles = new Set(deps.scanResult.files.map(f => f.relativePath));
  }
  return deps.knownFiles;
}

export function getProductionKnownFiles(deps: ContextDeps): Set<string> {
  if (!deps.productionKnownFiles) {
    deps.productionKnownFiles = new Set(deps.scanResult.productionFiles.map(f => f.relativePath));
  }
  return deps.productionKnownFiles;
}

/** 生产图谱节点判定：正常构建要求命中扫描清单；无扫描清单的窄单测退回 isTestPath */
export function isProductionGraphFile(deps: ContextDeps, file: string): boolean {
  const production = getProductionKnownFiles(deps);
  return production.size > 0
    ? toKnownRelativePath(file, production, deps.scanResult.rootDir) !== null
    : !isTestPath(file);
}

/** 模块级意图证据预聚合（构建内幂等）：候选文件按体积降序作重要性代理，
 *  提供方内部截 GIT_FILE_CAP 控住子进程成本 */
export function prepareIntentModules(deps: ContextDeps, pkgNames: string[]): void {
  if (!deps.intentProvider || deps.intentModulesReady) return;
  deps.intentModulesReady = true;
  const candidates = [...deps.scanResult.productionFiles]
    .sort((a, b) => b.size - a.size)
    .map(f => f.relativePath);
  deps.intentProvider.prepareModules(pkgNames, candidates);
}

/** 源文件文本缓存（I/O 扫描/类型定义摘录；不可读缓存为 null 不再重试） */
export function readSourceCached(deps: ContextDeps, file: string): string | null {
  const cached = deps.sourceCache.get(file);
  if (cached !== undefined) return cached;
  let src: string | null;
  try {
    src = readFileSync(isAbsolute(file) ? file : join(deps.scanResult.rootDir, file), 'utf-8');
  } catch {
    src = null;
  }
  deps.sourceCache.set(file, src);
  return src;
}

/** entry_points 消费端过滤：排除非代码文件与构建脚本（build.rs/deps.rs 是构建期代码，不是应用入口） */
export function isAppEntryPoint(deps: ContextDeps, file: string): boolean {
  if (!isProductionGraphFile(deps, file)) return false;
  if (languageDomainOf(file) === null) return false;
  if (/(^|\/)(build|deps)\.rs$/.test(file)) return false;
  return true;
}

/** 声明依赖名全集（dependencies + devDependencies；非 Node 项目为空集，构建内缓存） */
export function declaredPackageDeps(deps: ContextDeps): Set<string> {
  if (deps.declaredDepsCache === null) {
    const names = new Set<string>();
    try {
      const pkg = JSON.parse(readFileSync(join(deps.scanResult.rootDir, 'package.json'), 'utf-8'));
      for (const n of Object.keys(pkg.dependencies ?? {})) names.add(n);
      for (const n of Object.keys(pkg.devDependencies ?? {})) names.add(n);
    } catch {
      // 无 package.json 的项目诚实返回空集
    }
    deps.declaredDepsCache = names;
  }
  return deps.declaredDepsCache;
}

/** 依赖名全集（声明名 + techStack 探测名）：断言校验 universe 回填用。
 *  正文反引号里的依赖名有 package.json/import 双重实据，不该被标「待确认」 */
export function getDepNames(deps: ContextDeps): Set<string> {
  if (deps.depNames === null) {
    deps.depNames = new Set([...declaredPackageDeps(deps), ...deps.scanResult.techStack]);
  }
  return deps.depNames;
}

/** 读仓库根下文本文件的前 N 字符（段落边界截断；不可读返回 undefined） */
export function readRepoFileExcerpt(deps: ContextDeps, relPath: string, maxLen: number): string | undefined {
  try {
    const content = readFileSync(join(deps.scanResult.rootDir, relPath), 'utf-8');
    if (content.length <= maxLen) return content;
    const cut = content.slice(0, maxLen);
    const lastBreak = Math.max(cut.lastIndexOf('\n\n'), cut.lastIndexOf('\n#'));
    return (lastBreak > maxLen * 0.5 ? cut.slice(0, lastBreak) : cut).trimEnd() + '\n\n（已截断）';
  } catch {
    return undefined;
  }
}

/** package.json 的 name/description（读取失败返回空串，诚实降级） */
export function readPackageMeta(deps: ContextDeps): { name: string; description: string } {
  try {
    const pkg = JSON.parse(readFileSync(join(deps.scanResult.rootDir, 'package.json'), 'utf-8'));
    return { name: pkg.name ?? '', description: pkg.description ?? '' };
  } catch {
    return { name: '', description: '' };
  }
}

/**
 * 技术栈依赖的使用证据（overview/onboarding/troubleshooting 等元数据页用）。
 * 依赖名本身有 package.json 声明实据；用途证据分三级：生产 import 点 /
 * 测试文件 import 点 / scripts 命令引用（如 vitest 仅由 `vitest run` 触发）。
 * usageKind ≠ none 的依赖严禁被写成「声明未用」——防止把测试/脚本型工具
 * 误标成死依赖（R5 噪音大头）。
 */
export function buildDepUsage(deps: ContextDeps): Array<DepUsage> {
  const declared = declaredPackageDeps(deps);
  const prodImports = collectImportFiles(deps, declared, 'prod');
  const testImports = collectImportFiles(deps, declared, 'test');
  let scripts: Record<string, string> = {};
  try {
    scripts = deps.detector?.detectEnvironment().scripts ?? {};
  } catch {
    scripts = {};
  }
  return [...declared].map(name => {
    const prod = prodImports.get(name) ?? [];
    if (prod.length > 0) {
      return { name, importFiles: prod.slice(0, 5), importCount: prod.length, usageKind: 'import' as const };
    }
    const test = testImports.get(name) ?? [];
    if (test.length > 0) {
      return { name, importFiles: test.slice(0, 5), importCount: test.length, usageKind: 'test' as const };
    }
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scriptHit = Object.values(scripts).some(cmd =>
      new RegExp(`\\b${escapedName}\\b`).test(cmd));
    if (scriptHit) {
      return { name, importFiles: [], importCount: 0, usageKind: 'script' as const };
    }
    return { name, importFiles: [], importCount: 0, usageKind: 'none' as const };
  });
}

/** 扫描源码 import，返回 依赖名 → import 它的文件列表。
 *  scope：'prod' 仅生产代码（默认）；'test' 仅测试文件（测试型工具的使用证据）。
 *  覆盖 .vue SFC 的 <script> import、动态 import() 与 .css 的 @import（与 FileScanner 同口径） */
export function collectImportFiles(deps: ContextDeps, declaredDeps: Set<string>, scope: 'prod' | 'test' = 'prod'): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const importRegex = /(?:import\s+(?:[^\n'";]*?\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  const cssImportRegex = /@import\s+(?:url\(\s*)?['"]([^'"./][^'"]*)['"]/g;
  for (const file of deps.scanResult.files) {
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

/**
 * 证据补强（DeepWiki「二次扩展检索」的图谱版）：
 * LLM 路径的 structure 页证据文件低于下限时，从图谱补一批高复杂度真实符号，
 * 只保留扫描清单内的文件路径。图谱查无的热点/入口名回落源码正则探测
 * （mcp 对 .vue/部分 Rust 索引不全，避免 LLM 把真实符号标成「待确认」）。
 */
export function enrichIfThinEvidence(deps: ContextDeps, page: string, ctx: unknown): unknown {
  if (!EVIDENCE_ENRICH_PAGES.includes(page)) return ctx;
  const known = getKnownFiles(deps);
  if (collectEvidenceFiles(ctx, known, deps.scanResult.rootDir).length >= EVIDENCE_MIN_FILES) {
    return ctx;
  }
  const q = deps.client.queryGraph(
    `MATCH (n) WHERE n.is_test = false AND n.file_path IS NOT NULL
         AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.label AS label, n.file_path AS file,
              n.complexity AS cx, n.signature AS sig, n.docstring AS doc
       ORDER BY n.complexity DESC LIMIT 8`,
  );
  const supplementalSymbols: SupplementalSymbol[] = q.rows
    .map(row => ({
      name: row[0] as string,
      type: labelToSymbolType(row[1] as string),
      file: row[2] as string,
      complexity: row[3] as number | undefined,
      signature: (row[4] as string | null) ?? null,
      docstring: (row[5] as string | null) ?? null,
    }))
    .map(s => ({ ...s, file: toKnownRelativePath(s.file, known, deps.scanResult.rootDir) ?? '' }))
    .filter(s => isProductionGraphFile(deps, s.file));
  for (const s of appendSourceFallback(deps, supplementalSymbols)) {
    supplementalSymbols.push(s);
  }
  if (supplementalSymbols.length === 0) return ctx;
  return { ...(ctx as Record<string, unknown>), supplementalSymbols };
}

/**
 * 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。
 * 找到的名字记入 fallbackSymbolNames（供断言校验 universe 回填）。
 */
function appendSourceFallback(deps: ContextDeps, existing: Array<{ name: string }>): SupplementalSymbol[] {
  const existingNames = new Set(existing.map(s => s.name));
  const arch = deps.client.getArchitecture();
  const wanted = [
    ...arch.hotspots.slice(0, 10).map(h => h.name),
    ...arch.entry_points.slice(0, 8).map(e => e.name),
  ].filter(n => !existingNames.has(n));
  if (wanted.length === 0) return [];
  const found = findSymbolDefinitions(wanted, deps.scanResult, deps.sourceCache)
    .filter(s => !existingNames.has(s.name));
  for (const s of found) deps.fallbackSymbolNames.add(s.name);
  return found;
}

/**
 * 容错地获取代码片段。getCodeSnippet 失败或无结果时返回 null，不抛错。
 */
export function safeGetSnippet(deps: ContextDeps, qualifiedName: string): SnippetData | null {
  if (!qualifiedName) return null;
  try {
    const s = deps.client.getCodeSnippet(qualifiedName);
    return s && s.source ? s : null;
  } catch {
    return null;
  }
}

/** 文件清单的语言域分布（模块多语言时供 LLM 分别说明职责域） */
export function languagesForFiles(files: string[]): Array<{ language: string; fileCount: number }> {
  const counts = new Map<string, number>();
  for (const f of files) {
    const domain = languageDomainOf(f) ?? 'other';
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([language, fileCount]) => ({ language, fileCount }));
}

/** MCP 节点标签 → SymbolType */
export function labelToSymbolType(label: string): SymbolType {
  switch (label) {
    case 'Class': return 'class';
    case 'Method': return 'method';
    case 'Function': return 'function';
    case 'Interface': return 'interface';
    case 'Variable': return 'variable';
    default: return 'function';
  }
}

export { ENTRY_FILE_NAMES };
