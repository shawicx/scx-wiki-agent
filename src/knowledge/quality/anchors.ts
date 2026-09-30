/** 真锚点核验（原 wiki-quality-validator.ts 拆分，零逻辑变化）：
 *  行号范围 / 锚点-符号关联 / 文档 slug / 页内 fragment 链接。 */

import { isCommentLine } from '../claim-verifier.js';
import type { QualityIssue, ValidateOptions } from './types.js';


/** file:line 锚点（源文件相对路径 + 行号） */
export const ANCHOR_RE =
  /`?((?:[\w.@-]+\/)*[\w.@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|cts|mts|py|go|java|rs|rb|php|cs|swift|kt|sql)):(\d+)`?/g;

/** commit 证据锚点：`commit:abc12345 (2026-06-24)` / `\`abc12345\`（2026-06-24）` 等变体 */
export const COMMIT_ANCHOR_RE = /commit[:：]?\s*[0-9a-f]{7,40}\b|\b[0-9a-f]{7,40}\b`?\s*[（(]\s*\d{4}-\d{2}-\d{2}/;

/** 文档小节证据锚点：`docs/design/adr.md#决策`（文件路径 + # 标题） */
export const DOC_ANCHOR_RE = /[\w.@-]+(?:\/[\w.@-]+)*\.[a-z0-9]+#[^\s|，。)）]+/i;

/** 无 g 标志的锚点探测副本（test 不留 lastIndex 状态，避免跨小节误判） */
export const ANCHOR_TEST_RE = new RegExp(ANCHOR_RE.source);

/** R1 事后核验：file:line 锚点是否可追溯到扫描文件清单。
 *  LLM 常写短文件名（如 signing.rs）：basename 在扫描清单内唯一可解析时视为有效锚点
 *  （指向无歧义），仅多义/全无命中才告警。
 *  注入 readFileLine 时升级为「真锚点」核验：行号范围 + 锚点-符号关联 +
 *  分类统计（comment/doc/usage）；注入 readFile 时校验 docs/foo.md#标题 目标。 */
export function checkAnchors(
  text: string,
  opts: ValidateOptions,
  issues: QualityIssue[],
): { total: number; valid: number; outOfRange: number; comment: number; doc: number; usage: number } {
  let total = 0;
  let valid = 0;
  let outOfRange = 0;
  let comment = 0;
  let doc = 0;
  let usage = 0;
  const zeroLine = new Set<string>();
  const unknown = new Set<string>();
  const outOfRangeSet = new Set<string>();
  const mismatched = new Set<string>();
  const docMissing = new Set<string>();
  const byBasename = new Map<string, number>();
  const byBasenamePath = new Map<string, string>();
  for (const f of opts.knownFiles) {
    const base = f.slice(f.lastIndexOf('/') + 1);
    byBasename.set(base, (byBasename.get(base) ?? 0) + 1);
    byBasenamePath.set(base, f);
  }
  const lineRe = new RegExp(ANCHOR_RE.source, 'g');
  const docRe = new RegExp(DOC_ANCHOR_RE.source, 'gi');

  let inFence = false;
  for (const rawLine of text.split('\n')) {
    if (/^\s*```/.test(rawLine)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const line = rawLine;

    // 行内反引号标识符（锚点-符号关联用）
    const tickNames = new Set<string>();
    for (const t of line.matchAll(/`([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)`/g)) {
      tickNames.add(t[1].split('.').pop()!);
    }

    for (const m of line.matchAll(lineRe)) {
      total++;
      const [path, lineNo] = [m[1], m[2]];
      if (lineNo === '0') {
        zeroLine.add(`${path}:0`);
        continue;
      }
      // 解析锚点文件（全路径 > 唯一 basename > 不可解析）
      let resolved: string | null = null;
      if (opts.knownFiles.has(path)) {
        resolved = path;
      } else if (!path.includes('/') && byBasename.get(path) === 1) {
        resolved = byBasenamePath.get(path) ?? null;
      }
      if (resolved === null) {
        unknown.add(path);
        continue;
      }
      valid++;

      if (opts.readFileLine) {
        const content = opts.readFileLine(resolved, Number(lineNo));
        if (content === null) {
          outOfRange++;
          outOfRangeSet.add(`${path}:${lineNo}`);
        } else if (isCommentLine(content, resolved)) {
          comment++; // 注释锚点：R7 允许，仅统计分布
        } else {
          usage++;
        }
        // 锚点-符号关联：行内标识符唯一解析到定义文件集、而锚点文件不在其中
        if (opts.symbolFiles) {
          for (const name of tickNames) {
            const defFiles = opts.symbolFiles.get(name);
            if (defFiles && defFiles.size > 0 && !defFiles.has(resolved!)) {
              mismatched.add(`${name} @ ${path}:${lineNo}（定义于 ${[...defFiles].slice(0, 2).join('、')}）`);
            }
          }
        }
      }
    }

    // 文档锚点 docs/foo.md#标题：目标文件可读时校验 heading slug 存在性
    if (opts.readFile) {
      for (const m of line.matchAll(docRe)) {
        const anchor = m[0];
        const hashIdx = anchor.indexOf('#');
        const docPath = anchor.slice(0, hashIdx);
        const frag = anchor.slice(hashIdx + 1);
        if (!opts.knownFiles.has(docPath)) continue;
        doc++;
        const docContent = opts.readFile(docPath);
        if (docContent === null) continue;
        const slugs = headingSlugs(docContent);
        if (!slugs.has(frag) && !slugs.has(decodeURIComponent(frag))) {
          docMissing.add(anchor);
        }
      }
    }
  }

  for (const z of zeroLine) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `残缺锚点（缺少行号）: ${z}` });
  }
  for (const u of unknown) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `锚点路径不在扫描文件清单中: ${u}` });
  }
  for (const o of outOfRangeSet) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `锚点行号超出文件范围: ${o}` });
  }
  for (const mm of [...mismatched].slice(0, 5)) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `锚点文件与符号定义文件不符: ${mm}` });
  }
  for (const d of [...docMissing].slice(0, 5)) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `文档锚点目标不存在: ${d}` });
  }
  return { total, valid, outOfRange, comment, doc, usage };
}

/**
 * GitHub 风格 heading slug（中文保留）：小写 ASCII、去标点（保留连字符/下划线/
 * 字母数字/中日韩文字）、空格→连字符。纯函数，供文档锚点与页内 fragment 校验。
 */
export function headingSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** 文档内容 → 全部 heading slug 集合 */
function headingSlugs(docContent: string): Set<string> {
  const slugs = new Set<string>();
  for (const line of docContent.split('\n')) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) slugs.add(headingSlug(m[1]));
  }
  return slugs;
}

/** 页内 fragment 链接（[文本](#锚点)）：目标 heading 必须存在于本页 */
export function checkFragmentLinks(text: string, _opts: ValidateOptions, issues: QualityIssue[]): void {
  const slugs = headingSlugs(text);
  const dead = new Set<string>();
  for (const m of text.matchAll(/\]\(#([^)]+)\)/g)) {
    const frag = m[1];
    if (!slugs.has(frag) && !slugs.has(decodeURIComponent(frag))) dead.add(frag);
  }
  for (const d of dead) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `页内锚链接目标不存在: #${d}` });
  }
}
