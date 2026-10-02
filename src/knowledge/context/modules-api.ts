import type { RelationType } from '../../core/types.js';
import { isTestPath } from '../../shared/utils.js';
import { isTauriProject, scanIpcSurface } from '../tauri-ipc.js';
import { mergeGraphSignature } from '../signature.js';
import type { ModulesContext, ApiContext, ModuleSummary } from '../types.js';
import {
  getArchitectureSnapshot,
  moduleEvidence,
  productionModules,
  representativeFiles,
  buildFileSymbols,
  MODULES_SYMBOL_LIMIT,
} from './architecture.js';
import { commandDescription } from './cli.js';
import {
  type ContextDeps,
  isAppEntryPoint,
  isProductionGraphFile,
  languagesForFiles,
  prepareIntentModules,
  safeGetSnippet,
} from './shared.js';

/** modules 页详述上限：超过后其余模块聚合为概要（DeepWiki 目录分组分块的防超限映射） */
const MODULE_DETAIL_LIMIT = 12;

export function buildModulesContext(deps: ContextDeps): ModulesContext {
  const arch = getArchitectureSnapshot(deps);
  const production = productionModules(deps);
  const productionNames = production.map(m => m.pkg.name);
  const hotspotNames = new Set(arch.hotspots.map(h => h.name));
  prepareIntentModules(deps, productionNames);

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
    const symbols = moduleEvidence(deps, pkg.name, files, hotspotNames).slice(0, MODULES_SYMBOL_LIMIT);
    const representativeFilesList = representativeFiles(files, symbols);
    return {
      name: pkg.name,
      fileCount: files.length,
      files: representativeFilesList,
      symbols,
      fileSymbols: buildFileSymbols(representativeFilesList, symbols),
      outgoingRelations: outOf.get(pkg.name) ?? [],
      incomingRelations: inOf.get(pkg.name) ?? [],
      codeSnippets: [],
      languages: languagesForFiles(files),
      fanIn: pkg.fan_in,
      fanOut: pkg.fan_out,
      ...(deps.intentProvider?.moduleIntent(pkg.name)
        ? { intent: deps.intentProvider.moduleIntent(pkg.name) }
        : {}),
    };
  });

  // 大仓库防超限：按扇入/扇出/节点数/生产文件数综合重要性取前 N 详述，其余聚合为概要
  if (modules.length <= MODULE_DETAIL_LIMIT) {
    return { modules, ...moduleIntentPageExtra(deps) };
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
  return { modules: detailed, otherModules, ...moduleIntentPageExtra(deps) };
}

/** modules 页的页级意图证据：仓库级文档小节（模块无关的「为什么」） */
function moduleIntentPageExtra(deps: ContextDeps): Pick<ModulesContext, 'intent'> {
  if (!deps.intentProvider) return {};
  const docs = deps.intentProvider.docEvidence().slice(0, 6);
  return docs.length > 0 ? { intent: docs } : {};
}

export function buildApiContext(deps: ContextDeps): ApiContext {
  const arch = deps.client.getArchitecture();

  // entry_points 的语义是"无内部调用者的导出符号"，不等于 CLI 命令——
  // MCP 会把普通导出函数（如 saveWidgets）也列为 entry point。
  // project-wiki 规则「图谱结果与源码抽查一致，冲突以源码为准」：
  // 只有 register*/*Command 命名约定的入口才标为命令，其余并入导出函数表。
  const isCommandEntry = (name: string) =>
    name.startsWith('register') || name.includes('Command');
  const entries = arch.entry_points
    .filter(e => isAppEntryPoint(deps, e.file))
    .slice(0, 8);
  const commands = entries
    .filter(e => isCommandEntry(e.name))
    .map(e => {
      const { description, startLine } = commandDescription(deps, e.name);
      return {
        name: e.name,
        filePath: e.file,
        startLine,
        description,
      };
    });

  // 查导出函数（有 signature/docstring 的），对核心函数取源码片段；
  // signature 与 return_type 是图谱的两个字段，统一合并后再渲染（W4）
  const q = deps.client.queryGraph(
    `MATCH (n) WHERE n.is_exported = true AND n.is_test = false
         AND n.label IN ['Function', 'Method']
       RETURN n.name AS name, n.qualified_name AS qn, n.file_path AS file,
              n.signature AS sig, n.docstring AS doc, n.complexity AS cx, n.return_type AS rt
       ORDER BY n.complexity DESC LIMIT 15`,
  );

  const exportedFunctions = q.rows
    .filter(row => isProductionGraphFile(deps, (row[2] as string) ?? ''))
    .map(row => {
      const qn = row[1] as string | null;
      const file = (row[2] as string) ?? '';
      const snippet = qn ? safeGetSnippet(deps, qn) : null;
      return {
        name: row[0] as string,
        filePath: file,
        startLine: snippet?.start_line ?? 0,
        signature: mergeGraphSignature(row[3] as string | null ?? snippet?.signature ?? null, row[6] as string | null, file),
        docstring: (row[4] as string | null) ?? snippet?.docstring ?? null,
      };
    });

  // 非命令的 entry point（无调用者的导出函数）并入导出函数表，按名去重
  const seen = new Set(exportedFunctions.map(f => f.name));
  for (const e of entries) {
    if (isCommandEntry(e.name) || seen.has(e.name) || isTestPath(e.file)) continue;
    const snippet = safeGetSnippet(deps, e.name);
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
  if (isTauriProject(deps.scanResult.rootDir)) {
    ipc = scanIpcSurface(deps.scanResult, deps.sourceCache);
    for (const cmd of ipc.commands) deps.fallbackSymbolNames.add(cmd.name);
    for (const evt of ipc.events) deps.fallbackSymbolNames.add(evt.name);
  }

  return {
    commands,
    exportedFunctions: ipc ? exportedFunctions.slice(0, 8) : exportedFunctions,
    frameworkNodes: [],
    ipc,
  };
}
