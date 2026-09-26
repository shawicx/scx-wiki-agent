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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ArchitectureData } from '../mcp/types.js';
import type { ScanResult } from '../core/scanner.js';
import { isTestPath, matchPackageForFile } from '../shared/utils.js';

export interface TopicDefinition {
  id: string;
  title: string;
  files: string[];
}

const TOPICS_FILE = 'topics.json';
const MAX_TOPICS = 4;
const MIN_CLUSTER_MEMBERS = 5;
/** 立题最低文件数（与证据下限对齐，避免主题页天然薄证据） */
const MIN_TOPIC_FILES = 3;
const MAX_TOPIC_FILES = 12;
/** 主题间文件重叠率上限（超过视为同一协作面，后者不立题） */
const MAX_TOPIC_OVERLAP = 0.5;

/**
 * 语言级通用符号名，不配作为主题标题与 id 来源
 * （图谱聚类的 top_nodes 常被 constructor 等通用名占据，据此命名会产出「constructor 协作面」这类无语义主题）
 */
const GENERIC_SYMBOLS = new Set([
  'constructor', 'main', 'init', 'run', 'new', 'dispose', 'setup', 'teardown',
  'execute', 'handle', 'update', 'render', 'create', 'destroy', 'close', 'open',
  'start', 'stop', 'get', 'set', 'from', 'value',
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

  private fromClusters(arch: ArchitectureData): TopicDefinition[] {
    const candidates = [...arch.clusters]
      .filter(c => c.members >= MIN_CLUSTER_MEMBERS && c.top_nodes.length >= 3)
      .sort((a, b) => (b.members * b.cohesion) - (a.members * a.cohesion));

    const topics: TopicDefinition[] = [];
    const usedIds = new Set<string>();
    for (const cluster of candidates) {
      const files = this.filesForSymbols(cluster.top_nodes);
      const pkgs = this.packagesForFiles(files, arch);
      if (pkgs.size < 2 || files.length < MIN_TOPIC_FILES) continue;
      // 与已立题主题高度重叠的簇不重复立题（同一协作面的两种聚类切法）
      if (topics.some(t => overlapRatio(t.files, files) > MAX_TOPIC_OVERLAP)) continue;

      const def = this.topicDefinition(cluster, files, [...pkgs], usedIds);
      if (!def) continue;
      topics.push(def);
      if (topics.length >= MAX_TOPICS) break;
    }
    return topics;
  }

  /**
   * 主题命名：label 为语义文本（非路径、不在 sourceDirs）时直接用作标题；
   * 否则主导符号取首个非通用名 top_node（constructor 等语言级符号无区分度）；
   * 再退回跨模块名联合。id 用符号/模块的 kebab slug（可读、跨构建稳定），
   * 冲突时追加序号。
   */
  private topicDefinition(
    cluster: ArchitectureData['clusters'][number],
    files: string[],
    pkgs: string[],
    usedIds: Set<string>,
  ): TopicDefinition | null {
    const semanticLabel = cluster.label
      && !cluster.label.includes('/')
      && !this.scanResult.sourceDirs.includes(cluster.label)
      ? cluster.label
      : null;
    const lead = cluster.top_nodes.find(n => !GENERIC_SYMBOLS.has(n) && n.length >= 4 && kebab(n) !== null);
    const title = semanticLabel
      ?? (lead ? `${lead} 协作面` : `${pkgs.slice(0, 2).join(' ↔ ')} 协作`);
    const baseId = (lead ? kebab(lead) : kebab(pkgs.join('-'))) ?? `topic-${cluster.id}`;
    let id = baseId;
    for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
    usedIds.add(id);
    return { id, title, files: files.slice(0, MAX_TOPIC_FILES) };
  }

  private fromBoundaries(arch: ArchitectureData): TopicDefinition | null {
    const top = [...arch.boundaries].sort((a, b) => b.call_count - a.call_count)[0];
    if (!top || top.call_count <= 0) return null;
    const pkgFile = (pkgName: string) =>
      this.scanResult.files
        .map(f => f.relativePath)
        .filter(p => matchPackageForFile(p, [pkgName]) !== null && !isTestPath(p));
    const files = [...pkgFile(top.from), ...pkgFile(top.to)].slice(0, MAX_TOPIC_FILES);
    if (files.length < MIN_TOPIC_FILES) return null;
    return {
      id: `topic-${top.from}-${top.to}`,
      title: `${top.from} ↔ ${top.to} 协作`,
      files,
    };
  }

  /** 符号名 → 扫描清单内的生产文件路径（去重，过滤测试路径） */
  private filesForSymbols(names: string[]): string[] {
    const known = new Set(this.scanResult.files.map(f => f.relativePath));
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

/** 读取锁定的主题定义；文件不存在返回 null（触发首次探测） */
export function loadTopics(agentDir: string): TopicDefinition[] | null {
  const file = join(agentDir, TOPICS_FILE);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    if (!Array.isArray(parsed)) return null;
    const topics = parsed
      .filter((t): t is TopicDefinition =>
        t && typeof t === 'object' && typeof t.id === 'string'
        && typeof t.title === 'string' && Array.isArray(t.files))
      .filter(t => t.id.length > 0 && t.files.length > 0);
    return topics;
  } catch {
    return null;
  }
}

/** 写入主题定义（--refresh-topics 或首次 build 时） */
export function saveTopics(agentDir: string, topics: TopicDefinition[]): void {
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, TOPICS_FILE), JSON.stringify(topics, null, 2), 'utf-8');
}
