/**
 * 跨页一致性检测（确定性子集）：
 * - term-inconsistency：glossary 定义过的符号名在其他页出现仅大小写差异的变体
 * - dep-consistency：overview 与 tech-stack 对同一依赖的使用归类矛盾
 *   （context 层面：overview.depUsage.usageKind vs tech-stack 依赖分区）
 */

import type { CrossPageIssue, PageFingerprint } from './types.js';
import type { OverviewContext, TechStackContext } from '../types.js';

/** 归一化：仅保留字母与数字，其余丢弃（用于大小写/分隔符不敏感比对） */
function normalizeTerm(t: string): string {
  return t.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

/** 术语统一检测：glossary 术语全集 vs 各页术语集，报告仅大小写/连字符差异的变体 */
export function detectTermInconsistency(
  fingerprints: ReadonlyMap<string, PageFingerprint>,
): CrossPageIssue[] {
  const glossary = fingerprints.get('glossary');
  if (!glossary || glossary.terms.size === 0) return [];
  // glossary 术语归一化索引：norm → 规范形（首个出现形）
  const canonical = new Map<string, string>();
  for (const term of glossary.terms) {
    const norm = normalizeTerm(term);
    if (norm.length >= 3 && !canonical.has(norm)) canonical.set(norm, term);
  }
  const issues: CrossPageIssue[] = [];
  for (const [page, fp] of fingerprints) {
    if (page === 'glossary') continue;
    const seen = new Set<string>();
    for (const term of fp.terms) {
      const norm = normalizeTerm(term);
      const standard = canonical.get(norm);
      if (!standard || standard === term || seen.has(norm)) continue;
      seen.add(norm);
      issues.push({
        rule: 'term-inconsistency',
        pages: [page, 'glossary'],
        message: `${page} 页术语 \`${term}\` 与 glossary 规范形 \`${standard}\` 仅大小写/分隔符不同，建议统一`,
      });
      if (issues.length >= 10) return issues; // 上限防报告爆炸
    }
  }
  return issues;
}

/** 依赖归类矛盾检测：overview.depUsage.usageKind vs tech-stack 分区（import/test/script） */
export function detectDepConsistency(
  contexts: ReadonlyMap<string, unknown>,
): CrossPageIssue[] {
  const overview = contexts.get('overview') as OverviewContext | undefined;
  const techStack = contexts.get('tech-stack') as TechStackContext | undefined;
  if (!overview?.depUsage || !techStack) return [];

  // tech-stack 分区归类
  const tsKind = new Map<string, 'import' | 'test' | 'script' | 'unused'>();
  for (const d of techStack.coreDeps) tsKind.set(d.name, d.usageKind);
  for (const d of techStack.devDeps) tsKind.set(d.name, d.usageKind);
  for (const d of techStack.testDeps) tsKind.set(d.name, d.usageKind);
  for (const d of techStack.unusedDeps) tsKind.set(d.name, 'unused');

  const issues: CrossPageIssue[] = [];
  for (const dep of overview.depUsage) {
    const ts = tsKind.get(dep.name);
    if (ts === undefined) continue;
    // 矛盾判定：overview 说生产 import，tech-stack 归入 test/unused（或反之）
    const ovIsProd = dep.usageKind === 'import';
    const tsIsProd = ts === 'import';
    if (ovIsProd !== tsIsProd) {
      issues.push({
        rule: 'dep-consistency',
        pages: ['overview', 'tech-stack'],
        message: `依赖 \`${dep.name}\` 归类矛盾：overview 标记 ${dep.usageKind}，tech-stack 归入 ${ts}，请核对 import 证据`,
      });
    }
    if (issues.length >= 10) break;
  }
  return issues;
}

/**
 * 跨页同数异名检测（metric-mismatch）：两个页面的表格出现**完全相同**的数值序列
 * （≥5 项，按行序逐一相等）但列头语义不同（如「复杂度」vs「扇入」）——
 * 同一份底层数据被两个标签渲染，必有一处语义错误。
 * 典型事故：overview 把 hotspots 的 fan_in 误标成「复杂度」，与 calls 页「扇入」同数双标。
 */
export function detectMetricMismatch(
  fingerprints: ReadonlyMap<string, PageFingerprint>,
): CrossPageIssue[] {
  // 数值序列签名（长度 ≥5 才有区分度）→ [{page, header}]
  const bySignature = new Map<string, Array<{ page: string; header: string }>>();
  for (const [page, fp] of fingerprints) {
    for (const table of fp.tables) {
      for (const col of table.numericColumns) {
        if (col.values.length < 5) continue;
        const sig = col.values.join(',');
        let list = bySignature.get(sig);
        if (list === undefined) bySignature.set(sig, (list = []));
        if (!list.some(e => e.page === page && e.header === col.header)) {
          list.push({ page, header: col.header });
        }
      }
    }
  }
  const issues: CrossPageIssue[] = [];
  const reported = new Set<string>();
  for (const [sig, owners] of bySignature) {
    if (owners.length < 2) continue;
    // 同一页内同表头重复不算跨页矛盾；不同表头（无论是否跨页）才报
    const headers = new Set(owners.map(o => o.header));
    if (headers.size < 2) continue;
    const key = [...owners].map(o => `${o.page}:${o.header}`).sort().join('|');
    if (reported.has(key)) continue;
    reported.add(key);
    const n = sig.split(',').length;
    issues.push({
      rule: 'metric-mismatch',
      pages: [...new Set(owners.map(o => o.page))],
      message: `同一数值序列（${n} 项）在多处以不同语义渲染：${[...owners].map(o => `${o.page} 页「${o.header}」列`).join('、')}——同一底层数据被两个标签引用，至少一处语义有误，请核对数据源字段`,
    });
  }
  return issues;
}
