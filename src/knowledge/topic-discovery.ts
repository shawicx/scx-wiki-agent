/**
 * 自适应主题页：确定性主题发现（DeepWiki 动态大纲的 CLI 化）。
 *
 * 发现规则全确定性（无 LLM 参与）：
 * - clusters 主路径：成员 ≥5 且 top_nodes 文件跨 ≥2 个 packages（跨模块协作面），
 *   按 members×cohesion 排序取前 4；单一 package 的职责由 modules 页覆盖，不立题。
 * - boundaries 兜底：无合格 cluster 时，取 call_count 最高的跨包边界对为题。
 * - 探测不出就一个不生成（宁缺毋滥）。
 *
 * 生命周期由 .scx-wiki-agent/topics.json 锁定：首次 build 探测写入，
 * 后续 build 直接读取——图谱演化不导致页面漂移/换名；
 * 用户可手工编辑（删主题/改标题），build 尊重手工内容；--refresh-topics 重新探测覆盖。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ArchitectureData } from '../mcp/types.js';
import type { ScanResult } from '../core/scanner.js';
import { isTestPath, matchPackageForFile } from '../shared/utils.js';

export interface TopicDefinition {
  id: string;
  title: string;
  files: string[];
  /** 手工锁定：置 true 后重探测（含 --refresh-topics）不再丢弃该主题 */
  pinned?: boolean;
}

const TOPICS_FILE = 'topics.json';
const MAX_TOPICS = 4;
const MIN_CLUSTER_MEMBERS = 5;
/** 立题最低文件数（与证据下限对齐，避免主题页天然薄证据） */
const MIN_TOPIC_FILES = 3;
const MAX_TOPIC_FILES = 12;
/** 主题间文件重叠率上限（超过视为同一协作面，后者不立题） */
const MAX_TOPIC_OVERLAP = 0.5;

/** 目录级通用段（无语义，不配作为主题名来源；连同 sourceDirs 一并剔除） */
const GENERIC_DIR_SEGMENTS = new Set([
  'src', 'lib', 'app', 'root', 'node_modules', 'test', 'tests', '__tests__',
  'shared', 'common', 'internal',
  // 平台/布局段：双端仓库的目录回声（android/、macos/…），不是模块语义
  'android', 'macos', 'ios', 'windows', 'linux', 'sources', 'main', 'java', 'com', 'org',
]);

/** ascii 标识符 → kebab-case slug（空结果返回 null） */
function kebab(s: string): string | null {
  const slug = s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : null;
}

/** 两组文件的 Jaccard 重叠率 */
function overlapRatio(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}


/**
 * M4 语义门槛：纯 re-export 兼容壳不成题。
 * 聚度排序会把「全是 export … from 的兼容层文件」聚成高内聚簇（它们彼此
 * 引用同一批目标），选中后产出的主题页 symbols/edges 全空、通篇「信息不足」。
 * 判定：文件的非空非注释行全部是 re-export 形态 → 视为壳。主题至少需要
 * 1 个非壳成员文件（有真实实现的协作面）才值得成页。
 */
const RE_EXPORT_RE = /^export\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+['"]/;
function isReExportShell(source: string): boolean {
  let sawReExport = false;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
    if (RE_EXPORT_RE.test(line)) {
      sawReExport = true;
      continue;
    }
    return false; // 存在任何实质语句
  }
  return sawReExport;
}

export class TopicDiscovery {
  constructor(
    private client: CodebaseMemoryClient,
    private scanResult: ScanResult,
  ) {}

  discover(): TopicDefinition[] {
    const arch = this.client.getArchitecture();
    const topics = this.fromClusters(arch);
    if (topics.length === 0) {
      const fallback = this.fromBoundaries(arch);
      if (fallback) topics.push(fallback);
    }
    return topics;
  }

  /** 至少一个成员文件含实质实现（非纯 re-export 壳；读失败按非壳处理，宁漏勿误） */
  private hasSubstantiveMember(files: string[]): boolean {
    const byPath = new Map(this.scanResult.productionFiles.map(f => [f.relativePath, f.absolutePath]));
    for (const rel of files) {
      const abs = byPath.get(rel);
      if (!abs) continue;
      try {
        if (!isReExportShell(readFileSync(abs, 'utf-8'))) return true;
      } catch {
        return true; // 读失败不拦截（fail-open）
      }
    }
    return false;
  }

  private fromClusters(arch: ArchitectureData): TopicDefinition[] {
    const candidates = [...arch.clusters]
      .filter(c => c.members >= MIN_CLUSTER_MEMBERS && c.top_nodes.length >= 3)
      .sort((a, b) => (b.members * b.cohesion) - (a.members * a.cohesion));

    const topics: TopicDefinition[] = [];
    const usedIds = new Set<string>();
    const usedTitles = new Set<string>();
    for (const cluster of candidates) {
      const files = this.filesForSymbols(cluster.top_nodes);
      const pkgs = this.packagesForFiles(files, arch);
      if (pkgs.size < 2 || files.length < MIN_TOPIC_FILES) continue;
      // M4：成员全为 re-export 兼容壳的簇不成题（高聚度≠有语义）
      if (!this.hasSubstantiveMember(files)) continue;
      // 与已立题主题高度重叠的簇不重复立题（同一协作面的两种聚类切法）
      if (topics.some(t => overlapRatio(t.files, files) > MAX_TOPIC_OVERLAP)) continue;

      const def = this.topicDefinition(cluster, files, [...pkgs], usedIds, usedTitles);
      if (!def) continue;
      topics.push(def);
      usedTitles.add(def.title);
      if (topics.length >= MAX_TOPICS) break;
    }
    return topics;
  }

  /**
   * 主题命名（语义优先级，标题撞名时逐级退避）：
   * 1. cluster.label 为语义文本时直接用作标题（目录回声除外——双端仓库的簇
   *    label 常是 "android"/"macos" 这类平台目录名，与成员路径段同名即判回声）；
   * 2. 符号对命名：簇内前两个 PascalCase 类型符号（协作面的具体载体，比目录段
   *    更贴近「这些文件为何被聚在一起」）；
   * 3. 模块复合命名：目录段（剔通用段）频次前几名合成「A · B 跨模块协作」；
   * 4. 跨包名联合（packages 粒度更粗时的兜底）。
   * id 用命名源的 kebab slug（可读、跨构建稳定），冲突时追加序号。
   */
  private topicDefinition(
    cluster: ArchitectureData['clusters'][number],
    files: string[],
    pkgs: string[],
    usedIds: Set<string>,
    usedTitles: Set<string>,
  ): TopicDefinition | null {
    const dirSegs = new Set(files.flatMap(f => f.split('/').slice(0, -1)).map(s => s.toLowerCase()));
    const semanticLabel = cluster.label
      && !cluster.label.includes('/')
      && !this.scanResult.sourceDirs.includes(cluster.label)
      && !dirSegs.has(cluster.label.toLowerCase())
      ? cluster.label
      : null;
    const symbolPair = this.symbolPairTitle(cluster.top_nodes);
    const moduleTokens = this.moduleTokensForFiles(files);
    const candidates: Array<{ title: string; idBase: string | null }> = [];
    if (semanticLabel) candidates.push({ title: semanticLabel, idBase: kebab(semanticLabel) });
    if (symbolPair) candidates.push({ title: symbolPair.title, idBase: symbolPair.idBase });
    if (moduleTokens.length >= 2) {
      candidates.push({ title: `${moduleTokens.join(' · ')} 跨模块协作`, idBase: kebab(moduleTokens.join('-')) });
    }
    if (pkgs.length >= 2) {
      candidates.push({ title: `${pkgs.slice(0, 2).join(' ↔ ')} 协作`, idBase: kebab(pkgs.join('-')) });
    }
    // 标题撞名逐级退避（双端仓库两个簇的目录段/包名完全相同是常态）
    const picked = candidates.find(c => !usedTitles.has(c.title)) ?? null;
    if (picked === null) return null;
    // id 独立推导（模块 slug 优先——ASCII 稳定；语义标题可能是中文，kebab 为空）
    const baseId = (moduleTokens.length >= 2 ? kebab(moduleTokens.join('-')) : null)
      ?? symbolPair?.idBase
      ?? (pkgs.length >= 2 ? kebab(pkgs.join('-')) : null)
      ?? kebab(picked.title)
      ?? `topic-${cluster.id}`;
    let id = baseId;
    for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
    usedIds.add(id);
    return { id, title: picked.title, files: files.slice(0, MAX_TOPIC_FILES) };
  }

  /** 簇内前两个 PascalCase 类型符号 → 协作面命名（id 用 slug；不足两个返回 null） */
  private symbolPairTitle(topNodes: string[]): { title: string; idBase: string } | null {
    const types = topNodes.filter(n => /^[A-Z]\w{3,}$/.test(n)).slice(0, 2);
    if (types.length < 2) return null;
    const idBase = kebab(types.join('-'));
    return idBase ? { title: `${types[0]} · ${types[1]} 协作`, idBase } : null;
  }

  /**
   * 从主题文件提取模块语义段：剔除通用目录段与 sourceDirs 后，按文件频次排名；
   * 与已选段同链共现的祖先/后代段跳过（frontends 与其子目录 xterm 只取其一）。
   */
  private moduleTokensForFiles(files: string[]): string[] {
    const generics = new Set([...GENERIC_DIR_SEGMENTS, ...this.scanResult.sourceDirs.map(d => d.toLowerCase())]);
    const chains: string[][] = [];
    for (const file of files) {
      const segs = file.split('/').slice(0, -1)
        .filter(seg => !generics.has(seg.toLowerCase()) && !/^\d/.test(seg));
      if (segs.length > 0) chains.push(segs);
    }
    const freq = new Map<string, number>();
    const firstSeen = new Map<string, number>();
    for (const chain of chains) {
      for (const seg of new Set(chain)) {
        freq.set(seg, (freq.get(seg) ?? 0) + 1);
        if (!firstSeen.has(seg)) firstSeen.set(seg, firstSeen.size);
      }
    }
    const ranked = [...freq.entries()].sort((a, b) =>
      b[1] - a[1] || (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0));
    const picked: string[] = [];
    for (const [seg] of ranked) {
      if (picked.length >= 3) break;
      const coOccurs = chains.some(chain => chain.includes(seg) && picked.some(p => chain.includes(p)));
      if (coOccurs) continue;
      picked.push(seg);
    }
    return picked;
  }

  private fromBoundaries(arch: ArchitectureData): TopicDefinition | null {
    const top = [...arch.boundaries].sort((a, b) => b.call_count - a.call_count)[0];
    if (!top || top.call_count <= 0) return null;
    const pkgFile = (pkgName: string) =>
      this.scanResult.productionFiles
        .map(f => f.relativePath)
        .filter(p => matchPackageForFile(p, [pkgName]) !== null);
    const files = [...pkgFile(top.from), ...pkgFile(top.to)].slice(0, MAX_TOPIC_FILES);
    if (files.length < MIN_TOPIC_FILES) return null;
    if (!this.hasSubstantiveMember(files)) return null; // M4：同款语义门槛
    return {
      id: `topic-${top.from}-${top.to}`,
      title: `${top.from} ↔ ${top.to} 协作`,
      files,
    };
  }

  /** 符号名 → 扫描清单内的生产文件路径（去重，过滤测试路径） */
  private filesForSymbols(names: string[]): string[] {
    const known = new Set(this.scanResult.productionFiles.map(f => f.relativePath));
    const list = names.map(n => `"${n.replace(/"/g, '\\"')}"`).join(',');
    const q = this.client.queryGraph(
      `MATCH (n) WHERE n.name IN [${list}] AND n.is_test = false
       RETURN n.name AS name, n.file_path AS file LIMIT 30`,
    );
    const files = new Set<string>();
    for (const row of q.rows) {
      const file = (row[1] as string) ?? '';
      if (file && !isTestPath(file) && known.has(file)) files.add(file);
    }
    return [...files];
  }

  private packagesForFiles(files: string[], arch: ArchitectureData): Set<string> {
    const pkgNames = arch.packages.map(p => p.name);
    const pkgs = new Set<string>();
    for (const file of files) {
      const pkg = matchPackageForFile(file, pkgNames);
      if (pkg) pkgs.add(pkg);
    }
    return pkgs;
  }
}

/**
 * 读取锁定的主题定义；文件不存在返回 null（触发首次探测）。
 * M8：支持 v2 包装 `{ schemaVersion: 2, topics: [...] }`（写盘为该形态）；
 * 旧版裸数组（v1）读入兼容（迁移在下次保存时自然完成）。
 */
export function loadTopics(agentDir: string): TopicDefinition[] | null {
  const file = join(agentDir, TOPICS_FILE);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    const raw: unknown[] | null = Array.isArray(parsed)
      ? parsed // v1 裸数组
      : (parsed && typeof parsed === 'object' && parsed.schemaVersion === 2 && Array.isArray(parsed.topics)
        ? parsed.topics
        : null);
    if (raw === null) return null;
    const topics = raw
      .filter((t): t is TopicDefinition =>
        !!t && typeof t === 'object' && typeof (t as TopicDefinition).id === 'string'
        && typeof (t as TopicDefinition).title === 'string' && Array.isArray((t as TopicDefinition).files))
      .filter(t => t.id.length > 0 && t.files.length > 0);
    return topics;
  } catch {
    return null;
  }
}

/** 写入主题定义（--refresh-topics 或首次 build 时）；v2 包装 + tmp/rename 原子写（M8） */
export function saveTopics(agentDir: string, topics: TopicDefinition[]): void {
  mkdirSync(agentDir, { recursive: true });
  const target = join(agentDir, TOPICS_FILE);
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ schemaVersion: 2, topics }, null, 2), 'utf-8');
  renameSync(tmp, target);
}

/**
 * 合并手工锁定的主题：重探测结果之上保留 locked 中 pinned 的条目
 * （文件清单过滤到当前扫描清单内仍存在的，全部失效则丢弃该主题）。
 * pinned 主题可超出 MAX_TOPICS——用户显式锁定优先于自动配额。
 */
export function mergePinnedTopics(
  discovered: readonly TopicDefinition[],
  locked: TopicDefinition[] | null,
  knownFiles: ReadonlySet<string>,
): TopicDefinition[] {
  if (!locked || locked.length === 0) return [...discovered];
  const merged = [...discovered];
  for (const pin of locked) {
    if (!pin.pinned) continue;
    if (merged.some(t => t.id === pin.id)) continue;
    const files = pin.files.filter(f => knownFiles.has(f));
    if (files.length === 0) continue;
    merged.push({ ...pin, files });
  }
  return merged;
}
