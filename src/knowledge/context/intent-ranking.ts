/**
 * 意图候选文件的评分输入装配（context 层适配）：把图谱/扫描/git/文档的确定性
 * 数据收集成 intent/ranking.ts 的纯函数输入。排序只影响 GIT_FILE_CAP 截断的
 * 去留（哪些文件参与 git 挖掘），评分绝不作为事实输出。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ArchitectureData } from '../../mcp/types.js';
import { basename } from 'node:path';
import { isTestPath, languageDomainOf } from '../../shared/utils.js';
import { rankIntentCandidates, type RankingInputs, type RankedFile } from '../intent/ranking.js';
import { GIT_FILE_CAP, type IntentCandidateStats } from '../intent/shared.js';
import type { ContextDeps } from './shared.js';

/** 架构快照（与 context/architecture.ts 同缓存位，避免循环依赖的本文件内联版） */
function archSnapshot(deps: ContextDeps): ArchitectureData {
  if (deps.architectureSnapshotCache === null) {
    deps.architectureSnapshotCache = deps.client.getArchitecture();
  }
  return deps.architectureSnapshotCache;
}

/** 文件级 fan-in 与符号数：两次聚合查询（fail-open → 空 Map） */
function graphFileSignals(deps: ContextDeps): {
  fanInByFile: Map<string, number>;
  symbolCountByFile: Map<string, number>;
} {
  const fanInByFile = new Map<string, number>();
  const symbolCountByFile = new Map<string, number>();
  try {
    const fanInRows = deps.client.queryGraph(
      `MATCH ()-[c:CALLS]->(n) WHERE n.is_test = false AND n.file_path IS NOT NULL
         RETURN n.file_path AS file, count(c) AS fanIn
         ORDER BY fanIn DESC LIMIT 500`,
      500,
    ).rows;
    for (const row of fanInRows) {
      const file = String(row[0] ?? '');
      const n = Number(row[1] ?? 0);
      if (file && n > 0) fanInByFile.set(file, n);
    }
    const symbolRows = deps.client.queryGraph(
      `MATCH (n) WHERE n.is_test = false AND n.file_path IS NOT NULL
         RETURN n.file_path AS file, count(n) AS symbols
         ORDER BY symbols DESC LIMIT 1000`,
      1000,
    ).rows;
    for (const row of symbolRows) {
      const file = String(row[0] ?? '');
      const n = Number(row[1] ?? 0);
      if (file && n > 0) symbolCountByFile.set(file, n);
    }
  } catch { /* 图谱不可用 → 排序退化为其余信号 */ }
  return { fanInByFile, symbolCountByFile };
}

/** 测试配对：生产文件 basename（去扩展名）存在同名 .test./.spec. 文件即视为被测 */
function testPairedFiles(deps: ContextDeps, production: string[]): Set<string> {
  const testBases = new Set<string>();
  for (const f of deps.scanResult.testFiles) {
    const base = basename(f.relativePath).replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/, '').replace(/\.(?:test|spec)\.(?:rs|py|go)$/, '');
    if (base) testBases.add(base);
  }
  return new Set(production.filter(rel => testBases.has(basename(rel).replace(/\.[cm]?[jt]sx?$/, '').replace(/\.(?:rs|py|go)$/, ''))));
}

/** README/docs 提及：文本包含完整相对路径或带扩展名的文件名（防去扩展名误配） */
function docsMentionedFiles(production: string[], rootDir: string): Set<string> {
  const docs: string[] = ['README.md'];
  const docsDir = join(rootDir, 'docs');
  if (existsSync(docsDir)) {
    const walk = (dir: string, depth: number) => {
      if (docs.length >= 20 || depth > 2) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else if (entry.name.endsWith('.md')) docs.push(full);
      }
    };
    walk(docsDir, 0);
  }
  let corpus = '';
  for (const p of docs) {
    try {
      corpus += readFileSync(p, 'utf-8');
    } catch { /* 不可读文档跳过 */ }
    if (corpus.length > 400_000) break;
  }
  if (corpus.length === 0) return new Set();
  return new Set(production.filter(rel => corpus.includes(rel) || corpus.includes(basename(rel))));
}

/** 装配输入并排序；返回全量有序文件 + 构建报告观测统计 */
export function intentCandidateRanking(
  deps: ContextDeps,
  pkgNames: string[],
): { ordered: string[]; stats: IntentCandidateStats } {
  const production = deps.scanResult.productionFiles
    .map(f => f.relativePath)
    .filter(rel => languageDomainOf(rel) !== null && !isTestPath(rel));
  const sizeOf = new Map(deps.scanResult.productionFiles.map(f => [f.relativePath, f.size]));

  const { fanInByFile, symbolCountByFile } = graphFileSignals(deps);
  const arch = archSnapshot(deps);
  const entryFiles = new Set(arch.entry_points.map(e => e.file).filter(Boolean));
  const boundaryPackages = new Set(arch.boundaries.flatMap(b => [b.from, b.to]).filter(Boolean));
  const testedFiles = testPairedFiles(deps, production);
  const mentioned = docsMentionedFiles(production, deps.scanResult.rootDir);
  const churnCounts = deps.intentProvider !== null ? deps.intentProvider.fileChurnCounts() : new Map<string, number>();

  const input: RankingInputs = {
    files: production.map(rel => ({ relativePath: rel, size: sizeOf.get(rel) ?? 0 })),
    fanInByFile,
    symbolCountByFile,
    entryFiles,
    boundaryPackages,
    packageNames: pkgNames,
    testedFiles,
    docsMentionedFiles: mentioned,
    churnCounts,
  };
  const ranked: RankedFile[] = rankIntentCandidates(input);

  const gitTop = ranked.slice(0, GIT_FILE_CAP);
  const stats: IntentCandidateStats = {
    total: ranked.length,
    gitTop: gitTop.map(r => r.file),
    gitTopEntryCount: gitTop.filter(r => r.signals.entry).length,
    gitTopTestedCount: gitTop.filter(r => r.signals.tested).length,
  };
  return { ordered: ranked.map(r => r.file), stats };
}

/** 供测试观测：暴露装配内部（不参与主流程） */
export const __testing = { graphFileSignals, testPairedFiles, docsMentionedFiles };
