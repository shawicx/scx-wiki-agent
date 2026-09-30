/**
 * 数据形态证据层（Data-flow 页的确定性数据源）—— 编排入口。
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
 *
 * 拆分说明（零逻辑变化，纯搬移）：
 * - ./shapes.ts       签名/类型形状推断与文本工具
 * - ./io-scan.ts      函数体 I/O 扫描规则
 * - ./type-defs.ts    本地类型定义提取
 * - ./body-range.ts   函数体范围与源码签名回落
 * - ./stage-builder.ts 阶段资格判定与 inputs/outputs 组装
 * - 本文件             事实接口 + collectDataFlowShapes 编排
 */

import type {
  DataFlowStage,
  DataFlowTransition,
  DataIoEvent,
  DataTypeDefinition,
  DataFlowShapeCoverage,
  DataValueShape,
} from '../types.js';
import {
  keyOf,
  splitKey,
  domainOf,
  normalizeGraphText,
  normalizeReturnType,
  isVoidReturn,
  parseSignatureText,
  parseJsonStringArray,
  type GraphSymbolFacts,
  type ParsedSignature,
} from './shapes.js';
import { detectIoEvents } from './io-scan.js';
import { extractReferencedTypeNames, collectTypeDefinitions, type GraphTypeFacts } from './type-defs.js';
import { findDefinitionIndex, resolveBodyRange, type BodyRange } from './body-range.js';
import { buildStage, isTypedShape, literalTypeOf, compareStageFacts, type StageFacts } from './stage-builder.js';

/** 阶段上限（表格与 prompt 预算） */
export const DATA_FLOW_MAX_STAGES = 24;
/** 带数据证据的转换边上限 */
export const DATA_FLOW_MAX_TRANSITIONS = 40;
/** I/O 边界事件上限 */
export const DATA_FLOW_MAX_IO_EVENTS = 30;

// ---------------------------------------------------------------------------
// 注入事实
// ---------------------------------------------------------------------------

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
// 主流程
// ---------------------------------------------------------------------------

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
