/**
 * 多语言源码模式层（Python / Go / JVM）：定义行、注释形态、限制常量。
 * TS/Rust 的既有正则留在原模块（intent/shared、source-fallback）；本模块
 * 以「域 → 模式组」的方式补齐其余语言域，调用方按域分发。
 */

import type { SymbolType } from '../core/types.js';

/** 顶层定义行（意图证据 symbol-comment 锚定用；组 2 = 名称，兼容既有调用形态） */
const PY_TOPLEVEL_DEF_RE = /^(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/;
const GO_TOPLEVEL_DEF_RE = /^(func|type)\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)/;
const JVM_TOPLEVEL_DEF_RE =
  /^((?:public|private|protected|internal|open|abstract|final|static|sealed|data|companion)\s+)*(?:class|interface|object|enum\s+class|fun)\s+([A-Za-z_]\w*)/;

/** intent 通道：行是否为该语言域的顶层定义 */
export function nativeTopLevelDef(line: string, domain: string): { name: string } | null {
  const re = domain === 'python' ? PY_TOPLEVEL_DEF_RE : domain === 'go' ? GO_TOPLEVEL_DEF_RE
    : domain === 'jvm' ? JVM_TOPLEVEL_DEF_RE : null;
  if (re === null) return null;
  const m = line.match(re);
  return m ? { name: m[2] } : null;
}

/** source-fallback 通道：定义行 → [名称, 符号类型] */
const PY_DEF_PATTERNS: Array<{ re: RegExp; type: SymbolType }> = [
  { re: /^(?:async\s+)?def\s+([A-Za-z_]\w*)/, type: 'function' },
  { re: /^class\s+([A-Za-z_]\w*)/, type: 'class' },
  // 模块级常量（全大写 UPPER_SNAKE = ...）
  { re: /^([A-Z_][A-Z0-9_]{2,})\s*=(?!=)/, type: 'variable' },
];
const GO_DEF_PATTERNS: Array<{ re: RegExp; type: SymbolType }> = [
  { re: /^func\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)/, type: 'function' },
  { re: /^type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/, type: 'class' },
  { re: /^const\s+([A-Za-z_]\w*)/, type: 'variable' },
];
const JVM_DEF_PATTERNS: Array<{ re: RegExp; type: SymbolType }> = [
  { re: /(?:class|interface|object|enum)\s+([A-Za-z_]\w*)/, type: 'class' },
  { re: /fun\s+([A-Za-z_]\w*)\s*\(/, type: 'function' },
  { re: /(?:public|private|protected|static|final)\s+(?:[\w<>[\], ?]+\s+)?([A-Za-z_]\w*)\s*\(/, type: 'method' },
];

export function nativeDefinedNameOn(line: string, domain: string): { name: string; type: SymbolType } | null {
  const patterns = domain === 'python' ? PY_DEF_PATTERNS
    : domain === 'go' ? GO_DEF_PATTERNS
    : domain === 'jvm' ? JVM_DEF_PATTERNS : null;
  if (patterns === null) return null;
  const trimmed = line.trim();
  for (const { re, type } of patterns) {
    const m = trimmed.match(re);
    if (m) return { name: m[1], type };
  }
  return null;
}

/** 名字驱动的定义行探测（data-flow body-range / 符号签名回落用） */
export function nativeDefinitionPatterns(name: string, domain: string): RegExp[] {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (domain === 'python') return [new RegExp(`^(?:async\\s+)?def\\s+${n}\\b`), new RegExp(`^class\\s+${n}\\b`)];
  if (domain === 'go') return [new RegExp(`^func\\s+(?:\\([^)]*\\)\\s+)?${n}\\b`), new RegExp(`^type\\s+${n}\\b`)];
  if (domain === 'jvm') return [
    new RegExp(`(?:class|interface|object|enum)\\s+${n}\\b`),
    new RegExp(`fun\\s+${n}\\s*\\(`),
  ];
  return [];
}

/** 限制常量定义行（python/go/jvm；组 1 = 名称，组 2 = 值） */
export const NATIVE_CONST_DEF_RE: Record<string, RegExp> = {
  // Python 无 const 关键字：全大写模块级赋值（排除 == 比较与类型注解）
  python: /^([A-Z0-9_]*?(?:MAX|MIN|LIMIT|TIMEOUT|DEPTH|SIZE|COUNT|THRESHOLD|RETRY|CACHE)[A-Z0-9_]*)\s*=\s*([^#\n]+)/,
  go: /^const\s+([A-Za-z0-9_]*?(?:MAX|MIN|Max|Min|LIMIT|Limit|TIMEOUT|Timeout|DEPTH|Depth|SIZE|Size|COUNT|Count|THRESHOLD|Threshold|RETRY|Retry|CACHE|Cache)[A-Za-z0-9_]*)\s*=\s*([^;\n]+)/,
  jvm: /(?:static\s+final|final\s+static|const\s+val)\s+(?:[\w.\w<>\[\]]+\s+)?([A-Z0-9_]*?(?:MAX|MIN|LIMIT|TIMEOUT|DEPTH|SIZE|COUNT|THRESHOLD|RETRY|CACHE)[A-Z0-9_]*)\s*(?::\s*[\w.<>[\]]+)?\s*=\s*([^;\n]+)/,
};

/** 域是否为本模块覆盖的原生语言域 */
export function isNativeDomain(domain: string | null): boolean {
  return domain === 'python' || domain === 'go' || domain === 'jvm';
}
