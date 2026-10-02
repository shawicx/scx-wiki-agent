/**
 * Vue SFC 权威通道（W1）：以官方编译器 `@vue/compiler-sfc` 结构化解析 .vue 文件。
 *
 * 动机（实测）：CBM 图谱对 .vue SFC 只索引 File/Module 两个节点——组件名、
 * props、emits、内部函数全部缺失，wiki 前端面此前只能靠正则近似
 * （source-fallback + declCount 计数）。
 *
 * 通道分工：
 * - `parse()` 做块切分与行号偏移（script 内容行号换算回原文件行号，锚点可追溯）
 * - `compileScript()` 的 `bindings` 提供 setup 绑定全集（编译器视角的内部声明校验）
 * - defineProps/defineEmits 从 script 源码做括号配平提取（跨行形态天然覆盖），
 *   产出**事件名级**清单（非计数），每条带 file:line 锚点
 * - 失败 fail-open：单文件解析异常回落纯正则近似（fallbackFiles 计数进报告）
 *
 * ADR-001 边界：这是「证据通道」不是索引——无持久化、无跨文件解析、
 * 每次构建现算，产物直接进 context 与 symbol universe。
 */

import { readFileSync } from 'node:fs';
import { parse, compileScript } from '@vue/compiler-sfc';
import { recordVueSfc } from './stats.js';

export interface SfcAnchor {
  file: string;
  line: number;
}

export interface VuePropFact {
  name: string;
  type?: string;
  required: boolean;
  anchor: SfcAnchor;
}

export interface VueEmitFact {
  name: string;
  anchor: SfcAnchor;
}

export interface VueInternalFact {
  name: string;
  kind: 'function' | 'const';
  anchor: SfcAnchor;
}

export interface VueSfcFacts {
  file: string;
  componentName: string;
  props: VuePropFact[];
  emits: VueEmitFact[];
  internals: VueInternalFact[];
  imports: Array<{ source: string; anchor: SfcAnchor }>;
  /** 'exact' = 编译器产物；'fallback' = 正则近似（编译失败降级） */
  confidence: 'exact' | 'fallback';
}

/** 通道入口：解析单个 .vue 文件（编译失败回落正则近似） */
export function extractVueSfcFacts(relativePath: string, absolutePath: string): VueSfcFacts | null {
  let src: string;
  try {
    src = readFileSync(absolutePath, 'utf-8');
  } catch {
    return null;
  }
  const componentName = relativePath.split('/').pop()!.replace(/\.vue$/, '');
  try {
    const facts = extractWithCompiler(relativePath, src, componentName);
    recordVueSfc({ files: 1, components: 1, props: facts.props.length, emits: facts.emits.length });
    return facts;
  } catch {
    const facts = extractVueSfcFactsFallback(relativePath, src);
    recordVueSfc({
      files: 1, components: 1, fallbackFiles: 1,
      props: facts.props.length, emits: facts.emits.length,
    });
    return facts;
  }
}

// ---- 编译器路径 ----

function extractWithCompiler(relativePath: string, src: string, componentName: string): VueSfcFacts {
  const { descriptor } = parse(src, { filename: relativePath });
  const block = descriptor.scriptSetup ?? descriptor.script;
  const scriptOffset = block?.loc.start.line ?? 1;
  // SFC 块行号从 1 计；script 内容第 n 行 ↔ 原文件第 scriptOffset+n-1 行
  const lineOf = (lineInScript: number): number => scriptOffset + lineInScript - 1;

  // 编译器 setup 绑定全集（BINDING_CONST / BINDING_PROPS 等）——
  // 用作内部声明的校验与补全，名称仍以源码行级锚点为准
  let setupBindings: string[] = [];
  try {
    const compiled = compileScript(descriptor as never, { id: relativePath, inlineTemplate: false });
    setupBindings = Object.keys(compiled.bindings ?? {});
  } catch { /* 类型异常不阻断：源码遍历仍可用 */ }

  const out: Pick<VueSfcFacts, 'props' | 'emits' | 'internals' | 'imports'> = {
    props: [], emits: [], internals: [], imports: [],
  };
  extractFromScript(block?.content ?? '', relativePath, lineOf, out);

  // 编译器绑定里有、源码遍历漏掉的内部声明（罕见形态）按块首锚点补入
  const known = new Set([...out.internals.map(i => i.name), ...out.props.map(p => p.name)]);
  for (const name of setupBindings) {
    if (known.has(name) || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
    out.internals.push({ name, kind: 'const', anchor: { file: relativePath, line: lineOf(1) } });
  }

  return { file: relativePath, componentName, ...out, confidence: 'exact' };
}

/** script 源码的结构化提取（正则回落路径复用） */
function extractFromScript(
  scriptSrc: string,
  file: string,
  lineOf: (n: number) => number,
  out: Pick<VueSfcFacts, 'props' | 'emits' | 'internals' | 'imports'>,
): void {
  const lines = scriptSrc.split('\n');

  lines.forEach((line, i) => {
    const im = line.match(/import\s+[^'"]*['"]([^'"]+)['"]/);
    if (im) out.imports.push({ source: im[1], anchor: { file, line: lineOf(i + 1) } });
    const fm = line.match(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (fm) out.internals.push({ name: fm[1], kind: 'function', anchor: { file, line: lineOf(i + 1) } });
    const cm = line.match(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/);
    if (cm && !/^\s*(?:import|export)/.test(line)) {
      out.internals.push({ name: cm[1], kind: 'const', anchor: { file, line: lineOf(i + 1) } });
    }
  });

  // defineProps：类型形态（key[:?] type）/ 数组与运行时对象（字面量/键名）
  const propsText = extractMacroArg(scriptSrc, 'defineProps');
  if (propsText) {
    const anchor = anchorOf(lines, 'defineProps', file, lineOf);
    const typed = extractTypedKeys(propsText);
    if (typed.length > 0) {
      for (const t of typed) out.props.push({ ...t, required: !t.optional, anchor });
    } else {
      for (const name of extractLiteralNames(propsText)) out.props.push({ name, required: true, anchor });
    }
  }

  // defineEmits：调用签名 `(e: 'x', v: T): void` → 每个签名的首字符串即事件名
  //（payload 联合字面量如 'right'|'down' 不是事件）；数组字面量 / 对象键次之
  const emitsText = extractMacroArg(scriptSrc, 'defineEmits');
  if (emitsText) {
    const anchor = anchorOf(lines, 'defineEmits', file, lineOf);
    const sigNames = extractCallSigNames(emitsText);
    const names = sigNames.length > 0
      ? sigNames
      : extractLiteralNames(emitsText).length > 0
        ? extractLiteralNames(emitsText)
        : extractTypedKeys(emitsText).map(k => k.name);
    for (const name of names) out.emits.push({ name, anchor });
  }
}

function anchorOf(lines: string[], macro: string, file: string, lineOf: (n: number) => number): SfcAnchor {
  const idx = lines.findIndex(l => l.includes(macro));
  return { file, line: lineOf(idx >= 0 ? idx + 1 : 1) };
}

/**
 * 抓取 defineXxx 宏的声明文本。三种形态统一覆盖：
 * - `defineEmits<{ (e: 'x'): void }>()`：payload 在**泛型**里（调用签名风格）
 * - `defineProps<{ name: string }>()`：payload 在泛型里（类型风格）
 * - `defineEmits(['a','b'])` / `defineProps({ a: T })`：payload 在实参里
 * 括号/尖括号各自配平；实参非空优先，否则取泛型块。
 */
function extractMacroArg(src: string, macro: 'defineProps' | 'defineEmits'): string | null {
  const m = src.match(new RegExp(`\\b${macro}\\b`));
  if (!m || m.index === undefined) return null;
  let i = m.index + m[0].length;
  while (i < src.length && /\s/.test(src[i])) i++;

  const balanced = (openIdx: number, open: string, close: string): string | null => {
    let depth = 0;
    for (let j = openIdx; j < src.length; j++) {
      if (src[j] === open) depth++;
      else if (src[j] === close) {
        depth--;
        if (depth === 0) return src.slice(openIdx + 1, j);
      }
    }
    return null;
  };

  // 泛型块（紧跟宏名的 `<`）；实参括号必须从泛型块**之后**找——
  // 调用签名风格的 `(e: 'x')` 在泛型内部，不能当调用实参
  let generic: string | null = null;
  let searchFrom = i;
  if (src[i] === '<') {
    generic = balanced(i, '<', '>');
    if (generic !== null) searchFrom = i + generic.length + 2;
  }
  const paren = src.indexOf('(', searchFrom);
  const args = paren >= 0 ? balanced(paren, '(', ')') : null;

  if (args && args.trim().length > 0) return args;
  if (generic && generic.trim().length > 0) return generic;
  return args ?? generic;
}

/** 类型块顶层 key：`name: T` / `name?: T`（含引号键），返回名与可选性 */
function extractTypedKeys(block: string): Array<{ name: string; type?: string; optional: boolean }> {
  const out: Array<{ name: string; type?: string; optional: boolean }> = [];
  const re = /(?:^|[{;,(])\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))(\??)\s*:\s*([^\n;},]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const name = m[1] ?? m[2] ?? m[3];
    if (!name) continue;
    out.push({ name, type: m[5]?.trim(), optional: m[4] === '?' });
  }
  // 去重（同名 key 只留首个）
  const seen = new Set<string>();
  return out.filter(k => (seen.has(k.name) ? false : seen.add(k.name)));
}

/** 块内全部引号字符串名（数组字面量 / 调用签名事件名） */
function extractLiteralNames(block: string): string[] {
  const names: string[] = [];
  const re = /['"]([^'"\n]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) names.push(m[1]);
  return [...new Set(names)];
}

/** 调用签名风格的事件名：`(e: 'evt', payload: T): void` 的首参数字符串 */
function extractCallSigNames(block: string): string[] {
  const names: string[] = [];
  const re = /\(\s*\w+\s*\??\s*:\s*['"]([^'"\n]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) names.push(m[1]);
  return [...new Set(names)];
}

// ---- 正则回落路径（fail-open：编译器抛异常时兜底；亦供 P3 评估脚本对照采样） ----

export function extractVueSfcFactsFallback(relativePath: string, src: string): VueSfcFacts {
  const componentName = relativePath.split('/').pop()!.replace(/\.vue$/, '');
  const scriptStart = src.search(/<script[^>]*>/);
  const scriptStartLine = scriptStart >= 0 ? src.slice(0, scriptStart).split('\n').length : 1;
  const blockMatch = src.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const out: Pick<VueSfcFacts, 'props' | 'emits' | 'internals' | 'imports'> = {
    props: [], emits: [], internals: [], imports: [],
  };
  extractFromScript(blockMatch?.[1] ?? '', relativePath, n => scriptStartLine + n - 1, out);
  return { file: relativePath, componentName, ...out, confidence: 'fallback' };
}
