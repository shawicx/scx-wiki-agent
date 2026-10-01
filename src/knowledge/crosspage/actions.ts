/**
 * 动作应用（确定性字符串手术，生成后、裁决前）：
 * - demote-data-flow：把 data-flow 正文替换为数据形态摘要 + calls.md 链接（保留数据统计与 I/O 表）
 * - fold-intent-tables：把 modules 页内与 keepAnchors 高重合的意图证据表折叠为一行指引
 */

import type { CrossPageAction } from './types.js';
import type { DataFlowContext } from '../types.js';

/** 意图证据表表头签名（fallback 与 LLM 均使用此列名） */
const INTENT_TABLE_HEADER = ['证据', '类型', '目标', '锚点'];

/**
 * data-flow 降级模板：保留确定性统计（阶段数/数据承载边/I/O 事件/类型定义），
 * 边表细节让位于 calls.md。ctx 缺失时退化为纯链接说明页。
 */
export function demoteDataFlow(content: string, ctx: unknown): string {
  const df = ctx as DataFlowContext | null;
  const lines: string[] = ['# 数据流（摘要）', ''];
  lines.push('> 本页检测到与 calls.md 的边表重复，已降级为数据形态摘要；完整控制流与调用可达性见 [calls.md](calls.md)。', '');
  if (df && df.shapeCoverage) {
    const c = df.shapeCoverage;
    lines.push('## 数据形态覆盖', '');
    lines.push(`- 数据阶段：${c.stages} 个（有确定类型形态 ${c.typedStages}，无形态证据 ${c.unknownStages}）`);
    lines.push(`- 转换边：${c.transitions} 条，其中带数据证据 ${c.dataBearingTransitions} 条（纯控制流 ${c.controlOnlyTransitions} 条不在此展开）`);
    lines.push(`- I/O 边界事件：${c.ioEvents} 个；本地类型定义：${c.typeDefinitions} 个`);
    lines.push('');
  }
  if (df && Array.isArray(df.stages) && df.stages.length > 0) {
    lines.push('## 数据阶段清单', '');
    lines.push('| 阶段 | 角色 | 位置 |');
    lines.push('| --- | --- | --- |');
    for (const s of df.stages.slice(0, 30)) {
      lines.push(`| \`${s.symbol}\` | ${s.role} | ${s.file}:${s.line} |`);
    }
    lines.push('');
  }
  if (df && Array.isArray(df.ioEvents) && df.ioEvents.length > 0) {
    lines.push('## I/O 边界事件', '');
    lines.push('| 事件 | 符号 | 位置 |');
    lines.push('| --- | --- | --- |');
    for (const e of df.ioEvents.slice(0, 30)) {
      lines.push(`| ${e.kind} | \`${e.symbol}\` | ${e.file}:${e.line} |`);
    }
    lines.push('');
  }
  void content;
  return lines.join('\n').trimEnd() + '\n';
}

/** 定位 content 中全部意图证据表的行区间（含表头与分隔行） */
function locateIntentTables(content: string): Array<{ start: number; end: number; anchors: Set<string> }> {
  const lines = content.split('\n');
  const out: Array<{ start: number; end: number; anchors: Set<string> }> = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const t = lines[i].trim();
    if (!t.startsWith('|')) continue;
    const header = t.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    if (header.join('|') !== INTENT_TABLE_HEADER.join('|')) continue;
    const next = (lines[i + 1] ?? '').trim();
    if (!/^\|[\s:|-]+\|?$/.test(next) || !next.includes('-')) continue;
    // 收集行直到非表格行
    let j = i + 2;
    const anchors = new Set<string>();
    for (; j < lines.length; j++) {
      const row = lines[j].trim();
      if (!row.startsWith('|')) break;
      const cells = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const a = cells[3];
      if (a && (a.includes(':') || a.startsWith('commit:'))) anchors.add(a);
    }
    out.push({ start: i, end: j, anchors });
    i = j - 1;
  }
  return out;
}

/**
 * modules 页意图证据表折叠：表中证据被 keepAnchors（architecture 页证据）覆盖 ≥70%
 * （包含度，非对称 jaccard——表小而基准大时按表自身覆盖率判定）的表替换为一行指引；
 * 覆盖率低的表（modules 特有证据）保留。
 */
export function foldIntentTables(content: string, keepAnchors: ReadonlySet<string>): string {
  const located = locateIntentTables(content);
  if (located.length === 0) return content;
  const lines = content.split('\n');
  const dropRanges = located.filter(loc => {
    if (loc.anchors.size === 0) return false;
    let covered = 0;
    for (const a of loc.anchors) if (keepAnchors.has(a)) covered++;
    return covered / loc.anchors.size >= 0.7;
  });
  if (dropRanges.length === 0) return content;
  const dropLines = new Set<number>();
  for (const r of dropRanges) {
    for (let i = r.start; i < r.end; i++) dropLines.add(i);
  }
  const out: string[] = [];
  let noteInserted = false;
  for (let i = 0; i < lines.length; i++) {
    if (dropLines.has(i)) {
      if (!noteInserted) {
        out.push('> 设计依据（意图证据）与 architecture.md 高度重合，已折叠；完整证据表见 [architecture.md](../02-architecture/architecture.md)。');
        noteInserted = true;
      }
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** 统一动作应用入口：返回改写后的 content（无匹配动作原样返回） */
export function applyCrossPageActions(
  content: string,
  context: unknown,
  page: string,
  actions: ReadonlyArray<CrossPageAction>,
): string {
  for (const action of actions) {
    if (action.page !== page) continue;
    if (action.kind === 'demote-data-flow') return demoteDataFlow(content, context);
    if (action.kind === 'fold-intent-tables') return foldIntentTables(content, action.keepAnchors);
  }
  return content;
}

