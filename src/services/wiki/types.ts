/** 阶段二产物共享类型。 */

export type { PageStatus, WrittenPage, ConfirmSummary } from './report.js';

/** 单页产出结果：最终内容 + 走的生成路径 + LLM 路径放弃原因（仅降级时） */
export interface PageProduced {
  content: string;
  source: 'llm' | 'fallback';
  llmDrop?: string;
}

/** 两阶段构建的内存页产物（生成完成、写盘前，可能还要过人工裁决改写） */
export interface ProducedEntry {
  page: string;
  relPath: string;
  source: 'llm' | 'fallback';
  /** 正文（已过断言校验标注，待裁决改写后注入锚定块写盘） */
  content: string;
  evidenceFiles: string[];
  /** 页面 context（跨页审校与降级动作用；只读引用，不参与序列化） */
  context?: unknown;
}
