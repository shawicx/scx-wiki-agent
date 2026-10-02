/**
 * IPC 对账摘要（构建报告）：把 Tauri IPC 扫描面的「口径局限」与「真孤儿」
 * 两侧对账结果透出，供人工核对页面断言与扫描盲区是否一致。
 *
 * 口径局限 = 空侧经二次裸检索命中（扫描假阴性嫌疑，页面须标「扫描口径局限」）；
 * 真孤儿 = 空侧裸检索也无命中（可如实断言「未被前端调用/无发射点」）。
 */

import type { IpcSurface } from './types.js';

export interface IpcConsistencySummary {
  /** 扫描口径局限条目（命令/事件名 + 侧），页面与报告必须口径一致 */
  scanLimit: string[];
  /** 二次检索确认的真孤儿（可断言不存在调用/发射） */
  unmatched: string[];
}

/** 从任一携带 ipc 字段的页面 context 汇总对账结果 */
export function summarizeIpcConsistency(contexts: Iterable<unknown>): IpcConsistencySummary | null {
  let ipc: IpcSurface | undefined;
  for (const ctx of contexts) {
    if (ctx && typeof ctx === 'object' && 'ipc' in (ctx as Record<string, unknown>)) {
      const v = (ctx as { ipc?: IpcSurface }).ipc;
      if (v && v.commands.length > 0) { ipc = v; break; }
    }
  }
  if (!ipc) return null;

  const scanLimit: string[] = [];
  const unmatched: string[] = [];
  for (const c of ipc.commands) {
    if (c.rustMissSuspect?.length) scanLimit.push(`${c.name}（Rust 定义未对齐）`);
    if (c.frontendMissSuspect?.length) scanLimit.push(`${c.name}（前端调用未对齐）`);
    if (c.rustDef === null && !c.rustMissSuspect?.length) unmatched.push(`${c.name}（仅前端调用）`);
    if (c.frontendCalls.length === 0 && c.rustDef !== null && !c.frontendMissSuspect?.length) {
      unmatched.push(`${c.name}（未被前端调用）`);
    }
  }
  for (const e of ipc.events) {
    if (e.emitMissSuspect?.length) scanLimit.push(`${e.name}（发射点未对齐）`);
    if (e.listenMissSuspect?.length) scanLimit.push(`${e.name}（监听点未对齐）`);
    if (e.emits.length === 0 && !e.emitMissSuspect?.length) unmatched.push(`${e.name}（无发射点）`);
    if (e.listeners.length === 0 && !e.listenMissSuspect?.length) unmatched.push(`${e.name}（无监听点）`);
  }
  return { scanLimit, unmatched };
}

/**
 * 收集 context 中所有「口径局限嫌疑」对象名（missSuspect 非空的命令/事件）——
 * 供质量闸门 unverified-absence 规则核验：正文若对这些名字下否定性结论即告警。
 */
export function collectAbsenceSuspectNames(ctx: unknown): Set<string> {
  const names = new Set<string>();
  const ipc = (ctx as { ipc?: IpcSurface } | null)?.ipc;
  if (!ipc) return names;
  for (const c of ipc.commands) {
    if (c.frontendMissSuspect?.length || c.rustMissSuspect?.length) names.add(c.name);
  }
  for (const e of ipc.events) {
    if (e.emitMissSuspect?.length || e.listenMissSuspect?.length) names.add(e.name);
  }
  return names;
}
