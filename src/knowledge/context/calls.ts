import { isTestPath } from '../../shared/utils.js';
import { isTauriProject, scanIpcSurface } from '../tauri-ipc.js';
import type { CallsContext, ClassesContext } from '../types.js';
import { isTrustedCallEdge } from './data-flow.js';
import { mergeGraphSignature } from '../signature.js';
import { hasRustSources, scanRustMethodCalls } from '../channels/rust-methods.js';
import {
  type ContextDeps,
  isAppEntryPoint,
  isProductionGraphFile,
  labelToSymbolType,
} from './shared.js';

/** calls 页目标入口组数：入口组不足时以高扇入热点锚定回填（覆盖稀疏的主力补偿） */
const CALLS_MIN_GROUPS = 6;
/** calls 页单次查询边数上限（BFS 每层两次查询各限此数） */
export const CALLS_EDGE_LIMIT = 40;

/**
 * 高出边符号（调用方）锚点清单：采样 CALLS 边后在客户端聚合出边数排序。
 * fan-in 热点是被调方（出边常为 0，立不出组）；调用方锚点才能铺开边表覆盖面。
 */
export function topCallerAnchors(deps: ContextDeps): Array<{ name: string; file: string }> {
  const q = deps.client.queryGraph(
    `MATCH (a)-[:CALLS]->(b) WHERE a.is_test = false AND b.is_test = false
       RETURN a.name AS name, a.file_path AS file, b.name AS callee LIMIT 300`,
  );
  const degree = new Map<string, { name: string; file: string; count: number }>();
  for (const row of q.rows) {
    const name = row[0] as string;
    const file = (row[1] as string) ?? '';
    if (!file || isTestPath(file)) continue;
    const key = `${name}@${file}`;
    const entry = degree.get(key) ?? { name, file, count: 0 };
    entry.count++;
    degree.set(key, entry);
  }
  return [...degree.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(e => ({ name: e.name, file: e.file }));
}

/**
 * calls.md 数据源：调用边表（R2 边表优于时序图）。
 * 用 Cypher 查 (a:Method|Function)-[:CALLS]->(b)，按入口分组。
 * trace_path 不可靠（对 Method 返回空、无 file/line），改用 Cypher CALLS 边。
 * 消费端防线：入口过滤（非代码/构建脚本不立组）+ name@file 双键 BFS（防同名污染）
 * + isTrustedCallEdge（跨语言幽灵边与无词法佐证的边丢弃）。
 * 覆盖面兜底：入口组不足时以高扇入热点锚定补组（图谱 entry_points 漏采/跨语言
 * 入口被滤时不至于整页只剩零星入口）；Tauri 项目附加 IPC 命令对表（真实跨语言执行边）。
 */
export function buildCallsContext(deps: ContextDeps): CallsContext {
  const arch = deps.client.getArchitecture();

  // Rust 方法调用通道（W2）：接收者调用图谱不建边，通道补位（统计进报告；
  // v1 不注入主表，避免破坏组内去重口径）
  if (hasRustSources(deps)) scanRustMethodCalls(deps);

  const groups: CallsContext['groups'] = [];

  const appEntries = arch.entry_points
    .filter(e => isAppEntryPoint(deps, e.file))
    .slice(0, 8);

  for (const entry of appEntries) {
    const edges = collectCallEdges(deps, entry.name, entry.file);
    if (edges.length > 0) {
      groups.push({ entry: entry.name, entryFile: entry.file, kind: 'entry', edges });
    }
  }

  // 扇入表：被调用最多的符号（从 hotspots 取），文件列查图谱取真实 file_path
  const hotspotSlice = arch.hotspots.slice(0, 15);
  const nameList = hotspotSlice.map(n => `"${n.name.replace(/"/g, '\\"')}"`).join(',');
  const fileQ = deps.client.queryGraph(
    `MATCH (n) WHERE n.name IN [${nameList}] AND n.is_test = false
       RETURN n.name AS name, n.file_path AS file LIMIT 15`,
  );
  const fileBySymbol = new Map<string, string>();
  for (const row of fileQ.rows) {
    const file = (row[1] as string) ?? '';
    if (isProductionGraphFile(deps, file)) fileBySymbol.set(row[0] as string, file);
  }
  const fanIn: CallsContext['fanIn'] = hotspotSlice.map(h => ({
    symbol: h.name,
    file: fileBySymbol.get(h.name) ?? '',
    qualifiedName: h.qualified_name,
    inDegree: h.fan_in,
  }));

  // 锚点回填：入口组不足 CALLS_MIN_GROUPS 时补组。fan-in 热点多是被调方
  // （出边少，立组常空），先取高出边符号作锚点，热点兜底；锚点文件去重
  // （同一文件不重复立组，优先跨模块铺开覆盖面）
  if (groups.length < CALLS_MIN_GROUPS) {
    const covered = new Set<string>();
    const anchorFiles = new Set<string>();
    for (const g of groups) {
      anchorFiles.add(g.entryFile);
      for (const e of g.edges) {
        covered.add(e.caller);
        covered.add(e.callee);
      }
    }
    const candidates = [
      ...topCallerAnchors(deps),
      ...hotspotSlice.map(h => ({ name: h.name, file: fileBySymbol.get(h.name) ?? '' })),
    ];
    for (const cand of candidates) {
      if (groups.length >= CALLS_MIN_GROUPS) break;
      if (covered.has(cand.name)) continue;
      if (!cand.file || anchorFiles.has(cand.file)) continue;
      const edges = collectCallEdges(deps, cand.name, cand.file);
      if (edges.length === 0) continue;
      anchorFiles.add(cand.file);
      for (const e of edges) {
        covered.add(e.caller);
        covered.add(e.callee);
      }
      groups.push({ entry: cand.name, entryFile: cand.file, kind: 'hotspot', edges });
    }
  }

  // Tauri IPC：前端 invoke → Rust 命令是真实执行边，但跨语言 CALLS 边被可信性过滤
  // 拦截，图谱不可见；用 tauri-ipc 正则对表补上（与 api 页同源）
  let ipc: CallsContext['ipc'];
  if (isTauriProject(deps.scanResult.rootDir)) {
    ipc = scanIpcSurface(deps.scanResult, deps.sourceCache);
  }

  return { groups, fanIn, ...(ipc ? { ipc } : {}) };
}

/**
 * 单锚点（入口或热点）多层 CALLS 边采集。
 * 组内按 caller->callee 去重（同一被调链在多个入口下重复出现是常态，
 * 跨组全局去重会饿死后续入口组）；visited 按 name@file 双键去重——
 * 同名函数（如 Rust 的 new/run）在不同文件是不同符号，按名去重会截断覆盖。
 */
export function collectCallEdges(
  deps: ContextDeps,
  anchorName: string,
  anchorFile: string,
): CallsContext['groups'][number]['edges'] {
  const edges: CallsContext['groups'][number]['edges'] = [];
  const seen = new Set<string>();
  let frontier = new Set<string>([`${anchorName}@${anchorFile}`]);
  const visited = new Set<string>([`${anchorName}@${anchorFile}`]);

  for (let depth = 0; depth < 3 && frontier.size > 0; depth++) {
    const callerList = [...frontier].map(k => `"${k.split('@')[0].replace(/"/g, '\\"')}"`).join(',');
    // 必须给源节点指定 label（裸 MATCH 会返回 0 行）；分两次查 Method 和 Function
    const qM = deps.client.queryGraph(
      `MATCH (a:Method)-[:CALLS]->(b) WHERE a.name IN [${callerList}] AND a.is_test = false AND b.is_test = false
         RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT ${CALLS_EDGE_LIMIT}`,
    );
    const qF = deps.client.queryGraph(
      `MATCH (a:Function)-[:CALLS]->(b) WHERE a.name IN [${callerList}] AND a.is_test = false AND b.is_test = false
         RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT ${CALLS_EDGE_LIMIT}`,
    );

    const nextFrontier = new Set<string>();
    for (const row of [...qM.rows, ...qF.rows]) {
      const callerName = row[0] as string;
      const callerFile = (row[1] as string) ?? '';
      const calleeName = row[2] as string;
      const calleeFile = (row[3] as string) ?? '';
      const calleeLine = (row[4] as number) ?? 0;
      const calleeParent = (row[5] as string | null) ?? null;

      if (callerName === calleeName && callerFile === calleeFile) continue;
      if (isTestPath(calleeFile)) continue;
      if (!frontier.has(`${callerName}@${callerFile}`)) continue;
      if (!isTrustedCallEdge(deps, callerFile, calleeFile, calleeName)) continue;

      const edgeKey = `${callerName}->${calleeName}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);

      edges.push({ caller: callerName, callee: calleeName, calleeParent, calleeFile, calleeLine });

      const calleeKey = `${calleeName}@${calleeFile}`;
      if (!visited.has(calleeKey)) {
        visited.add(calleeKey);
        nextFrontier.add(calleeKey);
      }
    }
    frontier = nextFrontier;
  }

  return edges;
}

/**
 * classes.md 数据源：类清单 + 每类方法表（降级适配）。
 * MCP 无 INHERITS 边、Class 无 parent_class/is_abstract，故只做扁平类表。
 * 方向是 (c:Class)-[:DEFINES_METHOD]->(m:Method)。
 */
export function buildClassesContext(deps: ContextDeps): ClassesContext {
  // 查所有类及其方法（DEFINES_METHOD 方向：Class → Method）；签名统一合并 return_type（W4）
  const q = deps.client.queryGraph(
    `MATCH (c:Class)-[:DEFINES_METHOD]->(m:Method)
       WHERE c.is_test = false
       RETURN c.name AS cls, c.qualified_name AS qn, c.file_path AS cfile, c.start_line AS cline,
              m.name AS mname, m.signature AS msig, m.visibility AS mvis,
              m.docstring AS mdoc, m.file_path AS mfile, m.start_line AS mline, m.return_type AS mrt
       ORDER BY c.name, m.start_line LIMIT 500`,
  );

  const classMap = new Map<string, ClassesContext['classes'][number]>();
  for (const row of q.rows) {
    const clsName = row[0] as string;
    if (!isProductionGraphFile(deps, (row[2] as string) ?? '')) continue;
    if (!classMap.has(clsName)) {
      classMap.set(clsName, {
        name: clsName,
        qualifiedName: row[1] as string,
        filePath: (row[2] as string) ?? '',
        startLine: (row[3] as number) ?? 0,
        parentClass: null, // MCP 未提供继承数据
        methods: [],
      });
    }
    classMap.get(clsName)!.methods.push({
      name: row[4] as string,
      signature: mergeGraphSignature(row[5] as string | null, row[10] as string | null, (row[8] as string) ?? '') ?? '',
      visibility: (row[6] as string) ?? 'public',
      docstring: (row[7] as string) ?? null,
      filePath: (row[8] as string) ?? '',
      startLine: (row[9] as number) ?? 0,
    });
  }

  return {
    classes: Array.from(classMap.values()),
    hasInheritance: false, // MCP 当前不支持 INHERITS 边
  };
}
