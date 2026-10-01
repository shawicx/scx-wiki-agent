/**
 * 图谱查无符号的源码回落（信息带宽补强）。
 *
 * codebase-memory-mcp 对 .vue SFC 与部分 Rust 项的索引不完整，导致热点符号在
 * 页面上下文中缺失、LLM 按 R5 诚实降级为「待确认」空转。本模块对图谱查无的
 * 名字做正则级源码定义探测（ADR-001 允许的正则先例：无 AST、无持久索引），
 * 结果经既有 supplementalSymbols / outline symbols 通道进入页面上下文。
 *
 * 名字驱动：先按目标名集合命中行，再对该行用定义模式分类提取——不做全量符号
 * 索引，扫描成本与 collectImportFiles 同级（一次全仓正则遍历 + 调用方缓存）。
 */

import { readFileSync } from 'node:fs';
import type { ScanResult } from '../core/scanner.js';
import { nativeDefinedNameOn, isNativeDomain } from '../shared/language-patterns.js';
import type { SymbolType } from '../core/types.js';
import type { SupplementalSymbol } from './types.js';
import { isTestPath, languageDomainOf } from '../shared/utils.js';

/** 源码缓存：绝对路径 → 文件内容（不可读为 null）；与调用方共享以摊薄扫描成本 */
export type SourceCache = Map<string, string | null>;

/** 单次回落探测的名字上限（防名单爆炸拖慢全仓扫描） */
const MAX_NAMES = 40;
/** signature 截断长度 */
const MAX_SIGNATURE_LEN = 160;

/** TS/JS/Vue 定义行 → [捕获名, 符号类型]（顺序即优先级） */
const TS_DEF_PATTERNS: Array<{ re: RegExp; type: SymbolType }> = [
  { re: /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, type: 'function' },
  { re: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, type: 'class' },
  { re: /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/, type: 'variable' },
  { re: /^(?:export\s+)?(?:type|interface)\s+([A-Za-z_$][\w$]*)/, type: 'interface' },
  { re: /^(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/, type: 'variable' },
  // 缩进方法（类成员/对象成员；名字驱动下误报只影响 prompt 参考，不进锚点）
  { re: /(?:public|private|protected|static|async|override)\s+\*?([A-Za-z_$][\w$]*)\s*\(/, type: 'method' },
  { re: /^\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/, type: 'method' },
];

/** Rust 定义行 → [捕获名, 符号类型] */
const RUST_DEF_PATTERNS: Array<{ re: RegExp; type: SymbolType }> = [
  { re: /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:const\s+)?fn\s+([A-Za-z_]\w*)/, type: 'function' },
  { re: /^(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/, type: 'class' },
  { re: /^impl(?:<[^>]*>)?\s+([A-Za-z_]\w*)/, type: 'class' },
];

/** 读取源文件（缓存共享；不可读缓存为 null 不再重试） */
function readSource(file: { absolutePath: string }, cache: SourceCache): string | null {
  if (cache.has(file.absolutePath)) return cache.get(file.absolutePath) ?? null;
  let src: string | null;
  try {
    src = readFileSync(file.absolutePath, 'utf-8');
  } catch {
    src = null;
  }
  cache.set(file.absolutePath, src);
  return src;
}

/** 单行按语言域提取定义名（返回 null 表示不是定义行） */
function definedNameOn(line: string, domain: string): { name: string; type: SymbolType } | null {
  const native = nativeDefinedNameOn(line, domain);
  if (isNativeDomain(domain) || native) return native;
  const patterns = domain === 'rust' ? RUST_DEF_PATTERNS : TS_DEF_PATTERNS;
  const trimmed = line.trim();
  for (const { re, type } of patterns) {
    const m = trimmed.match(re);
    if (m) return { name: m[1], type };
  }
  return null;
}

/**
 * 对图谱查无的名字做源码定义探测。
 * 只扫代码域文件（ts/rust）且非测试路径；名字全部找到即提前退出。
 */
export function findSymbolDefinitions(
  names: string[],
  scanResult: ScanResult,
  cache: SourceCache,
): SupplementalSymbol[] {
  const wanted = [...new Set(names)].filter(n => n.length >= 3).slice(0, MAX_NAMES);
  if (wanted.length === 0) return [];

  const remaining = new Set(wanted);
  const nameHit = new RegExp(`\\b(?:${[...remaining].map(escapeRe).join('|')})\\b`);
  const found: SupplementalSymbol[] = [];

  for (const file of scanResult.files) {
    if (remaining.size === 0) break;
    const domain = languageDomainOf(file.relativePath);
    if (domain === null || isTestPath(file.relativePath)) continue;
    const src = readSource(file, cache);
    if (src === null) continue;

    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!nameHit.test(lines[i])) continue;
      const def = definedNameOn(lines[i], domain);
      if (def && remaining.has(def.name)) {
        remaining.delete(def.name);
        found.push({
          name: def.name,
          type: def.type,
          file: file.relativePath,
          startLine: i + 1,
          signature: lines[i].trim().slice(0, MAX_SIGNATURE_LEN),
        });
        if (remaining.size === 0) break;
      }
    }
  }
  return found;
}

/**
 * 对给定文件（仓库相对路径）全量提取定义名集合。
 * 供 outlineKnown：让 brief 点名、但图谱漏采的符号免于 W3「查无实据」误剔。
 */
export function extractDefinedSymbolNames(
  files: string[],
  scanResult: ScanResult,
  cache: SourceCache,
): Set<string> {
  const byPath = new Map(scanResult.files.map(f => [f.relativePath, f]));
  const names = new Set<string>();
  for (const rel of files) {
    const file = byPath.get(rel);
    if (!file) continue;
    const domain = languageDomainOf(rel);
    if (domain === null) continue;
    const src = readSource(file, cache);
    if (src === null) continue;
    for (const line of src.split('\n')) {
      const def = definedNameOn(line, domain);
      if (def) names.add(def.name);
    }
  }
  return names;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
