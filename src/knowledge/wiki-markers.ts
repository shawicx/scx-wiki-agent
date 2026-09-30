/**
 * 统一「待确认」标记（project-wiki「无法确认的信息写待确认，禁止猜测」）。
 *
 * 所有数据不足的降级说明统一走这里：全 wiki 可 grep「待确认」定位需人工补充处，
 * 替代此前散落在各 fallback 模板里的各式降级文案。
 *
 * Pending marker（--confirm 交互裁决用）：工具在标注点伴随可见文本注入
 * `<!-- wiki:pending:{kind}:{id} -->` HTML 注释。收集器只认 marker——
 * 被引用的证据文本（源码注释/docstring/commit subject 摘录）永不携带
 * marker，天然豁免确认队列（quoted evidence ≠ 待裁决问题）。
 * marker 是会话期脚手架，写盘前统一剥离（可见「待确认」文本保留）。
 */

/** 表格单元格用的短标记（用途/说明列数据不足时填充） */
export const UNCONFIRMED_CELL = '⚠️ 待确认';

/** 块级说明：what 描述缺什么证据、需人工补充什么（内嵌 pending marker） */
export function unconfirmedNote(what: string): string {
  return `> ⚠️ **待确认**：${what}（证据不足，禁止猜测；请人工补充后移除本标记）<!-- ${pendingMarker('note', what)} -->`;
}

// --- Pending marker（结构化脚手架） ---

export type PendingMarkerKind = 'claim' | 'cell' | 'note' | 'prose';

/** identity → 短 ID（base64url，无填充；长文本截断防超长注释） */
function encodeIdentity(identity: string): string {
  const capped = identity.length > 180 ? identity.slice(0, 180) : identity;
  return Buffer.from(capped, 'utf-8').toString('base64url');
}

/** 生成 pending marker 内容（不含 HTML 注释包裹；调用方自行 <!-- --> 包裹） */
export function pendingMarker(kind: PendingMarkerKind, identity: string): string {
  return `wiki:pending:${kind}:${encodeIdentity(identity)}`;
}

/** 解析行内全部 pending marker；返回 kind 与解码后的 identity */
export function parsePendingMarkers(line: string): Array<{ kind: PendingMarkerKind; identity: string }> {
  const out: Array<{ kind: PendingMarkerKind; identity: string }> = [];
  for (const m of line.matchAll(/<!--\s*wiki:pending:(claim|cell|note|prose):([\w-]+)\s*-->/g)) {
    let identity = '';
    try {
      identity = Buffer.from(m[2], 'base64url').toString('utf-8');
    } catch {
      identity = '';
    }
    out.push({ kind: m[1] as PendingMarkerKind, identity });
  }
  return out;
}

/** 判断行是否携带 pending marker（收集器准入判定：只认工具标注） */
export function hasPendingMarker(line: string): boolean {
  return /<!--\s*wiki:pending:(claim|cell|note|prose):[\w-]+\s*-->/.test(line);
}

/** 剥离全部 pending marker 脚手架（保留其余内容；写盘前调用） */
export function stripPendingMarkers(content: string): string {
  return content.replace(/<!--\s*wiki:pending:(claim|cell|note|prose):[\w-]+\s*-->/g, '');
}
