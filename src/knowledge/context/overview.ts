import type { SymbolType } from '../../core/types.js';
import type { OverviewContext } from '../types.js';
import {
  type ContextDeps,
  ENTRY_FILE_NAMES,
  readPackageMeta,
  readRepoFileExcerpt,
  buildDepUsage,
} from './shared.js';

export function buildOverviewContext(deps: ContextDeps): OverviewContext {
  const arch = deps.client.getArchitecture();
  // 入口文件只认生产代码（tests/fixtures 下的同名文件不算项目入口）
  const entryFiles = deps.scanResult.productionFiles
    .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
    .map(f => ({ name: f.relativePath.split('/').pop()!, path: f.relativePath }));

  // hotspots 即高扇入符号，用作 topSymbols，体现项目核心（qn 供锚点与 trace 复用）
  const topSymbols = arch.hotspots.slice(0, 10).map(h => ({
    name: h.name,
    type: 'function' as SymbolType,
    qualifiedName: h.qualified_name,
    complexity: h.fan_in,
  }));

  const pkgMeta = readPackageMeta(deps);
  const productionLanguageCounts = new Map<string, number>();
  for (const file of deps.scanResult.productionFiles) {
    productionLanguageCounts.set(
      file.language,
      (productionLanguageCounts.get(file.language) ?? 0) + 1,
    );
  }

  return {
    projectType: deps.scanResult.projectType,
    hasTypeScript: deps.scanResult.hasTypeScript,
    fileCount: deps.scanResult.files.length,
    productionFileCount: deps.scanResult.fileCounts.production,
    testFileCount: deps.scanResult.fileCounts.test,
    techStack: deps.scanResult.techStack,
    sourceDirs: deps.scanResult.sourceDirs,
    languages: [...productionLanguageCounts.entries()].map(([language, fileCount]) => ({
      language,
      fileCount,
      // 各语言真实文件锚点：防止 LLM 以「未提供该语言文件路径」为由整段标待确认
      exampleFiles: exampleFilesForLanguage(deps, language),
    })),
    readmeExcerpt: readRepoFileExcerpt(deps, 'README.md', 2000),
    docsFiles: deps.scanResult.productionFiles
      .map(f => f.relativePath)
      .filter(p => p.startsWith('docs/') && p.endsWith('.md'))
      .slice(0, 10),
    packageName: pkgMeta.name,
    packageDescription: pkgMeta.description,
    entryFiles,
    topSymbols,
    depUsage: buildDepUsage(deps),
    ...(deps.intentProvider ? { intent: deps.intentProvider.overviewIntent(entryFiles.map(f => f.path)) } : {}),
  };
}

/** 语言名 → 扫描清单内真实文件样本（≤3 个，优先生产代码） */
function exampleFilesForLanguage(deps: ContextDeps, language: string): string[] {
  const want = language.toLowerCase();
  const byLang = deps.scanResult.productionFiles
    .filter(f => f.language.toLowerCase() === want)
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
  return deps.scanResult.productionFiles
    .filter(f => exts.includes(f.extension))
    .map(f => f.relativePath)
    .slice(0, 3);
}
