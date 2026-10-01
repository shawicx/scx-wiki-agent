/**
 * public-api 页 context（library）：package.json exports 字段 + 入口 barrel 的
 * re-export 链 + 导出符号。全部正则级确定性提取，带 file:line 锚点；
 * 无 exports/入口/导出证据 → 返回 null（页面跳过，诚实空页不产出）。
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { PublicApiContext } from '../types.js';
import type { ContextDeps } from './shared.js';
import { readSourceCached } from './shared.js';

const ENTRY_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

interface PkgShape {
  name?: string;
  version?: string;
  exports?: unknown;
  main?: string;
  module?: string;
  types?: string;
  bin?: unknown;
}

function readPkg(rootDir: string): PkgShape | null {
  try {
    return JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}

/** exports 字段拍平（嵌套 conditions 走到叶子字符串；key 用点路径表示） */
function flattenExports(node: unknown, prefix: string, out: Array<{ key: string; value: string }>, cap = 30): void {
  if (out.length >= cap) return;
  if (typeof node === 'string') {
    out.push({ key: prefix || '.', value: node });
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      flattenExports(v, prefix ? `${prefix}/${k}` : k, out, cap);
    }
  }
}

/** 入口声明解析为仓库相对文件路径（尝试扩展名补全） */
function resolveEntry(rootDir: string, decl: string | undefined): string | null {
  if (!decl || !decl.startsWith('.')) return null;
  let rel = decl.replace(/^\.\//, '').replace(/^\.\.\//, '../');
  const candidates = [rel, ...ENTRY_EXTS.map(e => `${rel}${e}`), ...ENTRY_EXTS.map(e => `${rel}/index${e}`)];
  for (const c of candidates) {
    try {
      readFileSync(join(rootDir, c));
      return c.replace(/\\/g, '/');
    } catch { /* try next */ }
  }
  return null;
}

const RE_STAR = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
const RE_NAMED = /export\s*\{([^}]*)\}\s*from\s+['"]([^'"]+)['"]/g;
const RE_DECL = /export\s+(?:async\s+)?(?:const|function|class|interface|type|enum|abstract\s+class)\s+([A-Za-z_$][\w$]*)/g;

/** 扫描单个入口/barrel 文件：re-export 与本文件导出声明 */
function scanFile(rel: string, source: string): {
  reExports: PublicApiContext['reExports'];
  symbols: PublicApiContext['symbols'];
} {
  const reExports: PublicApiContext['reExports'] = [];
  const symbols: PublicApiContext['symbols'] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length && (reExports.length < 40 || symbols.length < 60); i++) {
    const line = lines[i];
    for (const m of line.matchAll(RE_STAR)) {
      reExports.push({ barrel: rel, target: m[1], kind: 'star', line: i + 1 });
    }
    for (const m of line.matchAll(RE_NAMED)) {
      reExports.push({ barrel: rel, target: m[2], kind: 'named', line: i + 1 });
    }
    for (const m of line.matchAll(RE_DECL)) {
      if (symbols.length < 60) symbols.push({ name: m[1], kind: 'declaration', file: rel, line: i + 1 });
    }
  }
  return { reExports, symbols };
}

export function buildPublicApiContext(deps: ContextDeps): PublicApiContext | null {
  const pkg = readPkg(deps.scanResult.rootDir);
  if (!pkg) return null;

  const exportsField: Array<{ key: string; value: string }> = [];
  flattenExports(pkg.exports, '', exportsField);
  const entryDecls: Array<{ key: string; value: string }> = [];
  for (const k of ['main', 'module', 'types']) {
    const v = (pkg as Record<string, unknown>)[k];
    if (typeof v === 'string') entryDecls.push({ key: k, value: v });
  }
  if (typeof pkg.bin === 'string') entryDecls.push({ key: 'bin', value: pkg.bin });

  // 入口文件（exports "." / main / module）→ barrel 扫描
  const entryRel: string[] = [];
  const dotExport = exportsField.find(e => e.key === '.');
  for (const decl of [dotExport?.value, pkg.main, pkg.module]) {
    const resolved = resolveEntry(deps.scanResult.rootDir, decl);
    if (resolved && !entryRel.includes(resolved)) entryRel.push(resolved);
  }

  const reExports: PublicApiContext['reExports'] = [];
  const symbols: PublicApiContext['symbols'] = [];
  for (const rel of entryRel) {
    const src = readSourceCached(deps, rel);
    if (src === null) continue;
    const found = scanFile(rel, src);
    reExports.push(...found.reExports);
    symbols.push(...found.symbols);
  }

  if (exportsField.length === 0 && entryDecls.length === 0 && symbols.length === 0 && reExports.length === 0) {
    return null; // 无公共 API 证据：页面跳过
  }

  return {
    packageName: pkg.name ?? '',
    version: pkg.version ?? '',
    exportsField,
    entryDecls,
    reExports: reExports.slice(0, 40),
    symbols: symbols.slice(0, 60),
  };
}
