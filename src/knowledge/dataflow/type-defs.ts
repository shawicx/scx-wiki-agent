/**
 * 本地类型定义提取（自 data-flow-shape.ts 拆出；纯搬移，零逻辑变化）。
 *
 * 承载：图谱类型定义节点事实（Interface / Type / Enum / Class）、
 * 签名引用类型名提取、阶段文件内本地类型定义摘录（含截断保护）。
 */

import type { DataTypeDefinition } from '../types.js';

/** 类型定义条数上限 */
export const DATA_FLOW_MAX_TYPE_DEFS = 20;
/** 单条类型定义文本上限（字符） */
export const DATA_FLOW_MAX_TYPE_TEXT = 1200;

/** 图谱类型定义节点事实（Interface / Type / Enum / Class） */
export interface GraphTypeFacts {
  name: string;
  label: string;
  file: string;
  startLine: number;
  endLine?: number;
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

const LABEL_TO_TYPE_KIND: Record<string, DataTypeDefinition['kind'] | undefined> = {
  Interface: 'interface',
  Type: 'type',
  Enum: 'enum',
  Class: 'class',
};

/** 类型定义收集：显式引用优先，其后补齐阶段文件内的本地类型；每类 ≤1200 字符、全页 ≤20 条 */
export function collectTypeDefinitions(
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
