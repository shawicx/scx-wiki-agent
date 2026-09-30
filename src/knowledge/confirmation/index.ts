/**
 * 待确认项交互裁决层：全部页面生成完成后、写盘前的批量人工确认（R5 闭环）。
 *
 * 待确认项四种形态（全 wiki 可 grep「待确认」定位）：
 * - claim：断言校验标注的 `` `标识符`（待确认） `` ——确认=移除标记，可持久化免标
 * - cell：fallback/LLM 表格单元 ⚠️ 待确认——确认=填入用户输入的确认内容
 * - note：块级降级说明（unconfirmedNote）——确认=移除提示行（或替换为补充说明）
 * - prose：LLM R5 自由文本待确认——确认=整行替换为用户输入的表述
 *
 * 交互会话由调用方注入（WikiBuildOptions.confirmSession，CLI 层用 @clack/prompts
 * 实现）；本模块只做确定性收集/应用/持久化，可独立单测。
 */

export type { PendingKind, PendingConfirmation, ConfirmationDecision } from './types.js';
export { collectPendingConfirmations } from './collect.js';
export { applyConfirmations, validateReplacement } from './apply.js';
export type { ConfirmedEntry, EntryEvaluation } from './store.js';
export {
  loadConfirmedEntries,
  saveConfirmedEntries,
  evaluateConfirmedEntries,
  currentHead,
  hashFileContent,
} from './store.js';
