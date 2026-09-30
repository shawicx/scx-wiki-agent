/**
 * 函数体范围与源码签名回落（自 data-flow-shape.ts 拆出；纯搬移，零逻辑变化）。
 *
 * 承载：按语言域的定义行探测、括号匹配确定函数体范围（失败按行数窗口近似）、
 * 函数体内 return 字面量保守扫描。
 */

import { skipString, inferLiteralShape, truncate, DATA_FLOW_MAX_EXPRESSION } from './shapes.js';

/** 无 end_line 且括号匹配失败时的函数体近似窗口（行） */
export const DATA_FLOW_BODY_FALLBACK_LINES = 80;

export interface BodyRange {
  /** 0 基起始行（含） */
  from: number;
  /** 0 基结束行（含） */
  to: number;
  approximated: boolean;
  /** 定义行文本（源码回落签名解析用） */
  definitionText: string;
}

/** 按语言域生成定义行探测正则（源码回落，仅对已知文件做名字驱动扫描） */
function definitionPatterns(name: string, domain: string): RegExp[] {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (domain === 'rust') {
    return [
      new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:async\\s+)?fn\\s+${n}\\b`),
      new RegExp(`^\\s*(?:pub(?:\\([^)]*\\))?\\s+)?(?:struct|enum|trait)\\s+${n}\\b`),
    ];
  }
  return [
    new RegExp(`^\\s*(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?(?:async\\s+)?function\\s+${n}\\b`),
    new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+${n}\\s*[:=]`),
    new RegExp(`^\\s*(?:public|private|protected|static|async|override|readonly|abstract|\\*|\\s)*${n}\\s*(?:<[^>]*>)?\\s*\\(`),
    new RegExp(`^\\s*(?:export\\s+)?(?:abstract\\s+)?class\\s+${n}\\b`),
    new RegExp(`^\\s*(?:export\\s+)?(?:type|interface|enum)\\s+${n}\\b`),
  ];
}

export function findDefinitionIndex(lines: string[], name: string, domain: string, from = 0): number {
  const patterns = definitionPatterns(name, domain);
  for (let i = from; i < lines.length; i++) {
    if (!lines[i].includes(name)) continue;
    for (const re of patterns) {
      if (re.test(lines[i])) return i;
    }
  }
  return -1;
}

/** 从定义行起做括号匹配确定函数体范围（失败则按行数窗口近似） */
export function resolveBodyRange(
  lines: string[],
  definitionIndex: number,
  graphEndLine?: number,
): BodyRange {
  const definitionText = lines.slice(definitionIndex, Math.min(lines.length, definitionIndex + 6)).join('\n');
  if (graphEndLine !== undefined && graphEndLine > definitionIndex + 1) {
    return { from: definitionIndex, to: Math.min(lines.length - 1, graphEndLine - 1), approximated: false, definitionText };
  }
  // 从定义行起找函数体起始 `{`（最多向后 6 行，跳过签名换行）
  let depth = 0;
  let started = false;
  const hardEnd = Math.min(lines.length - 1, definitionIndex + DATA_FLOW_BODY_FALLBACK_LINES);
  for (let i = definitionIndex; i <= hardEnd; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === "'" || ch === '"' || ch === '`') { c = skipString(line, c) - 1; continue; }
      if (ch === '/' && line[c + 1] === '/') break;
      if (ch === '{') { depth++; started = true; continue; }
      if (ch === '}') {
        depth--;
        if (started && depth === 0) {
          return { from: definitionIndex, to: i, approximated: false, definitionText };
        }
      }
    }
  }
  return {
    from: definitionIndex,
    to: hardEnd,
    approximated: true,
    definitionText,
  };
}

/** 返回值字面量形态（源码保守扫描；仅字面量，不推导表达式类型） */
export function findReturnLiteral(lines: string[], from: number, to: number): { expression: string; type: string } | undefined {
  for (let i = from; i <= to && i < lines.length; i++) {
    const m = lines[i].match(/\breturn\s+([^;\n]+)/);
    if (!m) continue;
    const expr = m[1].trim();
    const type = inferLiteralShape(expr);
    if (type) return { expression: truncate(expr, DATA_FLOW_MAX_EXPRESSION), type };
  }
  return undefined;
}
