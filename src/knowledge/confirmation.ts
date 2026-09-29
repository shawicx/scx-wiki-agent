/**
 * 待确认项交互裁决层：全部页面生成完成后、写盘前的批量人工确认（R5 闭环）。
 *
 * 待确认项四种形态（全 wiki 可 grep「待确认」定位）：
 * - claim：断言校验标注的 `` `标识符`（待确认） `` ——确认=移除标记，可持久化免标
 * - cell：fallback 表格单元 ⚠️ 待确认——确认=填入用户输入的确认内容
 * - note：块级降级说明（unconfirmedNote）——确认=移除提示行（或替换为补充说明）
 * - prose：LLM R5 自由文本待确认——确认=整行替换为用户输入的表述
 *
 * 交互会话由调用方注入（WikiBuildOptions.confirmSession，CLI 层用 @clack/prompts
 * 实现）；本模块只做确定性收集/应用/持久化，可独立单测。
 * 确认的 claim 持久化到 .scx-wiki-agent/confirmations.json，后续构建经
 * claim-verifier 的 confirmed 白名单自动免标（不再重复打扰）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

const CONFIRMATIONS_FILE = 'confirmations.json';
const CONTEXT_CAP = 120;

/** 断言校验标注形态：`raw`（待确认） */
const CLAIM_RE = /`([^`\n]+)`（待确认）/g;
/** fallback 表格单元标记（与 wiki-markers.ts 的 UNCONFIRMED_CELL 同源） */
const CELL_MARKER = '⚠️ 待确认';
/** 块级降级说明形态（unconfirmedNote 产物） */
const NOTE_RE = /^>\s*⚠️\s*\*\*待确认\*\*：(.*)$/;

/** note 行 → 展示主体（剥掉「（证据不足…」尾注） */
function noteText(noteBody: string): string {
  return noteBody.split('（证据不足')[0].trim();
}

/** 收集全部页面正文中的待确认项（跨页聚合去重，跳过 fenced 代码块） */
export function collectPendingConfirmations(
  pages: Array<{ page: string; content: string }>,
): PendingConfirmation[] {
  const byKey = new Map<string, PendingConfirmation>();
  for (const { page, content } of pages) {
    let inFence = false;
    for (const line of content.split('\n')) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      // 优先级：claim > note > cell > prose（一行可能命中多种，claim 最精确）
      let matched = false;
      for (const m of line.matchAll(CLAIM_RE)) {
        add(byKey, 'claim', m[1], line, page);
        matched = true;
      }
      const note = line.match(NOTE_RE);
      if (note) {
        add(byKey, 'note', noteText(note[1]), line, page);
        matched = true;
      }
      if (!matched && line.includes(CELL_MARKER)) {
        add(byKey, 'cell', cellLabel(line), line, page);
        matched = true;
      }
      if (!matched && line.includes('待确认')) {
        add(byKey, 'prose', line.trim().slice(0, 60), line, page);
      }
    }
  }
  return [...byKey.values()];
}

/** cell 行标识：表格行取首列（变量名等），非表格行取行首截断 */
function cellLabel(line: string): string {
  if (line.trim().startsWith('|')) {
    const first = line.split('|')[1]?.trim() ?? '';
    if (first.length > 0) return first;
  }
  return line.trim().slice(0, 40);
}

function add(
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

/** 应用裁决：返回改写后正文（keep 项与未裁决项原样保留） */
export function applyConfirmations(
  content: string,
  decisions: ReadonlyMap<string, ConfirmationDecision>,
): string {
  if (decisions.size === 0) return content;
  const outLines: string[] = [];
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      outLines.push(line);
      continue;
    }
    if (!inFence) {
      const rewritten = rewriteLine(line, decisions);
      if (rewritten !== null) {
        if (rewritten !== '') outLines.push(rewritten);
        continue;
      }
    }
    outLines.push(line);
  }
  return outLines.join('\n');
}

/** 单行改写（围栏外）；返回 null 表示无裁决命中（原样保留） */
function rewriteLine(
  line: string,
  decisions: ReadonlyMap<string, ConfirmationDecision>,
): string | null {
  // claim：resolve 才移除标记，keep/未裁决保留
  const claims = [...line.matchAll(CLAIM_RE)];
  if (claims.length > 0) {
    let out = line;
    for (const m of claims) {
      const d = decisions.get(`claim\n${m[1]}`);
      if (d?.action === 'resolve') {
        out = out.split(`\`${m[1]}\`（待确认）`).join(`\`${m[1]}\``);
      }
    }
    return out;
  }

  const note = line.match(NOTE_RE);
  if (note) {
    const d = decisions.get(`note\n${noteText(note[1])}`);
    if (d?.action === 'resolve') {
      return d.replacement && d.replacement.length > 0 ? `> ✅ ${d.replacement}` : '';
    }
    return null;
  }

  if (line.includes(CELL_MARKER)) {
    const d = decisions.get(`cell\n${cellLabel(line)}`);
    if (d?.action === 'resolve') {
      return line.split(CELL_MARKER).join(d.replacement?.trim() || '已确认');
    }
    return null;
  }

  if (line.includes('待确认')) {
    const d = decisions.get(`prose\n${line.trim().slice(0, 60)}`);
    if (d?.action === 'resolve' && d.replacement && d.replacement.length > 0) {
      return d.replacement;
    }
    return null;
  }

  return null;
}

// --- 持久化（仅 claim：机械移除标记可证安全，跨构建自动免标） ---

interface ConfirmationStore {
  version: 1;
  /** 已人工确认的 claim 原文（反引号内文本，claim-verifier 免标白名单） */
  confirmed: string[];
}

/** 读取确认白名单；文件缺失/损坏返回空集（fail-open，不阻断构建） */
export function loadConfirmedClaims(agentDir: string): Set<string> {
  try {
    const raw = JSON.parse(readFileSync(join(agentDir, CONFIRMATIONS_FILE), 'utf-8')) as ConfirmationStore;
    if (raw && raw.version === 1 && Array.isArray(raw.confirmed)) {
      return new Set(raw.confirmed.filter((s): s is string => typeof s === 'string'));
    }
  } catch {
    // 无文件/坏 JSON：按空集继续
  }
  return new Set();
}

/** 合并写入确认白名单（无新增条目时不写盘） */
export function saveConfirmedClaims(agentDir: string, claims: Iterable<string>): number {
  const existing = loadConfirmedClaims(agentDir);
  const before = existing.size;
  for (const c of claims) {
    if (typeof c === 'string' && c.length > 0) existing.add(c);
  }
  if (existing.size === before) return 0;
  try {
    mkdirSync(agentDir, { recursive: true });
    const store: ConfirmationStore = { version: 1, confirmed: [...existing].sort() };
    writeFileSync(join(agentDir, CONFIRMATIONS_FILE), JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // 写失败不阻断构建
  }
  return existing.size - before;
}
