/** 两阶段构建·阶段二：待确认项人工裁决 + 持久化 store 维护。 */

import { applyConfirmations, collectPendingConfirmations } from '../../knowledge/confirmation.js';
import type { ConfirmationDecision, ConfirmedEntry } from '../../knowledge/confirmation.js';
import type { WikiBuildOptions } from '../../knowledge/types.js';
import type { VerificationHub } from './verification.js';
import type { ConfirmSummary, ProducedEntry } from './types.js';

export interface ConfirmPhaseResult {
  summary: ConfirmSummary | null;
  /** 维护后的 store 条目（过期剪除 + 本次新增指纹） */
  entries: ConfirmedEntry[];
  /** store 是否需要落盘 */
  dirty: boolean;
}

export async function runConfirmPhase(
  options: WikiBuildOptions | undefined,
  producedEntries: ProducedEntry[],
  repoHead: string,
  hashOf: (file: string) => string | null,
  confirmedEntries: ConfirmedEntry[],
  staleCount: number,
  verify: VerificationHub,
): Promise<ConfirmPhaseResult> {
  let confirmSummary: ConfirmSummary | null = null;
  let storeDirty = staleCount > 0; // 过期条目待剪除
  let entries = confirmedEntries;
  if (options?.confirmSession) {
    const items = collectPendingConfirmations(
      producedEntries.map(e => ({ page: e.page, content: e.content })),
    );
    if (items.length > 0) {
      const decisions = await options.confirmSession(items);
      const byKey = new Map<string, ConfirmationDecision>(decisions.map(d => [d.key, d]));
      for (const entry of producedEntries) {
        entry.content = applyConfirmations(entry.content, byKey);
      }
      // 确认的 claim 持久化（v2 指纹条目）：符号解析唯一时存文件+哈希（文件
      // 不变则长期有效）；歧义名（0/多文件）退化为 HEAD-scoped，任何提交后
      // 过期重问。过期旧条目同时从 store 剪除。
      const resolvedClaims = decisions
        .filter(d => d.action === 'resolve' && d.kind === 'claim')
        .map(d => d.key.slice('claim\n'.length));
      let persisted = 0;
      if (resolvedClaims.length > 0) {
        const confirmedAt = new Date().toISOString();
        for (const raw of resolvedClaims) {
          entries = entries.filter(e => e.raw !== raw);
          entries.push(verify.fingerprintEntry(raw, repoHead, confirmedAt, hashOf));
        }
        persisted = resolvedClaims.length;
        storeDirty = true;
      }
      confirmSummary = {
        total: items.length,
        resolved: decisions.filter(d => d.action === 'resolve').length,
        kept: items.length - decisions.filter(d => d.action === 'resolve').length,
        persisted,
      };
    }
  }
  return { summary: confirmSummary, entries, dirty: storeDirty };
}
