/**
 * 多语言源码模式层（Python / Go / JVM / Swift）：定义行、注释形态、限制常量。
 * TS/Rust 的既有正则留在原模块（intent/shared、source-fallback）；本模块
 * 以「域 → 模式组」的方式补齐其余语言域，调用方按域分发。
 */

import type { SymbolType } from '../core/types.js';

/** 顶层定义行（意图证据 symbol-comment 锚定用；组 2 = 名称，兼容既有调用形态） */
const PY_TOPLEVEL_DEF_RE = /^(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/;
const GO_TOPLEVEL_DEF_RE = /^(func|type)\s+(?:\([^)]*\)\s+)?([A-Za-z_]\w*)/;
const JVM_TOPLEVEL_DEF_RE =
  /^((?:public|private|protected|internal|open|abstract|final|static|sealed|data|companion)\s+)*(?:class|interface|object|enum\s+class|fun)\s+([A-Za-z_]\w*)/;
// Swift：访问修饰/静态/final/属性前缀 + 类型或函数（顶层不缩进；extension 归类型证据）
const SWIFT_TOPLEVEL_DEF_RE =
  /^(?:@\w+\s+)?(?:(?:public|open|internal|private|fileprivate|static|final)\s+)*(class|struct|enum|protocol|actor|extension|func)\s+([A-Za-z_]\w*)/;

/** intent 通道：行是否为该语言域的顶层定义 */
export function nativeTopLevelDef(line: string, domain: string): { name: string } | null {
  const re = domain === 'python' ? PY_TOPLEVEL_DEF_RE : domain === 'go' ? GO_TOPLEVEL_DEF_RE
    : domain === 'jvm' ? JVM_TOPLEVEL_DEF_RE : domain === 'swift' ? SWIFT_TOPLEVEL_DEF_RE : null;
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
/** JVM 定义行允许的前导修饰符（Kotlin/Java；锚定行首的同时不误伤带修饰符的真定义） */
const JVM_MODIFIERS = '(?:(?:public|private|protected|internal|static|final|abstract|open|override|sealed|data|inline|suspend|companion)\\s+)*';
const JVM_DEF_PATTERNS: Array<{ re: RegExp; type: SymbolType }> = [
  // 行首锚定（trimmed 行）：未锚定时注释/KDoc 里的 `interface Bar`、`fun doStuff()`
  // 会被采成幽灵符号并入符号全集，反向免标 LLM 编造的同名声明
  { re: new RegExp(`^${JVM_MODIFIERS}(?:class|interface|object|enum)\\s+([A-Za-z_]\\w*)`), type: 'class' },
  { re: new RegExp(`^${JVM_MODIFIERS}fun\\s+([A-Za-z_]\\w*)\\s*\\(`), type: 'function' },
  { re: new RegExp(`^(?:public|private|protected|static|final)\\s+(?:[\\w<>\\[\\], ?]+\\s+)?([A-Za-z_]\\w*)\\s*\\(`), type: 'method' },
];
/** Swift 定义行允许的前导修饰符（trimmed 行；类型成员与顶层共用 func/class 形态） */
const SWIFT_MODIFIERS = '(?:@[\\w]+\\s+)?(?:(?:public|open|internal|private|fileprivate|static|final|override|required|convenience|mutating|nonisolated)\\s+)*';
const SWIFT_DEF_PATTERNS: Array<{ re: RegExp; type: SymbolType }> = [
  { re: new RegExp(`^${SWIFT_MODIFIERS}func\\s+([A-Za-z_]\\w*)\\s*[(<]`), type: 'function' },
  { re: new RegExp(`^${SWIFT_MODIFIERS}(?:final\\s+)?(?:class|struct|enum|actor)\\s+([A-Z]\\w*)`), type: 'class' },
  { re: new RegExp(`^${SWIFT_MODIFIERS}protocol\\s+([A-Z]\\w*)`), type: 'interface' },
  { re: new RegExp(`^${SWIFT_MODIFIERS}extension\\s+([A-Z]\\w*)`), type: 'class' },
  // 类型级常量（static let/var）；局部 let 靠 static/全大写约束排除
  { re: new RegExp(`^${SWIFT_MODIFIERS}static\\s+(?:let|var)\\s+([A-Za-z_]\\w*)`), type: 'variable' },
  { re: /^let\s+([A-Z_][A-Z0-9_]{2,})\s*[:=]/, type: 'variable' },
];

export function nativeDefinedNameOn(line: string, domain: string): { name: string; type: SymbolType } | null {
  const patterns = domain === 'python' ? PY_DEF_PATTERNS
    : domain === 'go' ? GO_DEF_PATTERNS
    : domain === 'jvm' ? JVM_DEF_PATTERNS
    : domain === 'swift' ? SWIFT_DEF_PATTERNS : null;
  if (patterns === null) return null;
  const trimmed = line.trim();
  // 注释行整体排除（//、/*、*、#）：注释中提及 def/class/fun 关键字不产生符号
  if (/^(?:\/\/|\/\*|\*|#)/.test(trimmed)) return null;
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
    new RegExp(`^${JVM_MODIFIERS}(?:class|interface|object|enum)\\s+${n}\\b`),
    new RegExp(`^${JVM_MODIFIERS}fun\\s+${n}\\s*\\(`),
  ];
  if (domain === 'swift') return [
    new RegExp(`^${SWIFT_MODIFIERS}func\\s+${n}\\s*[(<]`),
    new RegExp(`^${SWIFT_MODIFIERS}(?:final\\s+)?(?:class|struct|enum|actor|protocol|extension)\\s+${n}\\b`),
  ];
  return [];
}

/** 限制常量定义行（python/go/jvm/swift；组 1 = 名称，组 2 = 值） */
export const NATIVE_CONST_DEF_RE: Record<string, RegExp> = {
  // Python 无 const 关键字：全大写模块级赋值（排除 == 比较与类型注解）
  python: /^([A-Z0-9_]*?(?:MAX|MIN|LIMIT|TIMEOUT|DEPTH|SIZE|COUNT|THRESHOLD|RETRY|CACHE)[A-Z0-9_]*)\s*=\s*([^#\n]+)/,
  go: /^const\s+([A-Za-z0-9_]*?(?:MAX|MIN|Max|Min|LIMIT|Limit|TIMEOUT|Timeout|DEPTH|Depth|SIZE|Size|COUNT|Count|THRESHOLD|Threshold|RETRY|Retry|CACHE|Cache)[A-Za-z0-9_]*)\s*=\s*([^;\n]+)/,
  jvm: /(?:static\s+final|final\s+static|const\s+val)\s+(?:[\w.\w<>\[\]]+\s+)?([A-Z0-9_]*?(?:MAX|MIN|LIMIT|TIMEOUT|DEPTH|SIZE|COUNT|THRESHOLD|RETRY|CACHE)[A-Z0-9_]*)\s*(?::\s*[\w.<>[\]]+)?\s*=\s*([^;\n]+)/,
  // Swift 惯用 lowerCamelCase 常量：static let（类型级，任意缩进）或全大写顶层 let
  swift: /^\s*(?:(?:public|open|internal|private|fileprivate)\s+)?(?:static\s+)?(?:let|var)\s+([A-Za-z0-9_]*?(?:max|Max|MAX|min|Min|MIN|limit|Limit|LIMIT|timeout|Timeout|TIMEOUT|depth|Depth|DEPTH|size|Size|SIZE|count|Count|COUNT|threshold|Threshold|THRESHOLD|retry|Retry|RETRY|cache|Cache|CACHE)[A-Za-z0-9_]*)\s*(?::\s*[^=\n]+)?=\s*([^;\n]+)/,
};

/** 域是否为本模块覆盖的原生语言域 */
export function isNativeDomain(domain: string | null): boolean {
  return domain === 'python' || domain === 'go' || domain === 'jvm' || domain === 'swift';
}
