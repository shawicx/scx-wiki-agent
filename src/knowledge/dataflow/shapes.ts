/**
 * 签名与类型形状推断（自 data-flow-shape.ts 拆出；纯搬移，零逻辑变化）。
 *
 * 承载：文本级括号/字符串扫描工具、图谱签名解析、实参字面量保守推断、
 * 返回类型归一与 void 解释、name@file 键与语言域判定。
 */

/** 表达式截断长度 */
export const DATA_FLOW_MAX_EXPRESSION = 120;

/** 图谱 Function/Method/Class 节点事实（file 为仓库相对路径，仅生产文件） */
export interface GraphSymbolFacts {
  name: string;
  file: string;
  label: string;
  signature?: string | null;
  returnType?: string | null;
  /** 图谱返回的 JSON 字符串数组（常为 null） */
  paramTypes?: string | null;
  paramNames?: string | null;
  startLine: number;
  endLine?: number;
  docstring?: string | null;
}

// ---------------------------------------------------------------------------
// 文本工具
// ---------------------------------------------------------------------------

const OPEN_BRACKETS = '([{<';
const CLOSE_BRACKETS = ')]}>';

/** 跳过字符串字面量与注释后的下一个有效字符下标（找不到返回 text.length） */
function skipNoise(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '/' && next === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    return i;
  }
  return i;
}

/** 跳过起始引号在 from 的字符串字面量，返回闭引号后一位 */
export function skipString(text: string, from: number): number {
  const quote = text[from];
  let i = from + 1;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === quote) return i + 1;
    i++;
  }
  return text.length;
}

/** 顶层分隔符切分（忽略括号与字符串内的分隔符） */
export function splitTopLevel(text: string, sep = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(text, i) - 1; continue; }
    if (OPEN_BRACKETS.includes(ch)) { depth++; continue; }
    if (CLOSE_BRACKETS.includes(ch)) { depth = Math.max(0, depth - 1); continue; }
    if (ch === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(p => p.trim()).filter(p => p.length > 0);
}

/** 顶层查找字符（忽略括号与字符串内） */
function topLevelIndexOf(text: string, target: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(text, i) - 1; continue; }
    if (OPEN_BRACKETS.includes(ch)) { depth++; continue; }
    if (CLOSE_BRACKETS.includes(ch)) { depth = Math.max(0, depth - 1); continue; }
    if (ch === target && depth === 0) return i;
  }
  return -1;
}

/** 默认值等号（排除 => / == / != / <= / >= 等比较与箭头） */
function defaultAssignIndex(text: string): number {
  let from = 0;
  for (;;) {
    const idx = topLevelIndexOf(text.slice(from), '=');
    if (idx < 0) return -1;
    const abs = from + idx;
    const prev = text[abs - 1];
    const next = text[abs + 1];
    if (next === '>' || next === '=' || prev === '=' || prev === '!' || prev === '<' || prev === '>') {
      from = abs + 1;
      continue;
    }
    return abs;
  }
}

export function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + '…' : oneLine;
}

/**
 * 极保守的实参字面量推断。只认字符串/数字/布尔/null/undefined/数组/对象字面量，
 * 其余返回 undefined —— 绝不猜测复杂表达式类型（方案 4.2）。
 */
export function inferLiteralShape(expression: string): string | undefined {
  const e = expression.trim();
  if (e.length === 0) return undefined;
  if (/^'(?:[^'\\]|\\.)*'$/.test(e) || /^"(?:[^"\\]|\\.)*"$/.test(e) || /^`[^`]*`$/.test(e)) return 'string';
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?n?$/.test(e)) return 'number';
  if (/^(?:true|false)$/.test(e)) return 'boolean';
  if (e === 'null') return 'null';
  if (e === 'undefined') return 'undefined';
  if (e.startsWith('[') && e.endsWith(']')) return 'array literal';
  if (e.startsWith('{') && e.endsWith('}')) return 'object literal';
  return undefined;
}

// ---------------------------------------------------------------------------
// 签名解析
// ---------------------------------------------------------------------------

export interface ParsedParam {
  name: string;
  type?: string;
  optional?: boolean;
  rest?: boolean;
}

export interface ParsedSignature {
  params: ParsedParam[];
  returnType?: string;
}

/** 图谱签名里的换行以字面 `\n` 两字符串存储，解析前归一为空格 */
export function normalizeGraphText(raw: string): string {
  return raw.replace(/\\[nrt]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 解析 `(a: string, b?: number): Promise<void>` 形态的签名文本（容忍换行与默认值） */
export function parseSignatureText(text: string): ParsedSignature | null {
  const open = findFirstParen(text);
  if (open < 0) return null;
  let depth = 0;
  let close = -1;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(text, i) - 1; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close < 0) return null;
  const paramsText = text.slice(open + 1, close);
  const params = splitTopLevel(paramsText)
    .map(parseParam)
    .filter((p): p is ParsedParam => p !== null);
  let returnType: string | undefined;
  const rest = text.slice(close + 1);
  // TS `: T` 与 Rust `-> T`（图谱常缺 Rust 返回类型，由源码签名回落补齐）
  const rm = rest.match(/^\s*(?::|->)\s*([^{=]+)/);
  if (rm) returnType = rm[1].trim().replace(/\s+/g, ' ');
  return { params, returnType };
}

/** 第一个不在字符串/注释内的 `(` */
function findFirstParen(text: string): number {
  let i = 0;
  while (i < text.length) {
    const at = skipNoise(text, i);
    if (at >= text.length) return -1;
    if (text[at] === '(') return at;
    i = at + 1;
  }
  return -1;
}

function parseParam(raw: string): ParsedParam | null {
  let s = raw.trim();
  if (s.length === 0) return null;
  s = s.replace(/^(?:public|private|protected|readonly|override|static|abstract)\s+/g, '');
  let rest = false;
  if (s.startsWith('...')) { rest = true; s = s.slice(3).trim(); }

  let name: string;
  let type: string | undefined;
  const colon = topLevelIndexOf(s, ':');
  if (colon >= 0) {
    name = s.slice(0, colon).trim();
    let t = s.slice(colon + 1).trim();
    const eq = defaultAssignIndex(t);
    if (eq >= 0) t = t.slice(0, eq).trim();
    type = t.length > 0 ? t.replace(/\s+/g, ' ') : undefined;
  } else {
    const eq = defaultAssignIndex(s);
    name = (eq >= 0 ? s.slice(0, eq) : s).trim();
  }

  let optional = false;
  if (name.endsWith('?')) { optional = true; name = name.slice(0, -1).trim(); }
  if (name.length === 0) return null;
  if (name.startsWith('{') || name.startsWith('[')) {
    optional = /[?]\s*[:=]/.test(s) || /[:=]\s*$/.test(name);
  }
  return { name, type, optional, rest };
}

/** 图谱 param_types/param_names 的 JSON 字符串 → 字符串数组（非法值返回空数组） */
export function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map(v => String(v)) : [];
  } catch {
    return [];
  }
}

/** CALLS 边 r.args → {expression, value}[]（兼容已解析数组 / JSON 字符串 / 空或非法值） */
export function parseEdgeArgs(raw: unknown): Array<{ expression: string; value?: string }> {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return [];
    try {
      list = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: Array<{ expression: string; value?: string }> = [];
  for (const item of list) {
    if (typeof item === 'string') {
      if (item.trim().length > 0) out.push({ expression: truncate(item, DATA_FLOW_MAX_EXPRESSION) });
      continue;
    }
    if (item === null || typeof item !== 'object') continue;
    const rec = item as { e?: unknown; v?: unknown };
    const expr = typeof rec.e === 'string' ? rec.e : '';
    if (expr.trim().length === 0) continue;
    const value = typeof rec.v === 'string' && rec.v.trim().length > 0
      ? truncate(rec.v, DATA_FLOW_MAX_EXPRESSION)
      : undefined;
    out.push({ expression: truncate(expr, DATA_FLOW_MAX_EXPRESSION), ...(value ? { value } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 返回类型归一与 void 解释
// ---------------------------------------------------------------------------

const VOID_RETURN_RE = /^(?::\s*)?(?:Promise\s*<\s*void\s*>|void)$/;

export function normalizeReturnType(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/^:\s*/, '');
  return t.length > 0 ? t.replace(/\s+/g, ' ') : undefined;
}

/** 非 void 才算「有业务返回值」（Promise<void> 只是异步完成信号） */
export function isVoidReturn(type: string | undefined): boolean {
  return type !== undefined && VOID_RETURN_RE.test(type);
}

function voidExplanation(type: string): string {
  return `${type}（异步完成信号，无业务返回值）`;
}

/** void/Promise<void> 的确定性解释（禁止 LLM 虚构 payload） */
export function explainReturnType(type: string): string {
  return isVoidReturn(type) ? voidExplanation(type) : type;
}

// ---------------------------------------------------------------------------
// 键与语言域
// ---------------------------------------------------------------------------

export function keyOf(name: string, file: string): string {
  return `${name}@${file}`;
}

/** `name@file` 反解（file 可能含 @，从最后一个 @ 切分不可靠 → 用首个 @ 之后的 name 长度） */
export function splitKey(key: string): { name: string; file: string } {
  const at = key.indexOf('@');
  return { name: key.slice(0, at), file: key.slice(at + 1) };
}

export function domainOf(file: string): string {
  if (/\.rs$/i.test(file)) return 'rust';
  if (/\.py$/i.test(file)) return 'python';
  if (/\.go$/i.test(file)) return 'go';
  if (/\.(?:java|kt|kts)$/i.test(file)) return 'jvm';
  return 'ts';
}
