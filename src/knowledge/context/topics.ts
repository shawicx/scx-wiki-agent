import { isTestPath, matchPackageForFile } from '../../shared/utils.js';
import { buildEvidenceIndex } from '../evidence-id.js';
import { parseChapterPage } from '../page-registry.js';
import type { TopicContext, ChapterPageContext } from '../types.js';
import { isTrustedCallEdge } from './data-flow.js';
import { type ContextDeps, labelToSymbolType } from './shared.js';

/**
 * 主题页数据源：主题文件集的符号 + 文件间 CALLS 边 + 相关跨包边界。
 * 文件清单来自 topics.json（确定性锁定），查询复用现有 Cypher 模式。
 */
export function buildTopicContext(deps: ContextDeps, topicId: string): TopicContext | null {
  const def = deps.topics.find(t => t.id === topicId);
  if (!def) return null;

  const { symbols, edges, boundaries } = fileEvidence(deps, def.files);
  const base = {
    id: def.id,
    title: def.title,
    files: def.files,
    symbols,
    edges,
    boundaries,
  };
  // 证据索引在并入 intent 前构建也无妨——buildEvidenceIndex 接受 intent 可选；
  // 这里先组 intent 再建索引，保证编号覆盖意图证据。
  const intent = deps.intentProvider ? deps.intentProvider.intentForFiles(def.files) : undefined;
  return {
    ...base,
    ...(intent ? { intent } : {}),
    evidenceIndex: buildEvidenceIndex({ ...base, ...(intent ? { intent } : {}) }),
  };
}

/**
 * 章节页数据源：与主题页同一套图谱查询（符号/边/边界），
 * 叠加 outline.json 锁定的章信息与写作简报（brief 驱动生成）。
 */
export function buildChapterPageContext(deps: ContextDeps, page: string): ChapterPageContext | null {
  const ref = parseChapterPage(page);
  if (!ref) return null;
  const chapter = deps.outlineChapters.find(c => c.id === ref.chapter);
  if (!chapter) return null;
  const pg = chapter.pages.find(p => p.id === ref.page);
  if (!pg) return null;

  const { symbols, edges, boundaries } = fileEvidence(deps, pg.files);
  return {
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    pageId: pg.id,
    title: pg.title,
    brief: pg.brief,
    files: pg.files,
    symbols, edges, boundaries,
    ...(deps.intentProvider ? { intent: deps.intentProvider.intentForFiles(pg.files) } : {}),
  };
}

/** 文件集的图谱证据：符号 + 文件间 CALLS 边 + 相关跨包边界（主题页/章节页共用） */
function fileEvidence(deps: ContextDeps, files: string[]): Pick<TopicContext, 'symbols' | 'edges' | 'boundaries'> {
  const fileList = files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(',');
  const symQ = deps.client.queryGraph(
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
      type: labelToSymbolType(row[1] as string),
      file: row[2] as string,
      startLine: row[3] as number | undefined,
      docstring: (row[4] as string | null) ?? null,
      signature: (row[5] as string | null) ?? null,
      complexity: row[6] as number | undefined,
    }));

  const edgeQ = deps.client.queryGraph(
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
      return isTrustedCallEdge(deps, callerFile, calleeFile, row[2] as string);
    })
    .map(row => ({
      caller: row[0] as string,
      callee: row[2] as string,
      file: row[3] as string,
      line: (row[4] as number) ?? 0,
    }));

  // 文件涉及的跨包边界（文件所属 package 与边界端点匹配，路径段精确归属）
  const arch = deps.client.getArchitecture();
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
