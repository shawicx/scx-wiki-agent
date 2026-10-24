/**
 * 主题命名回归：目录回声 label 拒用（双端仓库簇 label=android/macos）、
 * 符号对命名、标题撞名逐级退避。背景：scx-nexvia 双端仓库曾产出
 * 两个 title="android" 的主题页与 macos-android-2/-3 后缀 id。
 */

import { describe, it, expect } from 'vitest';
import { TopicDiscovery } from '../../src/knowledge/topic-discovery.js';
import { createMockClient } from '../helpers/mock-mcp-client.js';
import type { ScanResult } from '../../src/core/scanner.js';
import type { QueryResult } from '../../src/mcp/types.js';
import { isTestPath } from '../../src/shared/utils.js';

function makeScanResult(files: string[]): ScanResult {
  const scannedFiles = files.map(rel => ({
    absolutePath: `/tmp/test-project/${rel}`,
    relativePath: rel,
    language: 'typescript' as const,
    extension: '.ts',
    size: 100,
    scope: isTestPath(rel) ? 'test' as const : 'production' as const,
  }));
  const productionFiles = scannedFiles.filter(f => f.scope === 'production');
  return {
    rootDir: '/tmp/test-project',
    files: scannedFiles,
    techStack: [],
    testTechStack: [],
    projectType: 'backend',
    hasTypeScript: false,
    sourceDirs: [],
    productionFiles,
    testFiles: scannedFiles.filter(f => f.scope === 'test'),
    fileCounts: { total: scannedFiles.length, production: productionFiles.length, test: scannedFiles.length - productionFiles.length },
  };
}

const symbolsCypher = (names: string[]) =>
  `MATCH (n) WHERE n.name IN [${names.map(n => `"${n}"`).join(',')}] AND n.is_test = false
       RETURN n.name AS name, n.file_path AS file LIMIT 30`;

const DUAL_FILES = [
  'android/app/src/main/java/com/scx/nexvia/core/NodeProfile.kt',
  'macos/Sources/NexviaCore/SubscriptionParser.swift',
  'macos/Sources/NexviaCore/PolicyGroupImporter.swift',
];

const PACKAGES = [
  { name: 'android', node_count: 40, fan_in: 1, fan_out: 1 },
  { name: 'macos', node_count: 48, fan_in: 1, fan_out: 1 },
];

describe('主题命名：双端仓库去目录回声', () => {
  it('label 等于成员目录段（android）→ 拒用，回退符号对命名', () => {
    const queryResults = new Map<string, QueryResult>([
      [symbolsCypher(['NodeProfile', 'SubscriptionParser', 'PolicyGroupImporter']), {
        columns: ['name', 'file'],
        rows: DUAL_FILES.map((f, i) => [['NodeProfile', 'SubscriptionParser', 'PolicyGroupImporter'][i], f]),
        total: 3,
      }],
    ]);
    const client = createMockClient({
      queryResults,
      architecture: {
        total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [], languages: [],
        packages: PACKAGES, entry_points: [], hotspots: [], boundaries: [], layers: [],
        clusters: [{ id: 1, label: 'android', members: 5, cohesion: 0.8, top_nodes: ['NodeProfile', 'SubscriptionParser', 'PolicyGroupImporter'] }],
      },
    });
    const topics = new TopicDiscovery(client as any, makeScanResult(DUAL_FILES)).discover();
    expect(topics.length).toBe(1);
    // label=android 是目录回声：不用作标题；符号对（前两个 PascalCase 类型）接力
    expect(topics[0].title).toBe('NodeProfile · SubscriptionParser 协作');
    // id 仍取模块 slug：macos 侧两个文件共现的 NexviaCore 段频次最高（2），android 链取 scx
    expect(topics[0].id).toBe('nexviacore-scx');
  });

  it('两个镜像簇标题撞名 → 第二个逐级退避到包对命名，不再产生同名主题', () => {
    const filesA = [
      'android/app/src/main/java/com/scx/nexvia/core/AlphaStore.kt',
      'macos/Sources/NexviaCore/AlphaStore.swift',
      'macos/Sources/NexviaCore/AlphaExporter.swift',
    ];
    const filesB = [
      'android/app/src/main/java/com/scx/nexvia/core/BetaStore.kt',
      'macos/Sources/NexviaCore/BetaStore.swift',
      'macos/Sources/NexviaCore/BetaExporter.swift',
    ];
    const queryResults = new Map<string, QueryResult>([
      [symbolsCypher(['alphaOne', 'alphaTwo', 'alphaThree']), { columns: ['name', 'file'], rows: filesA.map((f, i) => [['alphaOne', 'alphaTwo', 'alphaThree'][i], f]), total: 3 }],
      [symbolsCypher(['betaOne', 'betaTwo', 'betaThree']), { columns: ['name', 'file'], rows: filesB.map((f, i) => [['betaOne', 'betaTwo', 'betaThree'][i], f]), total: 3 }],
    ]);
    const client = createMockClient({
      queryResults,
      architecture: {
        total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [], languages: [],
        packages: PACKAGES, entry_points: [], hotspots: [], boundaries: [], layers: [],
        clusters: [
          { id: 1, label: 'android', members: 5, cohesion: 0.8, top_nodes: ['alphaOne', 'alphaTwo', 'alphaThree'] },
          { id: 2, label: 'macos', members: 5, cohesion: 0.7, top_nodes: ['betaOne', 'betaTwo', 'betaThree'] },
        ],
      },
    });
    const topics = new TopicDiscovery(client as any, makeScanResult([...filesA, ...filesB])).discover();
    expect(topics.length).toBe(2);
    // 两簇目录结构镜像 → 模块复合标题相同：先到先得，第二个退到包对命名
    expect(new Set(topics.map(t => t.title)).size).toBe(2);
    expect(topics[1].title).toBe('android ↔ macos 协作');
  });
});
