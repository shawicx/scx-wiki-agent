/**
 * 待确认项交互裁决层：全部页面生成完成后、写盘前的批量人工确认（R5 闭环）。
 *
 * 待确认项四种形态（全 wiki 可 grep「待确认」定位）：
 * - claim：断言校验标注的 `` `标识符`（待确认） `` ——确认=移除标记，可持久化免标
 * - cell：fallback/LLM 表格单元 ⚠️ 待确认——确认=填入用户输入的确认内容
 * - note：块级降级说明（unconfirmedNote）——确认=移除提示行（或替换为补充说明）
 * - prose：LLM R5 自由文本待确认——确认=整行替换为用户输入的表述
 *
 * 收集准入（防伪待办）：被引用的证据文本（源码注释/docstring/commit subject/
 * CLI help 摘录）常含「待确认」字样，但不是待裁决问题——
 * - claim 只认工具注入的 pending marker（`<!-- wiki:pending:claim:… -->`），
 *   被引用的格式说明原文（如 docstring 里引用的本模块注释）因无 marker 豁免；
 * - note 只认行首工具形态（`> ⚠️ **待确认**：`）；
 * - cell 只认表格行内的 ⚠️ 标记（key 带最近表头，防跨表撞名误聚合）；
 * - prose 只收非表格、非 `<details>` 证据块、非围栏内的正文行（实测证据
 *   引用全部出现在表格行）。
 *
 * marker 是会话期脚手架：applyConfirmations 消费后，写盘前由 wiki-service
 * 统一 stripPendingMarkers（keep 项的可见「待确认」文本保留）。
 * 用户输入的 replacement 先过 validateReplacement（拒绝密钥泄漏/残缺 Markdown），
 * 违规按 keep 处理。
 *
 * 交互会话由调用方注入（WikiBuildOptions.confirmSession，CLI 层用 @clack/prompts
 * 实现）；本模块只做确定性收集/应用/持久化，可独立单测。
 * 确认的 claim 持久化到 .scx-wiki-agent/confirmations.json，后续构建经
 * claim-verifier 的 confirmed 白名单自动免标（不再重复打扰）。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parsePendingMarkers, pendingMarker } from './wiki-markers.js';
import { findSecretDetail } from './wiki-quality-validator.js';

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

/** fallback 表格单元标记（与 wiki-markers.ts 的 UNCONFIRMED_CELL 同源） */
const CELL_MARKER = '⚠️ 待确认';
/** 块级降级说明形态（unconfirmedNote 产物） */
const NOTE_RE = /^>\s*⚠️\s*\*\*待确认\*\*：(.*)$/;

/** note 行 → 展示主体（剥掉「（证据不足…」尾注） */
function noteText(noteBody: string): string {
  return noteBody.split('（证据不足')[0].trim();
}

/** 收集全部页面正文中的待确认项（跨页聚合去重；跳过 fenced 代码块与 <details> 证据块） */
export function collectPendingConfirmations(
  pages: Array<{ page: string; content: string }>,
): PendingConfirmation[] {
  const byKey = new Map<string, PendingConfirmation>();
  for (const { page, content } of pages) {
    let inFence = false;
    let inDetails = false;
    let lastTableHeader = ''; // 最近表格表头行（cell 结构化 key 用）
    const lines = content.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (/^\s*<details\b/.test(line)) { inDetails = true; continue; }
      if (/<\/details>/.test(line)) { inDetails = false; continue; }
      if (inDetails) continue;

      const isTableRow = line.trim().startsWith('|');
      // 表头行跟踪：| 列名行 且下一行是 |---| 分隔行
      if (isTableRow && li + 1 < lines.length && /^\s*\|[\s:|-]*\|?\s*$/.test(lines[li + 1]) && !/^\s*\|[\s:|-]*\|?\s*$/.test(line)) {
        lastTableHeader = line.trim();
      }

      const markers = parsePendingMarkers(line);

      // claim：只认工具注入的 pending marker（被引用证据文本无 marker，天然豁免）
      let matched = false;
      for (const mk of markers) {
        if (mk.kind === 'claim' && mk.identity.length > 0) {
          add(byKey, 'claim', mk.identity, line, page);
          matched = true;
        }
      }

      // note：行首工具形态（unconfirmedNote 产物）；marker identity 优先
      const note = line.match(NOTE_RE);
      if (note) {
        const identity = markers.find(m => m.kind === 'note')?.identity ?? noteText(note[1] ?? '');
        add(byKey, 'note', identity, line, page);
        matched = true;
      }

      // cell：表格行内 ⚠️ 标记（key = 最近表头 + 行首列，防跨表撞名误聚合）
      if (!matched && isTableRow && line.includes(CELL_MARKER)) {
        add(byKey, 'cell', cellLabel(line, lastTableHeader), line, page);
        matched = true;
      }

      // prose：非表格正文行的「待确认」（LLM R5 自由文本；证据引用均在表格行）
      if (!matched && !isTableRow && line.includes('待确认')) {
        add(byKey, 'prose', line.trim().slice(0, 60), line, page);
      }
    }
  }
  return [...byKey.values()];
}

/** cell 行标识：最近表头 + 表格行首列（结构化 key，防跨表同首列误聚合）；非表格行取行首截断 */
function cellLabel(line: string, lastTableHeader: string): string {
  const first = line.split('|')[1]?.trim() ?? '';
  const col = first.length > 0 ? first : line.trim().slice(0, 40);
  const header = lastTableHeader.replace(/^\||\|$/g, '').trim();
  return header.length > 0 ? `${header} · ${col}` : col;
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

/** 应用裁决：返回改写后正文（keep 项与未裁决项原样保留；无效 replacement 按 keep 处理） */
export function applyConfirmations(
  content: string,
  decisions: ReadonlyMap<string, ConfirmationDecision>,
): string {
  if (decisions.size === 0) return content;
  const outLines: string[] = [];
  let inFence = false;
  let lastTableHeader = '';
  const lines = content.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      outLines.push(line);
      continue;
    }
    if (!inFence) {
      const isTableRow = line.trim().startsWith('|');
      if (isTableRow && li + 1 < lines.length && /^\s*\|[\s:|-]*\|?\s*$/.test(lines[li + 1]) && !/^\s*\|[\s:|-]*\|?\s*$/.test(line)) {
        lastTableHeader = line.trim();
      }
      const rewritten = rewriteLine(line, decisions, lastTableHeader);
      if (rewritten !== null) {
        if (rewritten !== '') outLines.push(rewritten);
        continue;
      }
    }
    outLines.push(line);
  }
  return outLines.join('\n');
}

/**
 * 用户输入的 replacement 安全校验：拒绝密钥泄漏、残缺 Markdown（反引号不配对）、
 * marker 注入与超长输入。返回违规原因，合规返回 null。
 */
export function validateReplacement(text: string): string | null {
  if (text.includes('<!--')) return '含 HTML 注释（禁止注入标记）';
  if (findSecretDetail(text)) return '疑似密钥/凭证内容';
  const ticks = (text.match(/`/g) ?? []).length;
  if (ticks % 2 !== 0) return '反引号不配对（inline code 残缺）';
  if (text.length > 600) return '过长（>600 字符）';
  return null;
}

/** 单行改写（围栏外）；返回 null 表示无裁决命中（原样保留，marker 由写盘前统一剥离） */
function rewriteLine(
  line: string,
  decisions: ReadonlyMap<string, ConfirmationDecision>,
  lastTableHeader: string,
): string | null {
  const markers = parsePendingMarkers(line);

  // claim：按 marker identity 裁决；resolve 移除可见标记与 marker
  const claimIds = markers.filter(m => m.kind === 'claim' && m.identity.length > 0).map(m => m.identity);
  if (claimIds.length > 0) {
    let out = line;
    for (const id of claimIds) {
      const d = decisions.get(`claim\n${id}`);
      if (d?.action === 'resolve') {
        out = out
          .split(`\`${id}\`（待确认）<!-- ${pendingMarker('claim', id)} -->`)
          .join(`\`${id}\``);
      }
    }
    return out;
  }

  const note = line.match(NOTE_RE);
  if (note) {
    const identity = markers.find(m => m.kind === 'note')?.identity ?? noteText(note[1] ?? '');
    const d = decisions.get(`note\n${identity}`);
    if (d?.action === 'resolve') {
      if (d.replacement && d.replacement.length > 0) {
        const violation = validateReplacement(d.replacement);
        return violation === null ? `> ✅ ${d.replacement}` : null;
      }
      return '';
    }
    return null;
  }

  if (line.includes(CELL_MARKER)) {
    const d = decisions.get(`cell\n${cellLabel(line, lastTableHeader)}`);
    if (d?.action === 'resolve') {
      const replacement = d.replacement?.trim() ?? '';
      if (replacement.length > 0 && validateReplacement(replacement) !== null) return null;
      return line.split(CELL_MARKER).join(replacement || '已确认');
    }
    return null;
  }

  if (line.includes('待确认')) {
    const d = decisions.get(`prose\n${line.trim().slice(0, 60)}`);
    if (d?.action === 'resolve' && d.replacement && d.replacement.length > 0) {
      return validateReplacement(d.replacement) === null ? d.replacement : null;
    }
    return null;
  }

  return null;
}

// --- 持久化（仅 claim：机械移除标记可证安全，跨构建自动免标） ---
// v2 条目带指纹（文件 + 内容哈希 + repo HEAD + 时间）：代码演进后同名可能
// 指向另一符号，指纹失配的确认自动过期重新裁决（绝不静默沿用）。
// 歧义名（符号解析到 0/多文件，如依赖名、跨文件同名）无稳定指纹，退化为
// HEAD-scoped：任何提交后过期重问。

/** 单条已确认 claim 的指纹条目 */
export interface ConfirmedEntry {
  /** claim 原文（会话键与白名单键，与 marker identity 一致） */
  raw: string;
  /** 确认时符号所在文件（symbolFiles 唯一命中时；否则 [] = HEAD-scoped） */
  files: string[];
  /** 对应文件内容 sha256（与 files 一一对应） */
  hashes: string[];
  /** 确认时 repo HEAD 短哈希（非 git 环境为 ''） */
  head: string;
  /** 确认时间（ISO 8601） */
  confirmedAt: string;
}

interface ConfirmationStoreV2 {
  version: 2;
  entries: ConfirmedEntry[];
}

/** 读取确认条目；文件缺失/损坏返回空集（fail-open，不阻断构建）。v1 旧格式
 *  （纯 raw 列表）迁移为无指纹条目（head=''）：git 仓库内下次构建过期重问一次。 */
export function loadConfirmedEntries(agentDir: string): ConfirmedEntry[] {
  try {
    const raw = JSON.parse(readFileSync(join(agentDir, CONFIRMATIONS_FILE), 'utf-8')) as unknown;
    if (raw && typeof raw === 'object') {
      const store = raw as { version?: number; entries?: unknown; confirmed?: unknown };
      if (store.version === 2 && Array.isArray(store.entries)) {
        return store.entries.filter((e): e is ConfirmedEntry =>
          e !== null && typeof e === 'object'
          && typeof (e as ConfirmedEntry).raw === 'string' && (e as ConfirmedEntry).raw.length > 0,
        );
      }
      if (store.version === 1 && Array.isArray(store.confirmed)) {
        return store.confirmed
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .map(raw => ({ raw, files: [], hashes: [], head: '', confirmedAt: '' }));
      }
    }
  } catch {
    // 无文件/坏 JSON：按空集继续
  }
  return [];
}

/** 全量写入条目（按 raw 去重由调用方保证）；写失败不阻断构建 */
export function saveConfirmedEntries(agentDir: string, entries: ConfirmedEntry[]): void {
  try {
    mkdirSync(agentDir, { recursive: true });
    const store: ConfirmationStoreV2 = {
      version: 2,
      entries: [...entries].sort((a, b) => a.raw.localeCompare(b.raw)),
    };
    writeFileSync(join(agentDir, CONFIRMATIONS_FILE), JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // 写失败不阻断构建
  }
}

export interface EntryEvaluation {
  /** 指纹仍有效、本次免标的 claim 原文集合 */
  validRaws: Set<string>;
  /** 指纹失配（过期）的条目：不再免标，重新进入待确认队列 */
  stale: ConfirmedEntry[];
}

/**
 * 指纹重校验（纯函数，hashOf 注入便于单测）：
 * - entry.head === 当前 HEAD → 有效（确认后未提交过变更）；
 * - 否则逐文件比对内容哈希，全部一致才有效（任一文件变更/删除/不可读 → 过期）；
 * - files 为空的 HEAD-scoped 条目在 HEAD 变化后即过期（歧义名不长期沿用）。
 */
export function evaluateConfirmedEntries(
  entries: ReadonlyArray<ConfirmedEntry>,
  head: string,
  hashOf: (file: string) => string | null,
): EntryEvaluation {
  const validRaws = new Set<string>();
  const stale: ConfirmedEntry[] = [];
  for (const entry of entries) {
    let valid = entry.head === head;
    if (!valid && entry.files.length > 0 && entry.hashes.length === entry.files.length) {
      valid = entry.files.every((f, i) => hashOf(f) === entry.hashes[i]);
    }
    if (valid) {
      validRaws.add(entry.raw);
    } else {
      stale.push(entry);
    }
  }
  return { validRaws, stale };
}

/** 当前 repo HEAD 短哈希（非 git 仓库/失败返回 ''，条目退化为 HEAD-scoped） */
export function currentHead(rootDir: string): string {
  try {
    return execFileSync('git', ['-C', rootDir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

/** 文件内容 sha256（hex）；读失败返回 null（视为指纹失配） */
export function hashFileContent(rootDir: string): (file: string) => string | null {
  return (file: string) => {
    try {
      const content = readFileSync(join(rootDir, file), 'utf-8');
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return null;
    }
  };
}
