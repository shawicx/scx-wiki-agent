/**
 * 跨页指纹采集：从内存页产物确定性提取表格/术语/依赖/意图证据锚点。
 * 全部为正则与行扫描级解析（ADR-001 先例：无 AST）；fail-open——解析不出即空指纹。
 */

import type { PageFingerprint, TableFingerprint } from './types.js';

/** 表头行判定：| a | b | 且下一行是 |---| 分隔行 */
function isTableHeader(line: string, next: string | undefined): boolean {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return false;
  if (next === undefined) return false;
  return /^\s*\|[\s:|-]+\|?\s*$/.test(next) && next.includes('-');
}

/** 拆分表格行的单元格 */
function splitCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
}

/** markdown 表格提取（跳过 fenced 代码块与 <details> 内的原始块——details 内的表格仍计入） */
export function extractTables(content: string): TableFingerprint[] {
  const lines = content.split('\n');
  const tables: TableFingerprint[] = [];
  let inFence = false;
  let lastSection = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^(#{2,3})\s+(.{1,80})/);
    if (heading) {
      lastSection = heading[2].trim();
      continue;
    }
    if (isTableHeader(line, lines[i + 1])) {
      const header = splitCells(line);
      const firstColumn = new Set<string>();
      let rows = 0;
      let j = i + 2;
      for (; j < lines.length; j++) {
        const row = lines[j].trim();
        if (!row.startsWith('|')) break;
        if (/^\|[\s:|-]+\|?$/.test(row)) break;
        rows++;
        const cells = splitCells(row);
        if (cells.length > 0 && cells[0]) firstColumn.add(cells[0]);
      }
      tables.push({ header, rows, firstColumn, section: lastSection });
      i = j - 1;
    }
  }
  return tables;
}

/** 正文反引号标识符提取（术语统一检测域；跳过 fenced 与 evidence 表锚点列噪音由调用方过滤） */
export function extractTerms(content: string): Set<string> {
  const terms = new Set<string>();
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const m of line.matchAll(/`([^`\n]{1,60})`/g)) {
      const t = m[1].trim();
      if (t.length >= 2) terms.add(t);
    }
  }
  return terms;
}

/** 依赖名提及计数：`dep` 形式且是 camel/kebab 包名形态（含 / 作用域） */
export function extractDepMentions(content: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of extractTerms(content)) {
    if (!/^(?:@[\w.-]+\/)?[\w][\w.-]*$/.test(t)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

/** 意图证据锚点提取：表格「锚点」列（表头含 锚点）与 commit: 前缀行内文本 */
export function extractIntentAnchors(content: string, tables: TableFingerprint[]): Set<string> {
  const anchors = new Set<string>();
  const lines = content.split('\n');
  let inFence = false;
  let anchorCol = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (isTableHeader(line, lines[i + 1])) {
      anchorCol = splitCells(line).indexOf('锚点');
      continue;
    }
    const row = line.trim();
    if (row.startsWith('|') && anchorCol >= 0) {
      const cells = splitCells(row);
      const a = cells[anchorCol];
      if (a && (a.includes(':') || a.startsWith('commit:'))) anchors.add(a);
    }
  }
  // commit: 锚点也可能出现在正文/列表（decisions 页）
  for (const m of content.matchAll(/commit:[0-9a-f]{7,40}/g)) anchors.add(m[0]);
  void tables;
  return anchors;
}

/** 页面指纹采集主入口 */
export function collectFingerprints(
  pages: Array<{ page: string; content: string; evidenceFiles?: string[] }>,
): Map<string, PageFingerprint> {
  const out = new Map<string, PageFingerprint>();
  for (const { page, content, evidenceFiles } of pages) {
    const tables = extractTables(content);
    out.set(page, {
      page,
      tables,
      terms: extractTerms(content),
      depMentions: extractDepMentions(content),
      intentAnchors: extractIntentAnchors(content, tables),
      files: new Set(evidenceFiles ?? []),
    });
  }
  return out;
}
