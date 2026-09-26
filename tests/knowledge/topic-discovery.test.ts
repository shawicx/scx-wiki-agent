import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TopicDiscovery, loadTopics, saveTopics } from '../../src/knowledge/topic-discovery.js';
import { createMockClient } from '../helpers/mock-mcp-client.js';
import type { ScanResult } from '../../src/core/scanner.js';
import type { QueryResult } from '../../src/mcp/types.js';
import {
  pageRelPath, findPageDescriptor, buildRelatedSection,
} from '../../src/knowledge/page-registry.js';

const tmpDir = join(process.cwd(), '.test-topic-tmp');

function makeScanResult(files: string[]): ScanResult {
  return {
    rootDir: '/tmp/test-project',
    files: files.map(rel => ({
      absolutePath: `/tmp/test-project/${rel}`,
      relativePath: rel,
      language: 'typescript' as const,
      extension: '.ts',
      size: 100,
    })),
    techStack: ['commander'],
    projectType: 'cli',
    hasTypeScript: true,
    sourceDirs: ['src'],
  };
}

const prodFiles = [
  'src/services/wiki-service.ts',
  'src/knowledge/page-registry.ts',
  'src/core/scanner.ts',
];

const symbolsCypher = (names: string[]) =>
  `MATCH (n) WHERE n.name IN [${names.map(n => `"${n}"`).join(',')}] AND n.is_test = false
       RETURN n.name AS name, n.file_path AS file LIMIT 30`;

describe('TopicDiscovery', () => {
  it('cluster 跨 ≥2 packages 且规模达标 → 立主题', () => {
    const queryResults = new Map<string, QueryResult>([
      [symbolsCypher(['buildWiki', 'pageRelPath', 'scan']), {
        columns: ['name', 'file'],
        rows: [
          ['buildWiki', 'src/services/wiki-service.ts'],
          ['pageRelPath', 'src/knowledge/page-registry.ts'],
          ['scan', 'src/core/scanner.ts'],
          ['ghost', 'tests/fixtures/ghost.ts'],
        ],
        total: 4,
      }],
    ]);
    const client = createMockClient({
      queryResults,
      architecture: {
        total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [], languages: [],
        packages: [
          { name: 'services', node_count: 5, fan_in: 1, fan_out: 1 },
          { name: 'knowledge', node_count: 5, fan_in: 1, fan_out: 1 },
          { name: 'core', node_count: 5, fan_in: 1, fan_out: 1 },
        ],
        entry_points: [], hotspots: [], boundaries: [], layers: [],
        clusters: [{ id: 7, label: '质量闸门', members: 6, cohesion: 0.8, top_nodes: ['buildWiki', 'pageRelPath', 'scan'] }],
      },
    });
    const topics = new TopicDiscovery(client as any, makeScanResult(prodFiles)).discover();

    expect(topics.length).toBe(1);
    // id 用主导符号 slug（可读且跨构建稳定），不再用图谱数字 id
    expect(topics[0].id).toBe('buildwiki');
    // label 为语义文本（非路径）时直接用作标题
    expect(topics[0].title).toBe('质量闸门');
    // fixtures 文件被过滤，只保留生产文件（按查询行序）
    expect(topics[0].files).toEqual([
      'src/services/wiki-service.ts',
      'src/knowledge/page-registry.ts',
      'src/core/scanner.ts',
    ]);
  });

  it('单一 package 的 cluster 不立主题（modules 页已覆盖），无边界时不回退', () => {
    const queryResults = new Map<string, QueryResult>([
      [symbolsCypher(['a', 'b']), {
        columns: ['name', 'file'],
        rows: [
          ['a', 'src/services/a.ts'],
          ['b', 'src/services/b.ts'],
        ],
        total: 2,
      }],
    ]);
    const client = createMockClient({
      queryResults,
      architecture: {
        total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [], languages: [],
        packages: [{ name: 'services', node_count: 5, fan_in: 1, fan_out: 1 }],
        entry_points: [], hotspots: [], boundaries: [], layers: [],
        clusters: [{ id: 1, label: 'svc', members: 6, cohesion: 0.9, top_nodes: ['a', 'b'] }],
      },
    });
    const topics = new TopicDiscovery(client as any, makeScanResult([
      'src/services/a.ts', 'src/services/b.ts',
    ])).discover();

    expect(topics).toEqual([]);
  });

  it('label 为目录路径时改用主导符号命名标题；通用/过短符号不配命名（退回模块联合）；文件数不足 3 不立题', () => {
    const queryResults = new Map<string, QueryResult>([
      [symbolsCypher(['buildWidget', 'b', 'c']), {
        columns: ['name', 'file'],
        rows: [
          ['buildWidget', 'src/services/a.ts'],
          ['b', 'src/knowledge/b.ts'],
          ['c', 'src/core/c.ts'],
        ],
        total: 3,
      }],
      [symbolsCypher(['x', 'y', 'z']), {
        columns: ['name', 'file'],
        rows: [
          ['x', 'src/services/x.ts'],
          ['y', 'src/core/y.ts'],
        ],
        total: 2,
      }],
    ]);
    const client = createMockClient({
      queryResults,
      architecture: {
        total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [], languages: [],
        packages: [
          { name: 'services', node_count: 5, fan_in: 1, fan_out: 1 },
          { name: 'knowledge', node_count: 5, fan_in: 1, fan_out: 1 },
          { name: 'core', node_count: 5, fan_in: 1, fan_out: 1 },
        ],
        entry_points: [], hotspots: [], boundaries: [], layers: [],
        clusters: [
          // label='src'（sourceDirs 内，无区分度）→ 用首个非通用主导符号命名
          { id: 1, label: 'src', members: 6, cohesion: 0.9, top_nodes: ['buildWidget', 'b', 'c'] },
          // 跨包但仅 2 个文件 → 不立题
          { id: 2, label: 'small', members: 6, cohesion: 0.8, top_nodes: ['x', 'y', 'z'] },
        ],
      },
    });
    const topics = new TopicDiscovery(client as any, makeScanResult([
      'src/services/a.ts', 'src/knowledge/b.ts', 'src/core/c.ts',
      'src/services/x.ts', 'src/core/y.ts',
    ])).discover();

    expect(topics.length).toBe(1);
    expect(topics[0].title).toBe('buildWidget 协作面');
    expect(topics[0].id).toBe('buildwidget');
    expect(topics[0].files.length).toBe(3);
  });

  it('主导符号全部为通用名（constructor 等）时退回跨模块联合命名；高度重叠的簇不重复立题', () => {
    const queryResults = new Map<string, QueryResult>([
      [symbolsCypher(['constructor', 'init', 'run']), {
        columns: ['name', 'file'],
        rows: [
          ['constructor', 'src/services/a.ts'],
          ['init', 'src/knowledge/b.ts'],
          ['run', 'src/core/c.ts'],
        ],
        total: 3,
      }],
    ]);
    const client = createMockClient({
      queryResults,
      architecture: {
        total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [], languages: [],
        packages: [
          { name: 'services', node_count: 5, fan_in: 1, fan_out: 1 },
          { name: 'knowledge', node_count: 5, fan_in: 1, fan_out: 1 },
          { name: 'core', node_count: 5, fan_in: 1, fan_out: 1 },
        ],
        entry_points: [], hotspots: [], boundaries: [], layers: [],
        clusters: [
          { id: 1, label: 'src', members: 6, cohesion: 0.9, top_nodes: ['constructor', 'init', 'run'] },
          // 与上一簇文件高度重叠（同一协作面的另一种聚类切法）→ 不重复立题
          { id: 2, label: 'src', members: 8, cohesion: 0.95, top_nodes: ['constructor', 'init', 'run'] },
        ],
      },
    });
    const topics = new TopicDiscovery(client as any, makeScanResult([
      'src/services/a.ts', 'src/knowledge/b.ts', 'src/core/c.ts',
    ])).discover();

    expect(topics.length).toBe(1);
    expect(topics[0].title).toBe('services ↔ knowledge 协作');
    expect(topics[0].id).toBe('services-knowledge-core');
  });

  it('无合格 cluster 时回退最高调用次数的跨包边界', () => {
    const client = createMockClient({
      architecture: {
        total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [], languages: [],
        packages: [
          { name: 'services', node_count: 5, fan_in: 1, fan_out: 1 },
          { name: 'core', node_count: 5, fan_in: 1, fan_out: 1 },
        ],
        entry_points: [], hotspots: [],
        boundaries: [{ from: 'services', to: 'core', call_count: 5 }],
        layers: [],
        clusters: [{ id: 2, label: 'small', members: 3, cohesion: 0.9, top_nodes: ['x'] }],
      },
    });
    const topics = new TopicDiscovery(client as any, makeScanResult([
      'src/services/wiki-service.ts', 'src/services/scan-service.ts', 'src/core/scanner.ts',
    ])).discover();

    expect(topics.length).toBe(1);
    expect(topics[0].id).toBe('topic-services-core');
    expect(topics[0].title).toContain('services');
    expect(topics[0].files.length).toBe(3);
  });
});

describe('topics.json 锁定', () => {
  it('saveTopics/loadTopics 读写往返，损坏文件返回 null', () => {
    mkdirSync(tmpDir, { recursive: true });
    try {
      const agentDir = join(tmpDir, '.scx-wiki-agent');
      expect(loadTopics(agentDir)).toBeNull();

      saveTopics(agentDir, [{ id: 't1', title: 'T', files: ['src/a.ts'] }]);
      expect(loadTopics(agentDir)).toEqual([{ id: 't1', title: 'T', files: ['src/a.ts'] }]);

      writeFileSync(join(agentDir, 'topics.json'), '{broken', 'utf-8');
      expect(loadTopics(agentDir)).toBeNull();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('空 files 的主题被过滤（诚实降级）', () => {
    mkdirSync(tmpDir, { recursive: true });
    try {
      const agentDir = join(tmpDir, '.scx-wiki-agent');
      saveTopics(agentDir, [
        { id: 't1', title: 'T', files: [] },
        { id: 't2', title: 'T2', files: ['src/a.ts'] },
      ]);
      const loaded = loadTopics(agentDir);
      expect(loaded?.map(t => t.id)).toEqual(['t2']);
      expect(existsSync(join(agentDir, 'topics.json'))).toBe(true);
      expect(readFileSync(join(agentDir, 'topics.json'), 'utf-8')).toContain('t2');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('主题页注册表集成', () => {
  it('pageRelPath / findPageDescriptor / buildRelatedSection 支持动态主题页', () => {
    expect(pageRelPath('topic:t1')).toBe('08-topics/t1.md');
    const desc = findPageDescriptor('topic:t1');
    expect(desc?.dir).toBe('08-topics');
    expect(desc?.tier).toBe('structure');

    const related = buildRelatedSection('topic:t1', ['topic:t1', 'topic:t2', 'readme']);
    expect(related).toContain('[t2.md](t2.md)');
    expect(related).toContain('../README.md');
  });
});
