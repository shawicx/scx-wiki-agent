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
import { isTestPath } from '../shared/utils.js';

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
    for (const cluster of candidates) {
      const files = this.filesForSymbols(cluster.top_nodes);
      const pkgs = this.packagesForFiles(files, arch);
      if (pkgs.size < 2 || files.length < MIN_TOPIC_FILES) continue;
      topics.push({
        id: `topic-${cluster.id}`,
        title: this.topicTitle(cluster),
        files: files.slice(0, MAX_TOPIC_FILES),
      });
      if (topics.length >= MAX_TOPICS) break;
    }
    return topics;
  }

  /**
   * 标题规则：label 是目录路径（或落在 sourceDirs）时无区分度，
   * 改用聚类首个主导符号命名（确定性，无 LLM）。
   */
  private topicTitle(cluster: ArchitectureData['clusters'][number]): string {
    const generic = !cluster.label
      || cluster.label.includes('/')
      || this.scanResult.sourceDirs.includes(cluster.label);
    const lead = cluster.top_nodes[0] ?? '';
    if (generic && lead) return `${lead} 协作面`;
    return cluster.label || `主题 ${cluster.id}`;
  }

  private fromBoundaries(arch: ArchitectureData): TopicDefinition | null {
    const top = [...arch.boundaries].sort((a, b) => b.call_count - a.call_count)[0];
    if (!top || top.call_count <= 0) return null;
    const pkgFile = (pkgName: string) =>
      this.scanResult.files
        .map(f => f.relativePath)
        .filter(p => p.includes(`/${pkgName}/`) && !isTestPath(p));
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
    const pkgs = new Set<string>();
    for (const file of files) {
      for (const pkg of arch.packages) {
        if (file.includes(`/${pkg.name}/`)) {
          pkgs.add(pkg.name);
          break;
        }
      }
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
