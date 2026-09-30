/**
 * 兼容壳：实现已按职责拆分至 ./dataflow/（纯搬移，零逻辑变化），对外导出与本文件
 * 拆分前完全一致。新代码请直接 import './dataflow/index.js'。
 */

export {
  DATA_FLOW_MAX_STAGES,
  DATA_FLOW_MAX_TRANSITIONS,
  DATA_FLOW_MAX_IO_EVENTS,
  collectDataFlowShapes,
  type TransitionFacts,
  type DataFlowShapeInput,
  type DataFlowShapeResult,
} from './dataflow/index.js';

export {
  DATA_FLOW_MAX_EXPRESSION,
  splitTopLevel,
  inferLiteralShape,
  normalizeGraphText,
  parseSignatureText,
  parseJsonStringArray,
  parseEdgeArgs,
  explainReturnType,
  type GraphSymbolFacts,
  type ParsedParam,
  type ParsedSignature,
} from './dataflow/shapes.js';

export {
  DATA_FLOW_MAX_TYPE_DEFS,
  DATA_FLOW_MAX_TYPE_TEXT,
  extractReferencedTypeNames,
  type GraphTypeFacts,
} from './dataflow/type-defs.js';

export { DATA_FLOW_BODY_FALLBACK_LINES } from './dataflow/body-range.js';
export { detectIoEvents, type IoHit } from './dataflow/io-scan.js';
