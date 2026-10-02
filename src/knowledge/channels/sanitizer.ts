/**
 * 通道级边净化器（W3）：把原「图谱消费端防线」（wiki-context-builder 家族的
 * isTrustedCallEdge / edgeHasLexicalEvidence）抽为**生产端共享模块**。
 *
 * 任何通道产出的 CALLS 边在进入 context 前统一过 `sanitizeEdge`：
 * 1. 语言域一致——caller/callee 文件必须同属一个语言域，跨语言幽灵边
 *    （TS→Rust，运行时只可能经 IPC 字符串通信）与跨界赋值全部拦截；
 * 2. 词法核验——caller 源码中必须出现 callee 名（拦把成员定义误判为调用的边）。
 *    文件缺失/不可读时按可信处理（宁漏勿误）。
 *
 * 被过滤的边按原因计入通道统计（W6 报告），消费端（calls/data-flow）继续
 * 保留原判定作为纵深防御——净化器上移只为让新通道天然获得同一防线。
 */

import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { languageDomainOf } from '../../shared/utils.js';
import { recordEdgeFilter } from './stats.js';
import type { ContextDeps } from '../context/shared.js';

export type EdgeVerdict = 'ok' | 'cross-language' | 'non-code' | 'no-lexical-evidence';

export interface SanitizeEdgeInput {
  callerFile: string;
  calleeFile: string;
  calleeName: string;
}

/** 单边判定（纯函数）+ 统计记录（副作用，仅供构建报告） */
export function sanitizeEdge(deps: ContextDeps, edge: SanitizeEdgeInput): EdgeVerdict {
  const verdict = judgeEdge(deps, edge);
  if (verdict === 'cross-language') recordEdgeFilter({ crossLanguage: 1 });
  else if (verdict === 'non-code') recordEdgeFilter({ nonCode: 1 });
  else if (verdict === 'no-lexical-evidence') recordEdgeFilter({ noLexicalEvidence: 1 });
  return verdict;
}

/** 批量净化：过滤不可信边并返回保留集（新通道的一行式接入点） */
export function sanitizeEdges<T extends SanitizeEdgeInput>(deps: ContextDeps, edges: readonly T[]): T[] {
  return edges.filter(e => sanitizeEdge(deps, e) === 'ok');
}

function judgeEdge(deps: ContextDeps, edge: SanitizeEdgeInput): EdgeVerdict {
  const callerDomain = languageDomainOf(edge.callerFile);
  const calleeDomain = languageDomainOf(edge.calleeFile);
  if (callerDomain === null || calleeDomain === null) return 'non-code';
  if (callerDomain !== calleeDomain) return 'cross-language';
  return edgeHasLexicalEvidence(deps, edge.callerFile, edge.calleeName) ? 'ok' : 'no-lexical-evidence';
}

export function edgeHasLexicalEvidence(deps: ContextDeps, callerFile: string, calleeName: string): boolean {
  if (!callerFile || !calleeName) return true;
  let src = deps.sourceCache.get(callerFile);
  if (src === undefined) {
    const abs = isAbsolute(callerFile) ? callerFile : join(deps.scanResult.rootDir, callerFile);
    try {
      src = readFileSync(abs, 'utf-8');
    } catch {
      src = null;
    }
    deps.sourceCache.set(callerFile, src);
  }
  if (src === null) return true;
  const escaped = calleeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(src);
}
