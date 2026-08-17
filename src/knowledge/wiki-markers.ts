/**
 * 统一「待确认」标记（project-wiki「无法确认的信息写待确认，禁止猜测」）。
 *
 * 所有数据不足的降级说明统一走这里：全 wiki 可 grep「待确认」定位需人工补充处，
 * 替代此前散落在各 fallback 模板里的各式降级文案。
 */

/** 表格单元格用的短标记（用途/说明列数据不足时填充） */
export const UNCONFIRMED_CELL = '⚠️ 待确认';

/** 块级说明：what 描述缺什么证据、需人工补充什么 */
export function unconfirmedNote(what: string): string {
  return `> ⚠️ **待确认**：${what}（证据不足，禁止猜测；请人工补充后移除本标记）`;
}
