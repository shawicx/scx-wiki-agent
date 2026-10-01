import type { ArchitectureData } from '../../mcp/types.js';
import type { RelationType } from '../../core/types.js';
import { isTestPath, matchPackageForFile, isMcpPlaceholder } from '../../shared/utils.js';
import type { ArchitectureContext, ModuleSummary } from '../types.js';
import {
  type ContextDeps,
  type ProductionModules,
  languagesForFiles,
  labelToSymbolType,
  prepareIntentModules,
} from './shared.js';

/** 每个生产包的图谱符号候选上限（分包查询，避免全局 Top N 挤占小模块） */
export const MODULE_SYMBOL_CANDIDATE_LIMIT = 60;
/** Architecture 页每模块代表符号上限 */
const ARCHITECTURE_SYMBOL_LIMIT = 6;
/** Modules 页每模块代表符号 / 代表文件上限 */
export const MODULES_SYMBOL_LIMIT = 10;
/** Modules 页单个文件最多贡献的符号数（防单文件垄断） */
const MODULES_SYMBOLS_PER_FILE_LIMIT = 5;
const MODULES_REPRESENTATIVE_FILE_LIMIT = 12;

/**
 * 生产包索引：graph package 必须能映射到至少一个非测试扫描文件。
 * tests/fixtures/helpers 等无生产文件支撑的图谱包不进入 Architecture / Modules 主叙事。
 */
export function productionModules(deps: ContextDeps): ProductionModules {
  if (deps.productionModulesCache !== null) return deps.productionModulesCache;

  const arch = getArchitectureSnapshot(deps);
  const pkgNames = arch.packages.map(p => p.name);
  const filesByPackage = new Map<string, string[]>();
  for (const file of deps.scanResult.productionFiles) {
    const pkg = matchPackageForFile(file.relativePath, pkgNames);
    if (!pkg) continue;
    const files = filesByPackage.get(pkg) ?? [];
    files.push(file.relativePath);
    filesByPackage.set(pkg, files);
  }

  deps.productionModulesCache = arch.packages
    .map((pkg, index) => ({ pkg, files: filesByPackage.get(pkg.name) ?? [], index }))
    .filter(({ pkg, files }) => pkg.name.length > 0 && files.length > 0);
  return deps.productionModulesCache;
}

/** 分包查询 + 文件级 round-robin 公平采样，避免单个高复杂度文件垄断模块代表符号 */
export function moduleEvidence(deps: ContextDeps, pkgName: string, files: string[], hotspotNames: ReadonlySet<string>): ModuleSummary['symbols'] {
  if (deps.moduleEvidenceCache.has(pkgName)) {
    return deps.moduleEvidenceCache.get(pkgName)!;
  }
  const fileList = files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(',');
  const q = deps.client.queryGraph(
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
    // MCP 会把「No top-level symbols detected」等占位串当符号名写入图谱，消费侧丢弃
    if (!name || isMcpPlaceholder(name)) continue;
    const startLine = Number(row[6] ?? 0) || undefined;
    const identity = `${name}@${file}:${startLine ?? 0}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const symbols = byFile.get(file) ?? [];
    symbols.push({
      name,
      type: labelToSymbolType(row[1] as string),
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

  deps.moduleEvidenceCache.set(pkgName, ordered);
  return ordered;
}

/** Architecture / Modules 共用同一架构快照，避免分包索引与页面边界数据来自不同响应 */
export function getArchitectureSnapshot(deps: ContextDeps): ArchitectureData {
  if (deps.architectureSnapshotCache === null) {
    deps.architectureSnapshotCache = deps.client.getArchitecture();
  }
  return deps.architectureSnapshotCache;
}

export function representativeFiles(files: string[], symbols: ModuleSummary['symbols']): string[] {
  const symbolFiles = [...new Set(symbols.map(s => s.file).filter((f): f is string => !!f))];
  const remaining = files.filter(f => !symbolFiles.includes(f));
  return [...symbolFiles, ...remaining].slice(0, MODULES_REPRESENTATIVE_FILE_LIMIT);
}

export function buildFileSymbols(files: string[], symbols: ModuleSummary['symbols']): ModuleSummary['fileSymbols'] {
  const byFile = new Map<string, ModuleSummary['symbols']>();
  for (const symbol of symbols) {
    if (!symbol.file) continue;
    const group = byFile.get(symbol.file) ?? [];
    group.push(symbol);
    byFile.set(symbol.file, group);
  }
  return files.map(file => ({ file, symbols: (byFile.get(file) ?? []).slice(0, 5) }));
}

export function buildArchitectureContext(deps: ContextDeps): ArchitectureContext {
  const arch = getArchitectureSnapshot(deps);
  const production = productionModules(deps);
  const productionNames = production.map(m => m.pkg.name);
  const hotspotNames = new Set(arch.hotspots.map(h => h.name));
  prepareIntentModules(deps, productionNames);

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
    const symbols = moduleEvidence(deps, pkg.name, files, hotspotNames).slice(0, ARCHITECTURE_SYMBOL_LIMIT);
    return {
      name: pkg.name,
      fileCount: files.length,
      files: representativeFiles(files, symbols),
      symbols,
      fileSymbols: [],
      outgoingRelations: outgoing.get(pkg.name) ?? [],
      incomingRelations: incoming.get(pkg.name) ?? [],
      codeSnippets: [],
      languages: languagesForFiles(files),
      fanIn: pkg.fan_in,
      fanOut: pkg.fan_out,
      ...(deps.intentProvider?.moduleIntent(pkg.name)
        ? { intent: deps.intentProvider.moduleIntent(pkg.name) }
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
    layers: filterLayers(deps, arch.layers, productionNames),
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
function filterLayers(deps: ContextDeps, layers: ArchitectureData['layers'], pkgNames: string[]): ArchitectureData['layers'] {
  const known = new Set(pkgNames);
  const hasHttpFramework = deps.scanResult.projectType === 'backend'
    || deps.scanResult.techStack.some(t => /express|fastify|nest|koa|hono|apollo|restify/i.test(t));
  return layers.filter(l => {
    if (!l.name || !known.has(l.name)) return false;
    if (!hasHttpFramework && /HTTP route/i.test(l.reason)) return false;
    return true;
  });
}
