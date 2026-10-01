import { explainReturnType } from '../data-flow-shape.js';
import type { IntentEvidence } from '../intent-evidence.js';
import type { DataFlowContext, DataValueShape } from '../types.js';

export function sanitizeMermaid(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * docstring 摘要渲染：剥 JSDoc 星号、字面 \n 还原为换行、取第一段，
 * 列表行转 <br>、普通换行转空格、截断防破表。无内容返回 '—'（不输出空话）。
 */
export function summarizeDocstring(raw: string | null | undefined, maxLen = 120): string {
  if (!raw) return '—';
  const text = raw
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/^\s*\/\*\*/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map(l => l.replace(/^\s*\*!? ?/, '').trimEnd())
    .join('\n')
    .trim();
  if (text.length === 0) return '—';
  // 第一段 = 首个空行之前的内容；JSDoc 首行常见空行，先剥掉首部空行
  const body = text.replace(/^\n+/, '');
  const firstParagraph = body.split(/\n\s*\n/)[0] ?? body;
  const lines = firstParagraph.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return '—';
  const rendered = lines
    .map(l => (/^(?:[-*+]|\d+\.)\s+/.test(l) ? `- ${l.replace(/^(?:[-*+]|\d+\.)\s+/, '')}` : l))
    .map(l => l.replace(/\|/g, '\\|'))
    .join(lines.some(l => l.startsWith('- ')) ? '<br>' : ' ');
  return rendered.length > maxLen ? `${rendered.slice(0, maxLen)}…` : rendered;
}

export const INTENT_KIND_LABELS: Record<string, string> = {
  'file-header': '文件头自述',
  'symbol-comment': '符号注释',
  'why-marker': '风险标记',
  'const-comment': '常量注释',
  'git-commit': '提交记录',
  'git-theme': '高频主题',
  'doc-section': '文档小节',
  'test-spec': '行为承诺',
  'git-churn': '变更热点',
};

/** 意图证据表（证据 | 类型 | 目标 | 锚点）：纯规则路径的「为什么」主载体 */
export function intentTable(items: IntentEvidence[] | undefined): string[][] {
  return (items ?? []).map(e => [
    e.text,
    INTENT_KIND_LABELS[e.kind] ?? e.kind,
    e.target.symbol ?? e.target.module ?? e.target.file ?? '-',
    e.anchor,
  ]);
}

export function hasIntent(items: IntentEvidence[] | undefined): boolean {
  return (items ?? []).length > 0;
}

export function symbolAnchorText(symbol: { name: string; file?: string; startLine?: number }): string {
  const anchor = symbol.file && symbol.startLine && symbol.startLine > 0
    ? `${symbol.file}:${symbol.startLine}`
    : symbol.file;
  return anchor ? `\`${symbol.name}\`（${anchor}）` : `\`${symbol.name}\``;
}

export function languageSummary(languages: Array<{ language: string; fileCount: number }> | undefined): string {
  return (languages ?? []).map(l => `${l.language} × ${l.fileCount}`).join(' / ');
}

/** 数据流页固定分工声明（与 calls.md 的职责边界） */
export const FLOW_CALLS_POINTER =
  '完整控制流与调用可达性见 [calls.md](../07-reference/calls.md)；本页只描述带数据形态证据的转换。';

export const STAGE_ROLE_LABELS: Record<string, string> = {
  entry: '入口',
  transform: '转换',
  'io-boundary': 'I/O 边界',
  'external-process': '外部进程',
  output: '输出阶段',
};

export const STAGE_EVIDENCE_LABELS: Record<string, string> = {
  signature: '函数签名',
  'call-argument': '调用实参',
  return: '返回类型',
  io: 'I/O 调用',
  'type-definition': '类型定义',
};

export const IO_KIND_LABELS: Record<string, string> = {
  'fs-read': '读文件',
  'fs-write': '写文件',
  'directory-read': '读目录',
  'directory-write': '建目录',
  remove: '删除',
  process: '子进程',
  config: '配置读取',
  env: '环境变量',
  http: 'HTTP',
  ipc: 'IPC',
  db: '数据库',
  stdout: '终端输出',
};

export const IO_DIRECTION_LABELS: Record<string, string> = {
  input: '输入',
  output: '输出',
  bidirectional: '双向',
};

export function anchorText(file: string, line: number): string {
  if (!file) return '未检出位置';
  return line > 0 ? `${file}:${line}` : file;
}

export function inline(text: string): string {
  return '`' + text.replace(/`/g, "'").replace(/\|/g, '\\|') + '`';
}

/** 单个数据形态的展示文本（表达式与类型同时存在时都要展示，禁止用类型顶替表达式） */
export function shapeText(shape: DataValueShape, explainReturn: boolean): string {
  // I/O 形态的证据就是调用表达式本身，不再叠加「未检出类型」噪音
  if (shape.evidence === 'io') return shape.expression ? inline(shape.expression) : '未检出';
  const voidLike = shape.type !== undefined && /^(?:Promise\s*<\s*void\s*>|void)$/.test(shape.type);
  const type = shape.type
    ? (explainReturn && voidLike && shape.evidence !== 'literal'
      ? explainReturnType(shape.type)
      : shape.type)
    : undefined;
  if (shape.expression && type) return `${inline(shape.expression)}：${type}`;
  if (type) return type;
  if (shape.expression) return `${inline(shape.expression)}（未检出类型）`;
  return '未检出';
}

export function shapesText(shapes: DataValueShape[], explainReturn = false): string {
  if (shapes.length === 0) return '未检出';
  return shapes.map(s => shapeText(s, explainReturn)).join('<br>');
}

/** 证据局限：只陈述确定性事实，不编造缺口内容 */
export function limitationNotes(ctx: DataFlowContext): string[] {
  const notes: string[] = [];
  const c = ctx.shapeCoverage;
  if (c.unknownStages > 0) {
    notes.push(`${c.unknownStages} 个阶段未检出完整类型形态，仅保留真实符号与锚点，未做类型推断。`);
  }
  if (c.controlOnlyTransitions > 0) {
    notes.push(`另有 ${c.controlOnlyTransitions} 条纯控制流边（无实参、无签名、无 I/O）未列入本页。`);
  }
  if (c.approximatedBodies > 0) {
    notes.push(`${c.approximatedBodies} 个阶段的函数体范围由括号匹配/行数窗口近似得出（body-scope-approximated），I/O 归属可能与同文件相邻函数混淆。`);
  }
  const lowConfidence = ctx.transitions.filter(t => t.confidence !== undefined && t.confidence < 0.8).length;
  if (lowConfidence > 0) {
    notes.push(`${lowConfidence} 条转换来自低置信度图谱边（confidence < 0.8），不作为数据形态的唯一依据。`);
  }
  if (ctx.typeDefinitions.length === 0) {
    notes.push('未从阶段所在文件解析到本地 interface/type/enum/class 定义。');
  }
  if (notes.length === 0) {
    notes.push('本页结论均来自图谱签名、调用点实参与源码 I/O 扫描等确定性证据，无推断内容。');
  }
  return notes;
}

/**
 * 「本页确定知道的事实 / 未知项」双区块：fallback 页尾的确定性综合。
 * facts/unknowns 只允许数字统计与已锚定事实，禁止推断性表述；
 * unknowns 措辞用「未检出/无证据」，避免污染确认收集器的待确认队列。
 */
export function renderFactsAndUnknowns(
  builder: { addSection: (title: string, content: string) => unknown },
  facts: string[],
  unknowns: string[],
): void {
  if (facts.length > 0) {
    builder.addSection('本页确定知道的事实', facts.map(f => `- ${f}`).join('\n'));
  }
  if (unknowns.length > 0) {
    builder.addSection('未知项', unknowns.map(u => `- ${u}`).join('\n'));
  }
}
