/**
 * 阶段构建（自 data-flow-shape.ts 拆出；纯搬移，零逻辑变化）。
 *
 * 承载：阶段事实结构（StageFacts）、阶段资格判定与 inputs/outputs 组装、
 * 阶段角色推断、阶段排序比较器。
 */

import type { DataFlowStage, DataIoEvent, DataValueShape } from '../types.js';
import type { TransitionFacts } from './index.js';
import { isVoidReturn, inferLiteralShape, type ParsedParam } from './shapes.js';
import { findReturnLiteral } from './body-range.js';

const IO_INPUT_KINDS = new Set<DataIoEvent['kind']>(['fs-read', 'directory-read', 'config', 'env', 'http', 'ipc', 'db']);
const IO_OUTPUT_KINDS = new Set<DataIoEvent['kind']>(['fs-write', 'directory-write', 'remove', 'stdout']);

export interface StageFacts {
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

export function isTypedShape(shape: DataValueShape): boolean {
  return shape.type !== undefined
    && shape.evidence !== 'unknown'
    && shape.evidence !== 'literal';
}

/** 实参字面量形态：优先按源码表达式推断（引号保留），再用图谱解析值兜底 */
export function literalTypeOf(arg: { expression: string; value?: string }): string | undefined {
  return inferLiteralShape(arg.expression) ?? (arg.value ? inferLiteralShape(arg.value) : undefined);
}

export function buildStage(
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

export function compareStageFacts(a: StageFacts, b: StageFacts): number {
  if (a.isEntry !== b.isEntry) return a.isEntry ? -1 : 1;
  if (a.sequenceIndex !== b.sequenceIndex) return a.sequenceIndex - b.sequenceIndex;
  if (a.depth !== b.depth) return a.depth - b.depth;
  const al = a.callLine > 0 ? a.callLine : a.startLine;
  const bl = b.callLine > 0 ? b.callLine : b.startLine;
  if (al !== bl) return al - bl;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
