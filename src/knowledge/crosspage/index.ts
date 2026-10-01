/**
 * 跨页审校编排入口：指纹采集 → 重复/越界/一致性检测 → 亲和度计算。
 * 纯函数（输入内存页产物与 context，输出报告与跨页链接）；降级动作经 applyCrossPageActions 应用。
 */

import { collectFingerprints } from './collector.js';
import { detectDuplication } from './duplication.js';
import { detectScopeOverlap } from './scope.js';
import { detectDepConsistency, detectTermInconsistency } from './consistency.js';
import type { CrossLink } from '../page-registry.js';
import { findPageDescriptor } from '../page-registry.js';
import { COMPLEMENT_PAGES } from './types.js';
import type { CrossPageReport, PageFingerprint } from './types.js';

export interface ReviewInput {
  pages: Array<{ page: string; content: string; evidenceFiles?: string[] }>;
  /** 页面 context（dep-consistency 检测用；缺省跳过该检测） */
  contexts?: ReadonlyMap<string, unknown>;
  /** 本次构建计划的全部页名（跨页链接零死链保障） */
  plannedPages: readonly string[];
}

/** 页面间亲和度：共享源码文件数 + 共享反引号术语数 */
function computeAffinity(
  fingerprints: ReadonlyMap<string, PageFingerprint>,
): Map<string, Array<{ page: string; sharedFiles: number; sharedSymbols: number }>> {
  const names = [...fingerprints.keys()];
  const out = new Map<string, Array<{ page: string; sharedFiles: number; sharedSymbols: number }>>();
  for (const a of names) {
    const fa = fingerprints.get(a)!;
    const list: Array<{ page: string; sharedFiles: number; sharedSymbols: number }> = [];
    for (const b of names) {
      if (a === b) continue;
      const fb = fingerprints.get(b)!;
      let sharedFiles = 0;
      for (const f of fa.files) if (fb.files.has(f)) sharedFiles++;
      let sharedSymbols = 0;
      for (const t of fa.terms) if (fb.terms.has(t)) sharedSymbols++;
      if (sharedFiles > 0 || sharedSymbols > 0) list.push({ page: b, sharedFiles, sharedSymbols });
    }
    list.sort((x, y) => (y.sharedFiles + y.sharedSymbols) - (x.sharedFiles + x.sharedSymbols));
    out.set(a, list);
  }
  return out;
}

/** 每页跨目录链接清单：互补职责页（必现）+ 亲和度 Top-3（去同目录/去互补） */
function computeCrossLinks(
  page: string,
  affinity: ReadonlyMap<string, Array<{ page: string; sharedFiles: number; sharedSymbols: number }>>,
  plannedPages: readonly string[],
  dirOf: (p: string) => string,
): CrossLink[] {
  const links: CrossLink[] = [];
  const seen = new Set<string>();
  // 互补职责页
  for (const [a, b] of COMPLEMENT_PAGES) {
    const other = a === page ? b : b === page ? a : null;
    if (other && plannedPages.includes(other)) {
      links.push({ target: other, reason: '互补职责' });
      seen.add(other);
    }
  }
  // 亲和度 Top-3（仅跨目录、非互补）
  const top = (affinity.get(page) ?? []).filter(c =>
    !seen.has(c.page) && plannedPages.includes(c.page) && dirOf(c.page) !== dirOf(page));
  for (const c of top.slice(0, 3)) {
    const bits: string[] = [];
    if (c.sharedFiles > 0) bits.push(`共享 ${c.sharedFiles} 个源文件`);
    if (c.sharedSymbols > 0) bits.push(`共享 ${c.sharedSymbols} 个符号`);
    links.push({ target: c.page, reason: bits.length > 0 ? bits.join('、') : '内容关联' });
    seen.add(c.page);
  }
  return links;
}

/**
 * 跨页审校主入口。返回报告 + 每页跨目录 Related 链接（零死链：只含计划内页面）。
 */
export function crosspageReview(input: ReviewInput): {
  report: CrossPageReport;
  crossLinks: Map<string, CrossLink[]>;
} {
  const fingerprints = collectFingerprints(input.pages);
  const duplication = detectDuplication(fingerprints);
  const issues = [
    ...duplication.issues,
    ...detectScopeOverlap(fingerprints),
    ...detectTermInconsistency(fingerprints),
    ...detectDepConsistency(input.contexts ?? new Map()),
  ];
  const affinity = computeAffinity(fingerprints);

  const dirOf = (p: string): string => findPageDescriptor(p)?.dir ?? '';
  const crossLinks = new Map<string, CrossLink[]>();
  for (const { page } of input.pages) {
    crossLinks.set(page, computeCrossLinks(page, affinity, input.plannedPages, dirOf));
  }

  return {
    report: { issues, actions: duplication.actions, affinity },
    crossLinks,
  };
}

