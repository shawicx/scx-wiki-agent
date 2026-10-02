/**
 * Rust 方法调用通道（W2）：图谱对「接收者表达式调用」（`app.emit(...)`、
 * `manager.lock()`）不建 CALLS 边（实测 0 条 emit 边），Rust 侧的执行面
 * 因此大片不可见。本通道以**名称对齐 + 置信度分级**补位：
 *
 * 1. 图谱 Method 节点全集（impl 方法，name → 定义点集）
 * 2. Rust 源码全文正则收集 `.method(` 调用点（行号反查）
 * 3. 分级：方法名全库唯一 → resolved；多候选时若调用文件与唯一定义
 *    同 crate（use 声明可佐证）→ resolved，否则 ambiguous
 *
 * 诚实边界：不做接收者类型推断（需 rust-analyzer，超出 ADR-001 通道边界）。
 * ambiguous 条目只进参考面并如实标注，绝不冒充确定调用边。
 * 产物计入通道统计（W6 报告）；v1 不注入 calls 主表（避免破坏去重口径）。
 */

import { readFileSync } from 'node:fs';
import { isTestPath } from '../../shared/utils.js';
import { recordRustMethods } from './stats.js';
import type { ContextDeps } from '../context/shared.js';

export interface MethodCallSite {
  caller: string;
  method: string;
  /** resolved = 唯一定义或 use 佐证；ambiguous = 多候选待人工核 */
  confidence: 'resolved' | 'ambiguous';
  defFiles: string[];
}

const METHOD_CALL_RE = /\.([a-z_][a-z0-9_]*)\s*\(/g;
/** 高频语言内置/标准库方法名：无差别收集只会产出噪声 */
const BUILTIN_NAMES = new Set([
  'clone', 'to_string', 'to_owned', 'into', 'from', 'new', 'default', 'len',
  'push', 'pop', 'insert', 'remove', 'get', 'set', 'unwrap', 'expect', 'lock',
  'iter', 'map', 'filter', 'collect', 'unwrap_or', 'unwrap_or_else', 'map_err',
  'and_then', 'or_else', 'ok_or', 'ok_or_else', 'trim', 'split', 'join',
  'contains', 'starts_with', 'ends_with', 'parse', 'format', 'as_str', 'as_mut',
  'as_ref', 'to_vec', 'extend', 'is_some', 'is_none', 'is_empty', 'await',
]);

/** 是否值得跑本通道：生产源码里有 .rs 文件 */
export function hasRustSources(deps: ContextDeps): boolean {
  return deps.scanResult.productionFiles.some(f => f.relativePath.endsWith('.rs'));
}

/**
 * 采集 Rust 方法调用面。上限保护：方法全集 ≤2000、调用点 ≤500。
 */
export function scanRustMethodCalls(deps: ContextDeps): MethodCallSite[] {
  if (!hasRustSources(deps)) return [];

  // 1. 图谱 Method 全集：name → 定义文件集
  const q = deps.client.queryGraph(
    `MATCH (m:Method) WHERE m.is_test = false
       RETURN m.name AS name, m.file_path AS file LIMIT 2000`,
  );
  const defs = new Map<string, Set<string>>();
  for (const row of q.rows) {
    const name = row[0] as string;
    const file = (row[1] as string) ?? '';
    if (!name || !file || isTestPath(file)) continue;
    if (!defs.has(name)) defs.set(name, new Set());
    defs.get(name)!.add(file);
  }

  // 2. Rust 源码收集 `.method(` 调用点
  const rustFiles = deps.scanResult.productionFiles
    .filter(f => f.relativePath.endsWith('.rs') && !isTestPath(f.relativePath));
  const sites: MethodCallSite[] = [];
  for (const file of rustFiles) {
    if (sites.length >= 500) break;
    const src = readThrough(deps, file.absolutePath);
    if (src === null) continue;
    METHOD_CALL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = METHOD_CALL_RE.exec(src)) !== null && sites.length < 500) {
      const method = m[1];
      if (BUILTIN_NAMES.has(method)) continue;
      const defFiles = defs.get(method);
      if (!defFiles || defFiles.size === 0) continue;
      const files = [...defFiles];
      // 3. 分级：唯一定义（或定义全在同一文件）→ resolved；多候选看调用方
      //    是否 use 了定义方模块（粗粒度：定义文件路径段出现在 use 声明中）
      const unique = files.length === 1 || new Set(files).size === 1;
      const resolved = unique || files.every(f => useEvidence(src, f));
      sites.push({
        caller: file.relativePath,
        method,
        confidence: resolved ? 'resolved' : 'ambiguous',
        defFiles: [...new Set(files)],
      });
    }
  }

  recordRustMethods({
    methods: defs.size,
    resolved: sites.filter(s => s.confidence === 'resolved').length,
    ambiguous: sites.filter(s => s.confidence === 'ambiguous').length,
  });
  return sites;
}

/** 调用方源码的 use 声明是否引用了定义文件路径段（mod 路径佐证，粗粒度） */
function useEvidence(callerSrc: string, defFile: string): boolean {
  const segments = defFile
    .replace(/^src-tauri\//, '')
    .split('/')
    .filter(seg => seg !== 'src' && seg !== 'lib.rs' && seg !== 'main.rs' && !seg.endsWith('.rs'));
  if (segments.length === 0) return true; // crate 根定义视为同 crate 可达
  return segments.some(seg => new RegExp(`use\\s+[\\w:]*${seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\w:]*;`).test(callerSrc));
}

/** cache 读透：miss 时读盘并回填（失败返回 null） */
function readThrough(deps: ContextDeps, absolutePath: string): string | null {
  if (deps.sourceCache.has(absolutePath)) {
    return deps.sourceCache.get(absolutePath) ?? null;
  }
  let src: string | null;
  try {
    src = readFileSync(absolutePath, 'utf-8');
  } catch {
    src = null;
  }
  deps.sourceCache.set(absolutePath, src ?? '');
  return src;
}
