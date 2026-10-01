/**
 * 跨页重复检测：
 * - data-flow 的转换/边表与 calls 边表重合（首列 Jaccard）→ demote-data-flow 动作
 * - architecture 与 modules 的意图证据表 anchor 重合 → fold-intent-tables 动作（modules 页折叠）
 * 阈值均为确定性判定；检测不出即无动作（fail-open）。
 */

import type { CrossPageAction, CrossPageIssue, PageFingerprint } from './types.js';

/** 首列 Jaccard 相似度（空集安全：任一为空返回 0） */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (large.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** 两页之间表头相同的表格的首列最大重合度 */
function maxTableOverlap(fpA: PageFingerprint, fpB: PageFingerprint): number {
  let best = 0;
  for (const ta of fpA.tables) {
    for (const tb of fpB.tables) {
      if (ta.header.join('|') !== tb.header.join('|')) continue;
      best = Math.max(best, jaccard(ta.firstColumn, tb.firstColumn));
    }
  }
  return best;
}

const DATAFLOW_CALLS_TABLE_OVERLAP = 0.5;
const INTENT_ANCHOR_OVERLAP = 0.7;

/**
 * 重复检测主入口：fingerprints 为全页指纹。
 * 返回 issues（进报告）+ actions（生成后、裁决前确定性应用）。
 */
export function detectDuplication(
  fingerprints: ReadonlyMap<string, PageFingerprint>,
): { issues: CrossPageIssue[]; actions: CrossPageAction[] } {
  const issues: CrossPageIssue[] = [];
  const actions: CrossPageAction[] = [];

  const df = fingerprints.get('data-flow');
  const calls = fingerprints.get('calls');
  if (df && calls) {
    const overlap = maxTableOverlap(df, calls);
    if (overlap >= DATAFLOW_CALLS_TABLE_OVERLAP) {
      issues.push({
        rule: 'table-duplication',
        pages: ['data-flow', 'calls'],
        message: `data-flow 与 calls 表格首列重合度 ${Math.round(overlap * 100)}%（≥50%），data-flow 降级为数据形态摘要并链接 calls.md`,
      });
      actions.push({ kind: 'demote-data-flow', page: 'data-flow' });
    }
  }

  const arch = fingerprints.get('architecture');
  const modules = fingerprints.get('modules');
  if (arch && modules) {
    const overlap = jaccard(arch.intentAnchors, modules.intentAnchors);
    if (overlap >= INTENT_ANCHOR_OVERLAP && modules.intentAnchors.size >= 3) {
      issues.push({
        rule: 'intent-evidence-duplication',
        pages: ['architecture', 'modules'],
        message: `architecture 与 modules 意图证据锚点重合度 ${Math.round(overlap * 100)}%（≥70%），modules 页重复证据表折叠为摘要`,
      });
      actions.push({
        kind: 'fold-intent-tables',
        page: 'modules',
        keepAnchors: new Set([...arch.intentAnchors]),
      });
    }
  }

  return { issues, actions };
}
