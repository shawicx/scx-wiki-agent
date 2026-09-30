import { readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import type { SymbolType } from '../../core/types.js';
import { languageDomainOf } from '../../shared/utils.js';
import {
  collectDataFlowShapes,
  parseEdgeArgs,
  type GraphSymbolFacts,
  type GraphTypeFacts,
  type TransitionFacts,
} from '../data-flow-shape.js';
import type { DataFlowContext, ExecutionSequence } from '../types.js';
import { CALLS_EDGE_LIMIT, topCallerAnchors } from './calls.js';
import {
  type ContextDeps,
  isAppEntryPoint,
  isProductionGraphFile,
  labelToSymbolType,
  readSourceCached,
} from './shared.js';

/** data-flow 形态证据查询的文件数上限（防大仓库单查询爆炸） */
const DATA_FLOW_FILE_LIMIT = 30;
/** data-flow 符号事实查询上限 */
const DATA_FLOW_SYMBOL_LIMIT = 200;
/** data-flow 类型定义节点查询上限 */
const DATA_FLOW_TYPE_LIMIT = 60;

export function buildDataFlowContext(deps: ContextDeps): DataFlowContext {
  const arch = deps.client.getArchitecture();

  // 已被先前序列覆盖的符号不再单独成节（前缀序列已包含其调用链，避免重复展示）
  const sequences: ExecutionSequence[] = [];
  const covered = new Set<string>();
  const transitionFacts: TransitionFacts[] = [];
  let sequenceIndex = 0;
  for (const entry of arch.entry_points.slice(0, 6)) {
    if (!isAppEntryPoint(deps, entry.file)) continue;
    if (covered.has(entry.name)) continue;
    const seq = buildCallChainFromEdges(deps, entry.name, entry.file, { sequenceIndex, facts: transitionFacts });
    if (seq) {
      sequences.push(seq);
      sequenceIndex++;
      for (const m of seq.messages) {
        covered.add(m.from);
        covered.add(m.to);
      }
    }
  }

  // 锚点回填：入口序列不足时以高出边符号补序列（图谱 entry_points 漏采/
  // 跨语言入口被滤时不至于整页因「无执行序列」被剔除）
  if (sequences.length < 3) {
    for (const anchor of topCallerAnchors(deps)) {
      if (sequences.length >= 3) break;
      if (covered.has(anchor.name)) continue;
      const seq = buildCallChainFromEdges(deps, anchor.name, anchor.file, { sequenceIndex, facts: transitionFacts });
      if (seq) {
        sequences.push(seq);
        sequenceIndex++;
        for (const m of seq.messages) {
          covered.add(m.from);
          covered.add(m.to);
        }
      }
    }
  }

  // 数据形态证据层：CALLS 边只决定路径与排序，页面主体由确定性形态证据构成
  const shapes = collectDataFlowShapeEvidence(deps, transitionFacts);

  return {
    sequences,
    stages: shapes.stages,
    transitions: shapes.transitions,
    ioEvents: shapes.ioEvents,
    typeDefinitions: shapes.typeDefinitions,
    shapeCoverage: shapes.shapeCoverage,
  };
}

/**
 * 数据形态证据采集：一次查询批量取参与者符号事实（签名/返回类型/函数体范围）
 * 与本地类型定义节点，交 data-flow-shape 纯函数模块做确定性组装。
 */
function collectDataFlowShapeEvidence(deps: ContextDeps, facts: TransitionFacts[]): ReturnType<typeof collectDataFlowShapes> {
  if (facts.length === 0) {
    return {
      stages: [], transitions: [], ioEvents: [], typeDefinitions: [],
      shapeCoverage: {
        symbolsConsidered: 0, stages: 0, transitions: 0, dataBearingTransitions: 0,
        controlOnlyTransitions: 0, ioEvents: 0, typedStages: 0, unknownStages: 0,
        typeDefinitions: 0, approximatedBodies: 0,
      },
    };
  }
  const files = [...new Set(facts.flatMap(f => [f.callerFile, f.calleeFile]))]
    .filter(f => isProductionGraphFile(deps, f))
    .slice(0, DATA_FLOW_FILE_LIMIT);
  const fileList = files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(',');

  // 符号事实：signature/return_type/param_types/param_names/end_line 都是数据形态的确定性证据
  const symbolRows = fileList.length > 0
    ? deps.client.queryGraph(
      `MATCH (n) WHERE n.file_path IN [${fileList}]
           AND n.is_test = false
           AND n.label IN ['Function', 'Method', 'Class']
         RETURN n.name AS name, n.file_path AS file, n.label AS label,
                n.signature AS sig, n.return_type AS rt, n.param_types AS pt,
                n.param_names AS pn, n.start_line AS sl, n.end_line AS el, n.docstring AS doc
         LIMIT ${DATA_FLOW_SYMBOL_LIMIT}`,
    ).rows
    : [];

  // 本地类型定义节点（interface/type/enum/class）：定义体文本由行区间从源码截取
  const typeRows = fileList.length > 0
    ? deps.client.queryGraph(
      `MATCH (n) WHERE n.file_path IN [${fileList}]
           AND n.is_test = false
           AND n.label IN ['Interface', 'Type', 'Enum', 'Class']
         RETURN n.name AS name, n.label AS label, n.file_path AS file,
                n.start_line AS sl, n.end_line AS el
         LIMIT ${DATA_FLOW_TYPE_LIMIT}`,
    ).rows
    : [];

  const symbols: GraphSymbolFacts[] = symbolRows.map(row => ({
    name: String(row[0] ?? ''),
    file: String(row[1] ?? ''),
    label: String(row[2] ?? ''),
    signature: (row[3] as string | null) ?? null,
    returnType: (row[4] as string | null) ?? null,
    paramTypes: (row[5] as string | null) ?? null,
    paramNames: (row[6] as string | null) ?? null,
    startLine: Number(row[7] ?? 0),
    endLine: Number(row[8] ?? 0),
    docstring: (row[9] as string | null) ?? null,
  })).filter(s => s.name.length > 0 && s.file.length > 0);

  const typeNodes: GraphTypeFacts[] = typeRows.map(row => ({
    name: String(row[0] ?? ''),
    label: String(row[1] ?? ''),
    file: String(row[2] ?? ''),
    startLine: Number(row[3] ?? 0),
    endLine: Number(row[4] ?? 0),
  })).filter(t => t.name.length > 0 && t.file.length > 0);

  return collectDataFlowShapes({
    transitions: facts,
    symbols,
    typeNodes,
    readSource: file => readSourceCached(deps, file),
    isProduction: file => isProductionGraphFile(deps, file),
  });
}

/**
 * 调用边可信性判定（图谱消费端防线，拦上游误建边）：
 * 1. 语言域一致——caller/callee 文件必须同属一个语言域（ts/rust），排除跨语言
 *    幽灵边（如 Rust run() 调 TS 前端函数）与非代码节点（tauri.conf.json 作被调方）；
 * 2. 词法核验——caller 源码中必须出现 callee 名（拦 constructor→write 这类
 *    把类成员定义误判为调用的边）。文件缺失/不可读时按可信处理（宁漏勿误）。
 */
export function isTrustedCallEdge(deps: ContextDeps, callerFile: string, calleeFile: string, calleeName: string): boolean {
  const callerDomain = languageDomainOf(callerFile);
  const calleeDomain = languageDomainOf(calleeFile);
  if (callerDomain === null || calleeDomain === null || callerDomain !== calleeDomain) return false;
  return edgeHasLexicalEvidence(deps, callerFile, calleeName);
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

/**
 * 基于 CALLS 边 BFS 构建真实调用链（修复伪线性化问题）。
 * trace_path 返回扁平的 callee 列表（只有 hop 层级，无 caller→callee 边），
 * 直接线性化会把并行分支误画成串行序列。
 * 这里改用 Cypher 查精确的 CALLS 边，按 BFS 层级还原真实的 caller→callee 关系。
 * frontier 用 name@file 双键，防止同名符号跨语言/跨文件互相污染。
 */
export function buildCallChainFromEdges(
  deps: ContextDeps,
  entryName: string,
  entryFile: string,
  collector: { sequenceIndex: number; facts: TransitionFacts[] },
): ExecutionSequence | null {
  const MAX_DEPTH = 3;
  const MAX_NODES = 25;

  const participants = new Map<string, { name: string; type: SymbolType; filePath: string }>();
  const messages: ExecutionSequence['messages'] = [];
  participants.set(entryName, { name: entryName, type: 'function', filePath: entryFile });

  // BFS：按层级查询精确 CALLS 边
  let frontier = new Set<string>([`${entryName}@${entryFile}`]);
  const visited = new Set<string>([entryName]);

  for (let depth = 0; depth < MAX_DEPTH && frontier.size > 0 && participants.size < MAX_NODES; depth++) {
    const nameList = [...frontier].map(k => `"${k.split('@')[0].replace(/"/g, '\\"')}"`).join(',');
    // 查当前 frontier 中每个节点的直接 callee（过滤测试节点）
    // 注意：该 Cypher 实现不支持 NOT ... CONTAINS 语法，用 is_test 过滤 + 结果后处理。
    // r.line / r.args / r.confidence / r.strategy 是图谱边上的数据形态线索：
    // r.line 是调用点锚点，callee.start_line 是定义锚点，二者不得混用。
    const q = deps.client.queryGraph(
      `MATCH (caller)-[r:CALLS]->(callee)
         WHERE caller.name IN [${nameList}]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, caller.file_path AS callerFile,
                callee.name AS callee, callee.file_path AS file, callee.label AS label,
                callee.start_line AS calleeLine, r.line AS callLine, r.args AS args,
                r.confidence AS confidence, r.strategy AS strategy
         LIMIT ${CALLS_EDGE_LIMIT}`,
      CALLS_EDGE_LIMIT,
    );

    const nextFrontier = new Set<string>();
    for (const row of q.rows) {
      const callerName = row[0] as string;
      const callerFile = (row[1] as string) ?? '';
      const calleeName = row[2] as string;
      const calleeFile = (row[3] as string) ?? '';
      const calleeLabel = row[4] as string;
      const calleeLine = Number(row[5] ?? 0);
      const callLine = Number(row[6] ?? 0);
      const args = parseEdgeArgs(row[7]);
      const confidence = row[8] === null || row[8] === undefined || row[8] === ''
        ? undefined
        : Number(row[8]);
      const strategy = typeof row[9] === 'string' && row[9].length > 0 ? row[9] : undefined;

      // 跳过自调用
      if (callerName === calleeName) continue;

      // JS 层兜底过滤测试文件（Cypher 的 NOT CONTAINS 不兼容）
      if (/\.(test|spec)\.|__tests__/.test(calleeFile)) continue;

      // 双键校验：caller 必须是本轮 frontier 中的具体符号（同名的其他语言/文件符号不算）
      if (!frontier.has(`${callerName}@${callerFile}`)) continue;

      // 可信边判定：语言域一致 + caller 源码词法核验
      if (!isTrustedCallEdge(deps, callerFile, calleeFile, calleeName)) continue;

      if (!participants.has(calleeName)) {
        participants.set(calleeName, {
          name: calleeName,
          type: labelToSymbolType(calleeLabel),
          filePath: calleeFile,
        });
      }

      // 每条 message 对应一条真实的 CALLS 边
      messages.push({
        from: callerName,
        to: calleeName,
        label: calleeName,
        callFile: callerFile,
        callLine,
        calleeFile,
        calleeLine,
        args: args.map(a => ({
          expression: a.expression,
          evidence: 'call-argument' as const,
          ...(callLine > 0 ? { anchor: `${callerFile}:${callLine}` } : {}),
        })),
        ...(confidence !== undefined && Number.isFinite(confidence) ? { confidence } : {}),
        ...(strategy ? { strategy } : {}),
      });

      collector.facts.push({
        caller: callerName,
        callerFile,
        callee: calleeName,
        calleeFile,
        calleeLine,
        callLine,
        args: args.map(a => ({ expression: a.expression ?? '', ...(a.value ? { value: a.value } : {}) })),
        ...(confidence !== undefined && Number.isFinite(confidence) ? { confidence } : {}),
        ...(strategy ? { strategy } : {}),
        sequenceIndex: collector.sequenceIndex,
        depth,
        isEntry: depth === 0 && callerName === entryName,
      });

      if (!visited.has(calleeName)) {
        visited.add(calleeName);
        nextFrontier.add(`${calleeName}@${calleeFile}`);
      }
    }

    frontier = nextFrontier;
    if (q.rows.length === 0) break;
  }

  if (messages.length === 0) return null;

  return {
    name: entryName,
    entrySymbol: entryName,
    participants: Array.from(participants.values()),
    messages,
  };
}
