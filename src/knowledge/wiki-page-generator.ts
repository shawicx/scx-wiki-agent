/**
 * Re-export 壳：实现已拆分到 ./generator/（shared / structure / data-pages / surface / index）。
 * 本文件仅保持既有 import 路径兼容，勿在此新增实现。
 */
export { WikiPageGenerator } from './generator/index.js';
export type { GeneratorSettings, PageGenNotice } from './generator/shared.js';
export { ANTI_HALLUCINATION } from './generator/shared.js';
