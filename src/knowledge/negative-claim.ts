/**
 * 负面断言第二意见框架（W5）：任何通道要落定「未被调用 / 未检出 / 无发射点」
 * 类**否定性结论**前，必须对本仓源码做一次独立的裸字符串检索。
 *
 * 原则：正则/图谱「没抓到」≠「源码不存在」。二次检索命中 → suspect（扫描口径
 * 局限，页面必须如实标注而非断言不存在）；未命中 → confirmed（可断言）。
 * 该框架先在 tauri-ipc 通道落地，供全部现有与未来通道复用。
 */

import { readFileSync } from 'node:fs';
import type { ScanResult } from '../core/scanner.js';
import { isTestPath, languageDomainOf } from '../shared/utils.js';
import { recordNegativeClaim } from './channels/stats.js';

export interface CorpusFile {
  rel: string;
  src: string;
  isRust: boolean;
}

export type AbsenceSide = 'frontend' | 'rust' | 'any';

export interface AbsenceRef {
  file: string;
  line: number;
}

export type AbsenceVerdict =
  | { verdict: 'confirmed'; refs: [] }
  | { verdict: 'suspect'; refs: AbsenceRef[] };

const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*|#)/;
const MAX_REFS = 3;

/**
 * 构建检索语料：生产源码全文（rust 只认 src-tauri/ 内，前端只认其外——
 * 与 tauri-ipc 通道同口径），经 SourceCache 复用读取。
 */
export function buildSourceCorpus(
  scanResult: ScanResult,
  cache: { has(k: string): boolean; get(k: string): string | null | undefined; set(k: string, v: string): void },
): CorpusFile[] {
  const texts: CorpusFile[] = [];
  for (const file of scanResult.productionFiles) {
    const domain = languageDomainOf(file.relativePath);
    if (domain === null || isTestPath(file.relativePath)) continue;
    const isRust = domain === 'rust';
    const inSrcTauri = file.relativePath.startsWith('src-tauri/');
    if (isRust !== inSrcTauri) continue;

    let src: string | null | undefined = cache.has(file.absolutePath)
      ? cache.get(file.absolutePath)
      : undefined;
    if (src === null) continue;
    if (src === undefined) {
      try {
        src = readFileSync(file.absolutePath, 'utf-8');
      } catch {
        src = null;
      }
      cache.set(file.absolutePath, src ?? '');
      if (src === null) continue;
    }
    texts.push({ rel: file.relativePath, src, isRust });
  }
  return texts;
}

/**
 * 裸检索验证名字缺失（snake/camel 双形、跳过注释行、排除已知锚点——
 * 例如监听点本身不是发射证据）。命中即 suspect，附引用点供页面标注。
 * 统计进通道报告（suspect/confirmed 计数）。
 */
export function verifyAbsence(
  corpus: readonly CorpusFile[],
  name: string,
  side: AbsenceSide,
  exclude: ReadonlyArray<AbsenceRef> = [],
): AbsenceVerdict {
  const forms = new Set<string>([name]);
  forms.add(name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()));
  forms.add(name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase());
  const excluded = new Set(exclude.map(r => `${r.file}:${r.line}`));

  const hits: AbsenceRef[] = [];
  for (const f of corpus) {
    if (side !== 'any' && (side === 'rust') !== f.isRust) continue;
    const lines = f.src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (COMMENT_LINE_RE.test(lines[i])) continue;
      if (excluded.has(`${f.rel}:${i + 1}`)) continue;
      for (const form of forms) {
        if (lines[i].includes(form)) {
          hits.push({ file: f.rel, line: i + 1 });
          break;
        }
      }
      if (hits.length >= MAX_REFS) break;
    }
    if (hits.length >= MAX_REFS) break;
  }

  if (hits.length > 0) {
    recordNegativeClaim({ suspect: 1 });
    return { verdict: 'suspect', refs: hits };
  }
  recordNegativeClaim({ confirmed: 1 });
  return { verdict: 'confirmed', refs: [] };
}
