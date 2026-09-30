/** data-flow 页数据形态类型（数据形状证据，非调用边）。 */

import type { SupplementalSymbol } from './graph.js';

/** A message between participants in a sequence diagram */
export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  /** 调用发生位置（CALLS 边 r.line + caller.file_path） */
  callFile: string;
  callLine: number;
  /** callee 定义位置（callee.start_line；与调用点锚点语义不同，严禁混用） */
  calleeFile: string;
  calleeLine: number;
  /** CALLS 边携带的调用点实参表达式 */
  args: DataValueShape[];
  /** 图谱边置信度（0-1；低置信度不得作为唯一数据形态依据） */
  confidence?: number;
  /** 图谱边识别策略（构建报告/调试用，不写入页面正文） */
  strategy?: string;
}

/** A traced execution sequence from entry to terminal calls */
export interface ExecutionSequence {
  name: string;
  entrySymbol: string;
  participants: import('./graph.js').SequenceParticipant[];
  messages: SequenceMessage[];
}

/**
 * 数据形态：调用点实参表达式、函数签名类型或 I/O 表达式。
 * evidence 标注证据来源，unknown 不得被写成具体类型。
 */
export interface DataValueShape {
  /** 调用点实参表达式、返回表达式或 I/O 表达式 */
  expression?: string;
  /** 显式类型签名或保守推断出的类型 */
  type?: string;
  /** graph-signature/source-signature/call-argument/io 为确定性证据；literal 仅极保守字面量推断 */
  evidence:
    | 'graph-signature'
    | 'source-signature'
    | 'call-argument'
    | 'literal'
    | 'io'
    | 'unknown';
  /** file:line 锚点 */
  anchor?: string;
}

/** 数据阶段：由 sequence participants 确定性生成的真实数据处理符号 */
export interface DataFlowStage {
  id: string;
  /** 阶段名，使用真实符号名 */
  name: string;
  /** 入口转换 / 普通转换 / I/O 边界 / 外部进程边界 / 输出阶段 */
  role: 'entry' | 'transform' | 'io-boundary' | 'external-process' | 'output';
  symbol: string;
  file: string;
  line: number;
  /** 输入数据形态 */
  inputs: DataValueShape[];
  /** 输出数据形态 */
  outputs: DataValueShape[];
  /** 该阶段存在哪些确定性证据 */
  evidenceKinds: Array<'signature' | 'call-argument' | 'return' | 'io' | 'type-definition'>;
  /** 无数据形态证据时诚实标注 */
  dataShapeKnown: boolean;
}

/** 阶段间真实调用转换边（带调用点参数与调用行号） */
export interface DataFlowTransition {
  from: string;
  to: string;
  fromFile?: string;
  toFile?: string;
  /** 调用点位置，不是 callee 定义位置 */
  callFile: string;
  callLine: number;
  /** 调用参数表达式 */
  args: DataValueShape[];
  /** callee 定义锚点 */
  calleeDefinition: string;
  confidence?: number;
  strategy?: string;
}

/** 数据边界事件：文件、目录、子进程、配置、env、IPC 等 */
export interface DataIoEvent {
  kind:
    | 'fs-read'
    | 'fs-write'
    | 'directory-read'
    | 'directory-write'
    | 'remove'
    | 'process'
    | 'config'
    | 'env'
    | 'http'
    | 'ipc'
    | 'db'
    | 'stdout';
  /** 所属函数或入口阶段（必须落到 symbol，禁止整模块归属） */
  symbol: string;
  file: string;
  line: number;
  /** 调用表达式 */
  expression: string;
  /** 数据介质，如文件路径表达式、子进程名、配置路径 */
  medium?: string;
  direction: 'input' | 'output' | 'bidirectional';
  /** 函数体范围由括号匹配/行数窗口近似得出（非图谱 end_line） */
  approximated?: boolean;
}

/** 本地类型定义摘录（阶段引用到的数据结构） */
export interface DataTypeDefinition {
  name: string;
  kind: 'interface' | 'type' | 'enum' | 'class';
  file: string;
  line: number;
  /** 截断后的定义文本，防止 prompt 超限 */
  text: string;
}

/** 数据形态覆盖率（成页预检与构建报告依据） */
export interface DataFlowShapeCoverage {
  /** 参与评估的符号数（name@file 去重） */
  symbolsConsidered: number;
  stages: number;
  transitions: number;
  /** 带数据证据的转换边数（args/签名/非 void 返回/I-O 任一命中） */
  dataBearingTransitions: number;
  /** 纯控制流边（无 args、无签名、无 I/O），默认不渲染 */
  controlOnlyTransitions: number;
  ioEvents: number;
  /** 有确定类型形态的阶段数 */
  typedStages: number;
  /** 无任何数据形态证据的阶段数 */
  unknownStages: number;
  typeDefinitions: number;
  /** 函数体范围近似（非图谱 end_line）的阶段数 */
  approximatedBodies: number;
}

/** Context for data-flow page（数据形态与阶段转换；调用链只用于路径与排序） */
export interface DataFlowContext {
  sequences: ExecutionSequence[];

  /** 确定性生成的数据阶段 */
  stages: DataFlowStage[];

  /** 阶段间真实调用转换边，带调用点参数与调用行号（仅有数据证据的边） */
  transitions: DataFlowTransition[];

  /** 数据边界：文件、目录、子进程、配置、env、IPC 等 */
  ioEvents: DataIoEvent[];

  /** 阶段引用到的本地类型定义摘录 */
  typeDefinitions: DataTypeDefinition[];

  /** 数据形态覆盖率，构建报告与预检使用 */
  shapeCoverage: DataFlowShapeCoverage;

  supplementalSymbols?: SupplementalSymbol[];
}
