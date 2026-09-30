/**
 * 数据形态证据层（Data-flow 页的确定性数据源）。
 *
 * 背景：旧实现的 data-flow 页把 CALLS 调用边直接当数据流渲染，页面退化成 calls.md
 * 的复制品。本模块把「调用链」降级为路径与排序依据，另行采集真正的数据证据：
 *
 *   CALLS 边属性（r.line / r.args / confidence / strategy）
 *   + 图谱 Function/Method 签名（signature / return_type / param_types / end_line）
 *   + 源码签名回落与函数体范围识别
 *   + 本地 interface/type/enum/class 定义摘录
 *   + 函数体内的 I/O / 子进程 / 配置 / env 扫描
 *        ↓
 *   DataFlowStage[] / DataFlowTransition[] / DataIoEvent[] / DataTypeDefinition[]
 *        ↓
 *   LLM prompt（只叙述） / fallback（直接渲染确定性表格）
 *
 * 设计约束（对应方案第 17 节「明确不做的事情」）：
 * - 不引入 TypeScript Compiler API，不做通用类型推导；签名解析为括号/逗号级的正则+状态扫描。
 * - literal 形态只做极保守推断（字符串/数字/布尔/数组字面量/对象字面量），其余一律 unknown。
 * - unknown 绝不写成具体类型；无证据的阶段由 dataShapeKnown=false 诚实标注。
 * - I/O 事件必须落到具体 symbol 与行号，禁止「该模块会读文件」这类模块级归属。
 *
 * 纯函数：图谱事实与源码读取均由调用方注入，便于单测。
 */

import type {
  DataFlowStage,
  DataFlowTransition,
  DataIoEvent,
  DataTypeDefinition,
  DataFlowShapeCoverage,
  DataValueShape,
} from './types.js';

/** 阶段上限（表格与 prompt 预算） */
export const DATA_FLOW_MAX_STAGES = 24;
/** 带数据证据的转换边上限 */
export const DATA_FLOW_MAX_TRANSITIONS = 40;
/** I/O 边界事件上限 */
export const DATA_FLOW_MAX_IO_EVENTS = 30;
/** 类型定义条数上限 */
export const DATA_FLOW_MAX_TYPE_DEFS = 20;
/** 单条类型定义文本上限（字符） */
export const DATA_FLOW_MAX_TYPE_TEXT = 1200;
/** 表达式截断长度 */
export const DATA_FLOW_MAX_EXPRESSION = 120;
/** 无 end_line 且括号匹配失败时的函数体近似窗口（行） */
export const DATA_FLOW_BODY_FALLBACK_LINES = 80;

// ---------------------------------------------------------------------------
// 注入事实
// ---------------------------------------------------------------------------

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

/** 图谱类型定义节点事实（Interface / Type / Enum / Class） */
export interface GraphTypeFacts {
  name: string;
  label: string;
  file: string;
  startLine: number;
  endLine?: number;
}

/** CALLS 边事实（r.line 为调用点，calleeFile/calleeLine 为定义点） */
export interface TransitionFacts {
  caller: string;
  callerFile: string;
  callee: string;
  calleeFile: string;
  calleeLine: number;
  /** 调用点行号（r.line）；为 0 表示图谱未提供 */
  callLine: number;
  args: Array<{ expression: string; value?: string }>;
  confidence?: number;
  strategy?: string;
  /** 所属执行序列序号（入口排序） */
  sequenceIndex: number;
  /** BFS 深度 */
  depth: number;
  isEntry: boolean;
}

export interface DataFlowShapeInput {
  transitions: TransitionFacts[];
  symbols: GraphSymbolFacts[];
  typeNodes: GraphTypeFacts[];
  /** 读取源文件全文（仓库相对路径）；不可读返回 null */
  readSource: (file: string) => string | null;
  /** 生产文件判定（测试/fixture 一律不进 data-flow） */
  isProduction: (file: string) => boolean;
}

export interface DataFlowShapeResult {
  stages: DataFlowStage[];
  transitions: DataFlowTransition[];
  ioEvents: DataIoEvent[];
  typeDefinitions: DataTypeDefinition[];
  shapeCoverage: DataFlowShapeCoverage;
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
function skipString(text: string, from: number): number {
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

function truncate(text: string, max: number): string {
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
  const rm = rest.match(/^\s*:\s*([^{=]+)/);
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

/** 非业务类型关键字（不参与类型定义收集） */
const BUILTIN_TYPE_NAMES = new Set([
  'Promise', 'Array', 'ReadonlyArray', 'Record', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Partial', 'Required', 'Readonly', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable',
  'ReturnType', 'Parameters', 'Awaited', 'Iterable', 'AsyncIterable', 'Generator',
  'String', 'Number', 'Boolean', 'BigInt', 'Symbol', 'Object', 'Function', 'Date',
  'RegExp', 'Error', 'TypeError', 'JSON', 'Math', 'Buffer', 'Uint8Array', 'Uint8ClampedArray',
  'Vec', 'Option', 'Result', 'Box', 'HashMap', 'HashSet', 'BTreeMap', 'String', 'Arc', 'Rc',
  'string', 'number', 'boolean', 'unknown', 'any', 'never', 'void', 'object', 'undefined', 'null',
  'this', 'true', 'false', 'T', 'K', 'V', 'U', 'R', 'E', 'S', 'P', 'A', 'B', 'C', 'D', 'I', 'O',
]);

/**
 * 从类型文本中提取显式引用的大写开头类型名（含泛型容器递归展开：
 * `Promise<Array<WikiBuildOptions>>` → WikiBuildOptions）。
 */
export function extractReferencedTypeNames(type: string | undefined, budget = 12): string[] {
  if (!type) return [];
  const names = new Set<string>();
  for (const m of type.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const name = m[0];
    if (names.size >= budget) break;
    if (!/^[A-Z]/.test(name)) continue;
    if (BUILTIN_TYPE_NAMES.has(name)) continue;
    names.add(name);
  }
  // 泛型实参也参与（Promise<X> 里的 X 已被上面的循环覆盖，这里只补 <T> 形参位置）
  return [...names];
}

// ---------------------------------------------------------------------------
// I/O 与外部边界扫描（限定在符号函数体内）
// ---------------------------------------------------------------------------

interface IoRule {
  re: RegExp;
  kind: DataIoEvent['kind'];
  direction: DataIoEvent['direction'];
  /** 介质取自第 N 个实参（0 基） */
  mediumArg?: number;
  /** 介质为 env 变量名 */
  envName?: boolean;
}

const TS_IO_RULES: IoRule[] = [
  // 配置：包住 fs 读取的 JSON.parse 优先于普通 fs-read
  { re: /\bJSON\.parse\s*\(\s*(?:readFileSync|readFile)\s*\(/, kind: 'config', direction: 'input', mediumArg: 0 },
  { re: /\b(?:readFileSync|readFile|createReadStream|readJsonSync)\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:statSync|existsSync|accessSync|lstatSync)\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:readdirSync|opendirSync)\s*\(/, kind: 'directory-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:writeFileSync|appendFileSync|createWriteStream|copyFileSync|renameSync)\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\bmkdirSync\s*\(/, kind: 'directory-write', direction: 'output', mediumArg: 0 },
  { re: /\b(?:rmSync|rmdirSync|unlinkSync)\s*\(/, kind: 'remove', direction: 'output', mediumArg: 0 },
  { re: /\b(?:execFileSync|spawnSync)\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /(?<![\w.])exec\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /(?<![\w.])spawn\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /\bprocess\.stdout\.write\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\bconsole\.(?:log|warn|error|info|debug)\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\bprocess\.env\.([A-Za-z_][\w]*)/, kind: 'env', direction: 'input', envName: true },
  { re: /\bloadGlobalConfig\s*\(/, kind: 'config', direction: 'input' },
];

const RUST_IO_RULES: IoRule[] = [
  { re: /\b(?:fs|std::fs)::read_to_string\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\bFile::open\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:fs|std::fs)::read_dir\s*\(/, kind: 'directory-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:fs|std::fs)::write\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\bFile::create\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\b(?:fs|std::fs)::(?:create_dir_all|create_dir)\s*\(/, kind: 'directory-write', direction: 'output', mediumArg: 0 },
  { re: /\b(?:fs|std::fs)::remove_(?:file|dir_all|dir)\s*\(/, kind: 'remove', direction: 'output', mediumArg: 0 },
  { re: /\bCommand::new\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /\b(?:println|print|eprintln|eprint)!\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\b(?:env|std::env)::var\s*\(/, kind: 'env', direction: 'input', mediumArg: 0 },
];

/** 单行 I/O 规则扫描结果 */
interface IoHit {
  kind: DataIoEvent['kind'];
  direction: DataIoEvent['direction'];
  expression: string;
  medium?: string;
}

/** 读取调用点实参文本并定位闭括号（end = -1 表示同行未闭合，调用跨行） */
function readCallArgs(line: string, afterParen: number): { args: string[]; end: number } {
  let depth = 1;
  let end = -1;
  for (let i = afterParen; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(line, i) - 1; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  return { args: splitTopLevel(line.slice(afterParen, end < 0 ? line.length : end)), end };
}

/** 单行内检测 I/O 事件（可能多个；config 命中时抑制同一位置的 fs-read） */
export function detectIoEvents(line: string, domain: string): IoHit[] {
  const rules = domain === 'rust' ? RUST_IO_RULES : TS_IO_RULES;
  const hits: IoHit[] = [];
  const consumed = new Set<number>();
  for (const rule of rules) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    for (const m of line.matchAll(re)) {
      const at = m.index ?? 0;
      if (consumed.has(at)) continue;
      const matchEnd = at + m[0].length;
      // env：medium 为变量名（正则第 1 组）
      if (rule.envName) {
        hits.push({
          kind: rule.kind,
          direction: rule.direction,
          expression: truncate(m[0], DATA_FLOW_MAX_EXPRESSION),
          medium: m[1] ? `process.env.${m[1]}` : undefined,
        });
        consumed.add(at);
        continue;
      }
      // 表达式截到平衡闭括号为止（同行未闭合的跨行调用才退回行尾窗口）。
      // 多调用规则（如 JSON.parse(readFileSync(...)) ）取最外层调用的括号范围。
      const call = m[0].endsWith('(') ? readCallArgs(line, matchEnd) : null;
      const firstParen = m[0].indexOf('(');
      const outer = firstParen >= 0 && firstParen < m[0].length - 1
        ? readCallArgs(line, at + firstParen + 1)
        : call;
      const expression = (outer && outer.end >= 0
        ? line.slice(at, outer.end + 1)
        : line.slice(at, Math.min(line.length, matchEnd + 80))).trim();
      const args = call?.args ?? [];
      const medium = rule.mediumArg !== undefined ? args[rule.mediumArg] : undefined;
      hits.push({
        kind: rule.kind,
        direction: rule.direction,
        expression: truncate(expression, DATA_FLOW_MAX_EXPRESSION),
        ...(medium ? { medium: truncate(medium, DATA_FLOW_MAX_EXPRESSION) } : {}),
      });
      consumed.add(at);
      // 同位置的普通 fs-read 被 config 规则取代
      if (rule.kind === 'config') {
        for (const other of rules) {
          const otherRe = new RegExp(other.re.source, 'g');
          for (const om of line.matchAll(otherRe)) {
            if ((om.index ?? 0) >= at && (om.index ?? 0) < matchEnd) consumed.add(om.index ?? 0);
          }
        }
      }
      break;
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 函数体范围与源码签名回落
// ---------------------------------------------------------------------------

interface BodyRange {
  /** 0 基起始行（含） */
  from: number;
  /** 0 基结束行（含） */
  to: number;
  approximated: boolean;
  /** 定义行文本（源码回落签名解析用） */
  definitionText: string;
}

/** 按语言域生成定义行探测正则（源码回落，仅对已知文件做名字驱动扫描） */
function definitionPatterns(name: string, domain: string): RegExp[] {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (domain === 'rust') {
    return [
      new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:async\\s+)?fn\\s+${n}\\b`),
      new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:struct|enum|trait)\\s+${n}\\b`),
    ];
  }
  return [
    new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?(?:async\\s+)?function\\s+${n}\\b`),
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${n}\\s*[:=]`),
    new RegExp(`^\\s*(?:public|private|protected|static|async|override|readonly|abstract|\\*|\\s)*${n}\\s*(?:<[^>]*>)?\\s*\\(`),
    new RegExp(`^\\s*(?:export\\s+)?(?:abstract\\s+)?class\\s+${n}\\b`),
    new RegExp(`^\\s*(?:export\\s+)?(?:type|interface|enum)\\s+${n}\\b`),
  ];
}

function findDefinitionIndex(lines: string[], name: string, domain: string, from = 0): number {
  const patterns = definitionPatterns(name, domain);
  for (let i = from; i < lines.length; i++) {
    if (!lines[i].includes(name)) continue;
    for (const re of patterns) {
      if (re.test(lines[i])) return i;
    }
  }
  return -1;
}

/** 从定义行起做括号匹配确定函数体范围（失败则按行数窗口近似） */
function resolveBodyRange(
  lines: string[],
  definitionIndex: number,
  graphEndLine?: number,
): BodyRange {
  const definitionText = lines.slice(definitionIndex, Math.min(lines.length, definitionIndex + 6)).join('\n');
  if (graphEndLine !== undefined && graphEndLine > definitionIndex + 1) {
    return { from: definitionIndex, to: Math.min(lines.length - 1, graphEndLine - 1), approximated: false, definitionText };
  }
  // 从定义行起找函数体起始 `{`（最多向后 6 行，跳过签名换行）
  let depth = 0;
  let started = false;
  const hardEnd = Math.min(lines.length - 1, definitionIndex + DATA_FLOW_BODY_FALLBACK_LINES);
  for (let i = definitionIndex; i <= hardEnd; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === "'" || ch === '"' || ch === '`') { c = skipString(line, c) - 1; continue; }
      if (ch === '/' && line[c + 1] === '/') break;
      if (ch === '{') { depth++; started = true; continue; }
      if (ch === '}') {
        depth--;
        if (started && depth === 0) {
          return { from: definitionIndex, to: i, approximated: false, definitionText };
        }
      }
    }
  }
  return {
    from: definitionIndex,
    to: hardEnd,
    approximated: true,
    definitionText,
  };
}

/** 返回值字面量形态（源码保守扫描；仅字面量，不推导表达式类型） */
function findReturnLiteral(lines: string[], from: number, to: number): { expression: string; type: string } | undefined {
  for (let i = from; i <= to && i < lines.length; i++) {
    const m = lines[i].match(/\breturn\s+([^;\n]+)/);
    if (!m) continue;
    const expr = m[1].trim();
    const type = inferLiteralShape(expr);
    if (type) return { expression: truncate(expr, DATA_FLOW_MAX_EXPRESSION), type };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const VOID_RETURN_RE = /^(?::\s*)?(?:Promise\s*<\s*void\s*>|void)$/;

function normalizeReturnType(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().replace(/^:\s*/, '');
  return t.length > 0 ? t.replace(/\s+/g, ' ') : undefined;
}

/** 非 void 才算「有业务返回值」（Promise<void> 只是异步完成信号） */
function isVoidReturn(type: string | undefined): boolean {
  return type !== undefined && VOID_RETURN_RE.test(type);
}

function voidExplanation(type: string): string {
  return `${type}（异步完成信号，无业务返回值）`;
}

/** void/Promise<void> 的确定性解释（禁止 LLM 虚构 payload） */
export function explainReturnType(type: string): string {
  return isVoidReturn(type) ? voidExplanation(type) : type;
}

const IO_INPUT_KINDS = new Set<DataIoEvent['kind']>(['fs-read', 'directory-read', 'config', 'env', 'http', 'ipc', 'db']);
const IO_OUTPUT_KINDS = new Set<DataIoEvent['kind']>(['fs-write', 'directory-write', 'remove', 'stdout']);

const LABEL_TO_TYPE_KIND: Record<string, DataTypeDefinition['kind'] | undefined> = {
  Interface: 'interface',
  Type: 'type',
  Enum: 'enum',
  Class: 'class',
};

interface StageFacts {
  key: string;
  name: string;
  file: string;
  startLine: number;
  /** 函数体范围（0 基，含端点）；无函数体（类/接口/不可读文件）时为 null */
  bodyFrom: number;
  bodyTo: number;
  params: ParsedParam[];
  returnType?: string;
  signatureEvidence?: DataValueShape['evidence'];
  isEntry: boolean;
  isTerminal: boolean;
  sequenceIndex: number;
  depth: number;
  callLine: number;
  ioEvents: DataIoEvent[];
  approximated: boolean;
}

export function collectDataFlowShapes(input: DataFlowShapeInput): DataFlowShapeResult {
  const sourceCache = new Map<string, string[] | null>();
  const readLines = (file: string): string[] | null => {
    if (sourceCache.has(file)) return sourceCache.get(file) ?? null;
    const src = input.readSource(file);
    const lines = src === null ? null : src.split('\n');
    sourceCache.set(file, lines);
    return lines;
  };

  // 1. 事实索引（name@file 双键，防同名跨文件污染）
  const symbolIndex = new Map<string, GraphSymbolFacts>();
  for (const s of input.symbols) {
    if (!input.isProduction(s.file)) continue;
    symbolIndex.set(keyOf(s.name, s.file), s);
  }
  const typeNodeIndex = new Map<string, GraphTypeFacts[]>();
  for (const t of input.typeNodes) {
    if (!input.isProduction(t.file)) continue;
    const list = typeNodeIndex.get(t.name) ?? [];
    list.push(t);
    typeNodeIndex.set(t.name, list);
  }

  // 2. 转换边（生产文件 + 去重）
  const seenTransition = new Set<string>();
  const transitions: DataFlowTransition[] = [];
  const orderedFacts: TransitionFacts[] = [];
  for (const t of input.transitions) {
    if (!input.isProduction(t.callerFile) || !input.isProduction(t.calleeFile)) continue;
    const dedupKey = `${keyOf(t.caller, t.callerFile)}->${keyOf(t.callee, t.calleeFile)}:${t.callerFile}:${t.callLine}`;
    if (seenTransition.has(dedupKey)) continue;
    seenTransition.add(dedupKey);
    orderedFacts.push(t);
  }

  // 3. 符号排序键与调用点行
  interface OrderInfo { sequenceIndex: number; depth: number; callLine: number; firstSeen: number; isEntry: boolean }
  const order = new Map<string, OrderInfo>();
  const calleeKeys = new Set<string>();
  orderedFacts.forEach((t, i) => {
    const callerKey = keyOf(t.caller, t.callerFile);
    const calleeKey = keyOf(t.callee, t.calleeFile);
    calleeKeys.add(calleeKey);
    const bump = (key: string, isCaller: boolean) => {
      const prev = order.get(key);
      const next: OrderInfo = {
        sequenceIndex: Math.min(prev?.sequenceIndex ?? Number.MAX_SAFE_INTEGER, t.sequenceIndex),
        depth: Math.min(prev?.depth ?? Number.MAX_SAFE_INTEGER, t.depth),
        callLine: isCaller && t.callLine > 0
          ? Math.min(prev?.callLine && prev.callLine > 0 ? prev.callLine : Number.MAX_SAFE_INTEGER, t.callLine)
          : (prev?.callLine ?? 0),
        firstSeen: Math.min(prev?.firstSeen ?? Number.MAX_SAFE_INTEGER, i),
        isEntry: (prev?.isEntry ?? false) || (isCaller && t.isEntry),
      };
      order.set(key, next);
    };
    bump(callerKey, true);
    bump(calleeKey, false);
  });

  // 4. 逐符号解析事实（签名/函数体/I-O）
  const stageFacts = new Map<string, StageFacts>();
  for (const [key, ord] of order) {
    const { name, file } = splitKey(key);
    const graph = symbolIndex.get(key);
    const lines = readLines(file);
    const domain = domainOf(file);

    let definitionIndex = graph && graph.startLine > 0 ? graph.startLine - 1 : -1;
    let signatureEvidence: DataValueShape['evidence'] | undefined;
    let parsed: ParsedSignature | null = null;

    if (graph?.signature && graph.signature.trim().length > 0) {
      parsed = parseSignatureText(normalizeGraphText(graph.signature)) ?? { params: [] };
      signatureEvidence = 'graph-signature';
      const graphParams = parseJsonStringArray(graph.paramTypes);
      const graphNames = parseJsonStringArray(graph.paramNames);
      parsed.params = parsed.params.map((p, i) => ({
        ...p,
        ...(p.type === undefined && graphParams[i] ? { type: graphParams[i] } : {}),
        ...(p.name.length === 0 && graphNames[i] ? { name: graphNames[i] } : {}),
      }));
    }

    let bodyRange: BodyRange | null = null;
    if (lines && definitionIndex >= 0 && definitionIndex < lines.length) {
      bodyRange = resolveBodyRange(lines, definitionIndex, graph?.endLine);
    } else if (lines) {
      definitionIndex = findDefinitionIndex(lines, name, domain);
      if (definitionIndex >= 0) bodyRange = resolveBodyRange(lines, definitionIndex, graph?.endLine);
    }
    // 源码签名回落：图谱 signature 缺失时整体回落；
    // 图谱只有参数列表（return_type 常缺 void）时，仅补返回类型，参数仍以图谱为准
    const sourceParsed = bodyRange ? parseSignatureText(bodyRange.definitionText) : null;
    if (!parsed && sourceParsed) {
      parsed = sourceParsed;
      if (sourceParsed.params.length > 0 || sourceParsed.returnType) signatureEvidence = 'source-signature';
    }
    if (parsed && !parsed.returnType && sourceParsed?.returnType) {
      parsed.returnType = sourceParsed.returnType;
    }

    const params = parsed?.params ?? [];
    const returnType = normalizeReturnType(graph?.returnType) ?? parsed?.returnType;

    // I/O 扫描：严格限定该符号函数体内（类/接口节点不做函数体扫描，防整类归属）
    const functionLike = graph === undefined || graph.label === 'Function' || graph.label === 'Method';
    const ioEvents: DataIoEvent[] = [];
    if (lines && bodyRange && functionLike) {
      for (let i = bodyRange.from; i <= bodyRange.to && i < lines.length; i++) {
        for (const hit of detectIoEvents(lines[i], domain)) {
          ioEvents.push({
            kind: hit.kind,
            symbol: name,
            file,
            line: i + 1,
            expression: hit.expression,
            ...(hit.medium ? { medium: hit.medium } : {}),
            direction: hit.direction,
            ...(bodyRange.approximated ? { approximated: true } : {}),
          });
        }
      }
    }

    stageFacts.set(key, {
      key,
      name,
      file,
      startLine: definitionIndex >= 0 ? definitionIndex + 1 : (graph?.startLine ?? 0),
      bodyFrom: functionLike && bodyRange ? bodyRange.from : -1,
      bodyTo: functionLike && bodyRange ? bodyRange.to : -1,
      params,
      returnType,
      signatureEvidence,
      isEntry: ord.isEntry,
      isTerminal: !calleeKeys.has(key) || !orderedFacts.some(t => keyOf(t.caller, t.callerFile) === key),
      sequenceIndex: ord.sequenceIndex,
      depth: ord.depth,
      callLine: ord.callLine,
      ioEvents,
      approximated: bodyRange?.approximated ?? false,
    });
  }

  // 5. 入边实参索引
  const incomingArgs = new Map<string, TransitionFacts[]>();
  for (const t of orderedFacts) {
    const key = keyOf(t.callee, t.calleeFile);
    const list = incomingArgs.get(key) ?? [];
    list.push(t);
    incomingArgs.set(key, list);
  }

  // 6. 阶段构建（只有带数据形态证据的符号成阶段）
  const stages: DataFlowStage[] = [];
  for (const facts of [...stageFacts.values()].sort(compareStageFacts)) {
    const inEdges = incomingArgs.get(facts.key) ?? [];
    const stage = buildStage(facts, inEdges, readLines);
    if (stage === null) continue;
    stages.push(stage);
    if (stages.length >= DATA_FLOW_MAX_STAGES) break;
  }
  const stageKeys = new Set(stages.map(s => keyOf(s.symbol, s.file)));

  // 7. 转换边：仅保留有数据证据者（纯控制流边只计数）
  let controlOnly = 0;
  for (const t of orderedFacts) {
    const callerKey = keyOf(t.caller, t.callerFile);
    const calleeKey = keyOf(t.callee, t.calleeFile);
    const calleeFacts = stageFacts.get(calleeKey);
    const callerFacts = stageFacts.get(callerKey);
    const calleeDefinition = calleeFacts
      ? `${calleeFacts.file}:${calleeFacts.startLine}`
      : `${t.calleeFile}:${t.calleeLine}`;
    const args: DataValueShape[] = t.args.map(a => ({
      expression: a.expression,
      ...(literalTypeOf(a) ? { type: literalTypeOf(a) } : {}),
      evidence: 'call-argument' as const,
      ...(t.callLine > 0 ? { anchor: `${t.callerFile}:${t.callLine}` } : {}),
    }));
    const hasDataEvidence = args.length > 0
      || (calleeFacts?.params.some(p => p.type !== undefined) ?? false)
      || (calleeFacts?.returnType !== undefined && !isVoidReturn(calleeFacts.returnType))
      || (callerFacts?.ioEvents.length ?? 0) > 0
      || (calleeFacts?.ioEvents.length ?? 0) > 0;
    // 转换边两端至少有一端是数据阶段，页面才自洽（否则只出现在路径解释里）
    const touchesStage = stageKeys.has(callerKey) || stageKeys.has(calleeKey);
    if (!hasDataEvidence || !touchesStage) {
      controlOnly++;
      continue;
    }
    if (transitions.length >= DATA_FLOW_MAX_TRANSITIONS) continue;
    transitions.push({
      from: t.caller,
      to: t.callee,
      fromFile: t.callerFile,
      toFile: t.calleeFile,
      callFile: t.callerFile,
      callLine: t.callLine,
      args,
      calleeDefinition,
      ...(t.confidence !== undefined ? { confidence: t.confidence } : {}),
      ...(t.strategy ? { strategy: t.strategy } : {}),
    });
  }
  transitions.sort((a, b) => {
    if (a.callFile !== b.callFile) return a.callFile < b.callFile ? -1 : 1;
    if (a.callLine !== b.callLine) return a.callLine - b.callLine;
    return a.to < b.to ? -1 : a.to > b.to ? 1 : 0;
  });

  // 8. I/O 事件（只保留成阶段符号的事件，避免控制流载体污染）
  const ioEvents: DataIoEvent[] = [];
  for (const facts of [...stageFacts.values()].sort(compareStageFacts)) {
    if (!stageKeys.has(facts.key)) continue;
    for (const ev of facts.ioEvents) {
      if (ioEvents.length >= DATA_FLOW_MAX_IO_EVENTS) break;
      ioEvents.push(ev);
    }
  }

  // 9. 类型定义（阶段签名显式引用优先，其后补齐阶段文件内的本地类型）
  const stageFiles = new Set(stages.map(s => s.file));
  const referenced = new Set<string>();
  for (const facts of stageFacts.values()) {
    if (!stageKeys.has(facts.key)) continue;
    for (const p of facts.params) for (const n of extractReferencedTypeNames(p.type)) referenced.add(n);
    for (const n of extractReferencedTypeNames(facts.returnType)) referenced.add(n);
  }
  const typeDefinitions = collectTypeDefinitions(referenced, typeNodeIndex, stageFiles, readLines);

  // 10. 覆盖率
  const typedStages = stages.filter(s => s.inputs.some(isTypedShape) || s.outputs.some(isTypedShape)).length;
  const shapeCoverage: DataFlowShapeCoverage = {
    symbolsConsidered: stageFacts.size,
    stages: stages.length,
    transitions: transitions.length,
    dataBearingTransitions: transitions.length,
    controlOnlyTransitions: controlOnly,
    ioEvents: ioEvents.length,
    typedStages,
    unknownStages: stages.filter(s => !s.dataShapeKnown).length,
    typeDefinitions: typeDefinitions.length,
    approximatedBodies: stages.filter(s => (stageFacts.get(keyOf(s.symbol, s.file))?.approximated ?? false)).length,
  };

  return { stages, transitions, ioEvents, typeDefinitions, shapeCoverage };
}

function isTypedShape(shape: DataValueShape): boolean {
  return shape.type !== undefined
    && shape.evidence !== 'unknown'
    && shape.evidence !== 'literal';
}

/** 实参字面量形态：优先按源码表达式推断（引号保留），再用图谱解析值兜底 */
function literalTypeOf(arg: { expression: string; value?: string }): string | undefined {
  return inferLiteralShape(arg.expression) ?? (arg.value ? inferLiteralShape(arg.value) : undefined);
}

function buildStage(
  facts: StageFacts,
  inEdges: TransitionFacts[],
  readLines: (file: string) => string[] | null,
): DataFlowStage | null {
  const inputs: DataValueShape[] = [];
  const evidenceKinds = new Set<DataFlowStage['evidenceKinds'][number]>();

  // 输入 1：入边 CALLS.args（表达式 + callee 形参类型）；实参为字面量时保守给类型
  for (const t of inEdges) {
    if (t.args.length === 0) continue;
    evidenceKinds.add('call-argument');
    t.args.forEach((a, i) => {
      const param = facts.params[i];
      const literal = literalTypeOf(a);
      const type = param?.type ?? literal;
      inputs.push({
        expression: a.expression,
        ...(type ? { type } : {}),
        evidence: param?.type ? 'call-argument' : (literal ? 'literal' : 'call-argument'),
        ...(t.callLine > 0 ? { anchor: `${t.callerFile}:${t.callLine}` } : {}),
      });
    });
  }

  // 输入 2：函数签名参数类型（无实参时至少给出接收形态）
  if (inputs.length === 0) {
    for (const p of facts.params) {
      if (!p.type) continue;
      inputs.push({
        expression: p.name,
        type: p.type,
        evidence: facts.signatureEvidence ?? 'source-signature',
        ...(facts.startLine > 0 ? { anchor: `${facts.file}:${facts.startLine}` } : {}),
      });
    }
  }

  // 输入 3：函数体内 I/O 输入（同 kind 只留一条代表，防同类 I/O 刷满单元格）
  if (inputs.length === 0) {
    const seenKind = new Set<DataIoEvent['kind']>();
    for (const ev of facts.ioEvents) {
      if (!IO_INPUT_KINDS.has(ev.kind) || seenKind.has(ev.kind)) continue;
      seenKind.add(ev.kind);
      inputs.push({ expression: ev.expression, evidence: 'io', anchor: `${ev.file}:${ev.line}` });
      if (seenKind.size >= 2) break;
    }
  }

  const hasSignature = facts.signatureEvidence !== undefined;
  if (hasSignature) evidenceKinds.add('signature');

  const outputs: DataValueShape[] = [];
  // 输出 1：显式返回类型
  if (facts.returnType) {
    evidenceKinds.add('return');
    outputs.push({
      type: facts.returnType,
      evidence: facts.signatureEvidence === 'graph-signature' ? 'graph-signature' : 'source-signature',
      anchor: `${facts.file}:${facts.startLine}`,
    });
  }
  // 输出 2：return 字面量（保守；限定函数体内）
  if (outputs.length === 0 && facts.bodyFrom >= 0) {
    const lines = readLines(facts.file);
    if (lines) {
      const literal = findReturnLiteral(lines, facts.bodyFrom, Math.min(lines.length - 1, facts.bodyTo));
      if (literal) {
        outputs.push({
          expression: literal.expression,
          type: literal.type,
          evidence: 'literal',
          anchor: `${facts.file}:${facts.startLine}`,
        });
      }
    }
  }
  // 输出 3：函数体内 I/O 输出（同 kind 只留一条代表）
  if (outputs.length === 0) {
    const seenKind = new Set<DataIoEvent['kind']>();
    for (const ev of facts.ioEvents) {
      if ((!IO_OUTPUT_KINDS.has(ev.kind) && ev.kind !== 'process') || seenKind.has(ev.kind)) continue;
      seenKind.add(ev.kind);
      outputs.push({ expression: ev.expression, evidence: 'io', anchor: `${ev.file}:${ev.line}` });
      if (seenKind.size >= 2) break;
    }
  }
  if (facts.ioEvents.length > 0) evidenceKinds.add('io');

  // 阶段资格（方案 8.1 + 10）：签名只有在带参数类型或非 void 返回类型时才算数据证据；
  // 无任何数据形态证据的中间调用载体不成阶段（只保留在路径中）
  const hasTypedParams = facts.params.some(p => p.type !== undefined);
  const hasBusinessReturn = facts.returnType !== undefined && !isVoidReturn(facts.returnType);
  const hasAnyEvidence = hasTypedParams
    || hasBusinessReturn
    || inEdges.some(t => t.args.length > 0)
    || facts.ioEvents.length > 0
    || facts.isEntry
    || facts.isTerminal;
  if (!hasAnyEvidence) return null;

  const role = resolveRole(facts);
  const dataShapeKnown = inputs.some(s => s.evidence !== 'unknown') && outputs.some(s => s.evidence !== 'unknown');

  return {
    id: `${facts.name}@${facts.file}`,
    name: facts.name,
    role,
    symbol: facts.name,
    file: facts.file,
    line: facts.startLine,
    inputs: dedupeShapes(inputs).slice(0, 6),
    outputs: dedupeShapes(outputs).slice(0, 6),
    evidenceKinds: [...evidenceKinds],
    dataShapeKnown,
  };
}

function dedupeShapes(shapes: DataValueShape[]): DataValueShape[] {
  const seen = new Set<string>();
  const out: DataValueShape[] = [];
  for (const s of shapes) {
    const k = `${s.expression ?? ''}|${s.type ?? ''}|${s.evidence}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function resolveRole(facts: StageFacts): DataFlowStage['role'] {
  if (facts.isEntry) return 'entry';
  const kinds = new Set(facts.ioEvents.map(e => e.kind));
  for (const k of kinds) if (IO_INPUT_KINDS.has(k)) return 'io-boundary';
  if (kinds.has('process')) return 'external-process';
  for (const k of kinds) if (IO_OUTPUT_KINDS.has(k)) return 'output';
  return 'transform';
}

/** 类型定义收集：显式引用优先，其后补齐阶段文件内的本地类型；每类 ≤1200 字符、全页 ≤20 条 */
function collectTypeDefinitions(
  referenced: ReadonlySet<string>,
  typeNodeIndex: Map<string, GraphTypeFacts[]>,
  stageFiles: ReadonlySet<string>,
  readLines: (file: string) => string[] | null,
): DataTypeDefinition[] {
  const out: DataTypeDefinition[] = [];
  const emitted = new Set<string>();

  const emit = (node: GraphTypeFacts, referencedBySignature: boolean): void => {
    if (out.length >= DATA_FLOW_MAX_TYPE_DEFS) return;
    const key = `${node.name}@${node.file}:${node.startLine}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const kind = LABEL_TO_TYPE_KIND[node.label];
    if (!kind) return;
    const lines = readLines(node.file);
    let text = '';
    if (lines && node.startLine > 0) {
      const from = node.startLine - 1;
      const to = node.endLine && node.endLine > node.startLine
        ? Math.min(lines.length - 1, node.endLine - 1)
        : Math.min(lines.length - 1, from + 40);
      text = lines.slice(from, to + 1).join('\n').trim();
    }
    if (text.length === 0) {
      // 定义体不可读时保留名称与引用位置，不伪造定义体
      text = `${kind} ${node.name}（定义体不可读；${referencedBySignature ? '签名显式引用' : '阶段文件内本地定义'}）`;
    }
    if (text.length > DATA_FLOW_MAX_TYPE_TEXT) {
      text = text.slice(0, DATA_FLOW_MAX_TYPE_TEXT) + '\n// …（已截断）';
    }
    out.push({ name: node.name, kind, file: node.file, line: node.startLine, text });
  };

  // 1. 签名显式引用的类型（同文件优先）
  for (const name of referenced) {
    const nodes = typeNodeIndex.get(name);
    if (!nodes || nodes.length === 0) continue;
    const inStageFile = nodes.find(n => stageFiles.has(n.file));
    emit(inStageFile ?? nodes[0], true);
  }
  // 2. 阶段文件内的其余本地类型（补足「关键数据结构」；只补 interface/type/enum，
  //    类实现体不是数据结构，只有被签名显式引用时才摘录）
  const remaining: GraphTypeFacts[] = [];
  for (const nodes of typeNodeIndex.values()) {
    for (const node of nodes) {
      if (!stageFiles.has(node.file)) continue;
      if (referenced.has(node.name)) continue;
      if (node.label !== 'Interface' && node.label !== 'Type' && node.label !== 'Enum') continue;
      remaining.push(node);
    }
  }
  remaining.sort((a, b) => (a.file === b.file ? a.startLine - b.startLine : a.file < b.file ? -1 : 1));
  for (const node of remaining) emit(node, false);
  return out;
}

function compareStageFacts(a: StageFacts, b: StageFacts): number {
  if (a.isEntry !== b.isEntry) return a.isEntry ? -1 : 1;
  if (a.sequenceIndex !== b.sequenceIndex) return a.sequenceIndex - b.sequenceIndex;
  if (a.depth !== b.depth) return a.depth - b.depth;
  const al = a.callLine > 0 ? a.callLine : a.startLine;
  const bl = b.callLine > 0 ? b.callLine : b.startLine;
  if (al !== bl) return al - bl;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function keyOf(name: string, file: string): string {
  return `${name}@${file}`;
}

/** `name@file` 反解（file 可能含 @，从最后一个 @ 切分不可靠 → 用首个 @ 之后的 name 长度） */
function splitKey(key: string): { name: string; file: string } {
  const at = key.indexOf('@');
  return { name: key.slice(0, at), file: key.slice(at + 1) };
}

function domainOf(file: string): string {
  return /\.rs$/i.test(file) ? 'rust' : 'ts';
}
