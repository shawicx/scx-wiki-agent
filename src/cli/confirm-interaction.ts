/**
 * 待确认项交互会话（@clack/prompts）。
 *
 * 注入 WikiBuildOptions.confirmSession，在全部页面生成后、写盘前调用一次：
 * 逐项展示「疑问 + 上下文 + 选项」，用户裁决确认或保持。
 * 安全性：非 TTY（CI/管道/测试）直接返回空（全部保持待确认）；
 * Ctrl-C 中断时保留已裁决项，其余按保持处理。
 */

import * as p from '@clack/prompts';
import type { PendingConfirmation, ConfirmationDecision } from '../knowledge/confirmation.js';

/** 待确认项超过此数时先问一次「逐项 / 全部保持」（防 Marathon 会话） */
const BULK_THRESHOLD = 15;

const KIND_LABEL: Record<PendingConfirmation['kind'], string> = {
  claim: '断言',
  cell: '表格项',
  note: '降级说明',
  prose: '叙述',
};

export async function runConfirmationSession(
  items: PendingConfirmation[],
): Promise<ConfirmationDecision[]> {
  if (!process.stdout.isTTY || items.length === 0) return [];

  p.intro('scx-wiki-agent · 待确认项人工裁决（生成已完成，尚未写盘）');

  let queue = items;
  if (items.length > BULK_THRESHOLD) {
    const bulk = await p.select({
      message: `共 ${items.length} 项待确认，如何处理？`,
      options: [
        { value: 'each', label: '逐项裁决' },
        { value: 'keep-all', label: '全部保持待确认' },
      ],
    });
    if (p.isCancel(bulk)) {
      p.cancel('已取消，全部保持待确认');
      return [];
    }
    if (bulk === 'keep-all') {
      p.outro('全部保持待确认');
      return [];
    }
    queue = items;
  }

  const decisions: ConfirmationDecision[] = [];
  for (const item of queue) {
    const where = item.pages.length > 1
      ? `${item.pages.length} 页共 ${item.occurrences} 处`
      : `${item.pages[0]}${item.occurrences > 1 ? ` ×${item.occurrences} 处` : ''}`;
    const answer = await p.select({
      message: `[${KIND_LABEL[item.kind]}] ${item.text}`,
      options: [
        { value: 'resolve', label: resolveLabel(item.kind), hint: `${where} · ${item.context}` },
        { value: 'keep', label: '保持待确认' },
      ],
    });
    if (p.isCancel(answer)) {
      p.cancel(`已中断：此前 ${decisions.length} 项裁决保留，其余保持待确认`);
      break;
    }
    if (answer === 'keep') continue;

    // 需要补充内容的形态：cell/prose 必填，note 可选（留空=直接移除提示）
    let replacement: string | undefined;
    if (item.kind === 'cell' || item.kind === 'prose' || item.kind === 'note') {
      const text = await p.text({
        message: textPromptMessage(item.kind),
        placeholder: item.context,
        validate: v => {
          const value = typeof v === 'string' ? v : '';
          if (item.kind !== 'note' && value.trim().length === 0) return '必填';
          if (value.includes('\n')) return '仅支持单行';
          return undefined;
        },
      });
      if (p.isCancel(text)) continue; // 该项回退为保持
      replacement = String(text).trim();
      if (item.kind !== 'note' && replacement.length === 0) continue;
    }
    decisions.push({ key: item.key, kind: item.kind, action: 'resolve', replacement });
  }

  p.outro(`已裁决 ${decisions.length}/${items.length} 项（其余保持待确认）`);
  return decisions;
}

function resolveLabel(kind: PendingConfirmation['kind']): string {
  switch (kind) {
    case 'claim': return '确认为事实（移除标记）';
    case 'cell': return '填入确认内容';
    case 'note': return '已人工核实，移除提示';
    default: return '替换为确认表述';
  }
}

function textPromptMessage(kind: PendingConfirmation['kind']): string {
  switch (kind) {
    case 'prose': return '输入确认后的整行表述';
    case 'cell': return '输入该单元格的确认内容';
    default: return '输入补充说明（留空 = 直接移除提示行）';
  }
}
