/**
 * 写盘前质量闸门（纯函数，不做 I/O）。
 * 实现已拆分至 ./quality/（types / anchors / rules / validator），本文件仅保留
 * re-export 壳以维持既有导入路径兼容。
 */

export * from './quality/index.js';
