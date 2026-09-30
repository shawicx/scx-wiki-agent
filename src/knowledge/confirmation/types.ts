/** 待确认项共享类型（收集/应用/持久化三模块共用） */

export type PendingKind = 'claim' | 'cell' | 'note' | 'prose';

export interface PendingConfirmation {
  /** 聚合键：kind + '\n' + text */
  key: string;
  kind: PendingKind;
  /** 声明/疑问主体（claim=反引号内原文；cell=行标识；note=缺什么；prose=行文本截断） */
  text: string;
  /** 首次出现所在行原文（展示用，截断） */
  context: string;
  /** 出现的页面（跨页聚合） */
  pages: string[];
  /** 总出现次数 */
  occurrences: number;
}

export interface ConfirmationDecision {
  key: string;
  kind: PendingKind;
  /** resolve=确认（按 kind 语义应用改写）；keep=保持待确认 */
  action: 'resolve' | 'keep';
  /** cell/prose 必填；note 可选（有则替换提示行为补充说明）；claim 忽略 */
  replacement?: string;
}

const CONTEXT_CAP = 120;

/** fallback 表格单元标记（与 wiki-markers.ts 的 UNCONFIRMED_CELL 同源） */
export const CELL_MARKER = '⚠️ 待确认';

/** 块级降级说明形态（unconfirmedNote 产物） */
export const NOTE_RE = /^>\s*⚠️\s*\*\*待确认\*\*：(.*)$/;

/** note 行 → 展示主体（剥掉「（证据不足…」尾注） */
export function noteText(noteBody: string): string {
  return noteBody.split('（证据不足')[0].trim();
}

/** cell 行标识：最近表头 + 表格行首列（结构化 key，防跨表同首列误聚合）；非表格行取行首截断 */
export function cellLabel(line: string, lastTableHeader: string): string {
  const first = line.split('|')[1]?.trim() ?? '';
  const col = first.length > 0 ? first : line.trim().slice(0, 40);
  const header = lastTableHeader.replace(/^\||\|$/g, '').trim();
  return header.length > 0 ? `${header} · ${col}` : col;
}

export function addPending(
  byKey: Map<string, PendingConfirmation>,
  kind: PendingKind,
  text: string,
  contextLine: string,
  page: string,
): void {
  const key = `${kind}\n${text}`;
  const existing = byKey.get(key);
  if (existing) {
    existing.occurrences++;
    if (!existing.pages.includes(page)) existing.pages.push(page);
    return;
  }
  byKey.set(key, {
    key,
    kind,
    text,
    context: contextLine.trim().slice(0, CONTEXT_CAP),
    pages: [page],
    occurrences: 1,
  });
}
