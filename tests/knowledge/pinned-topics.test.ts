import { describe, it, expect } from 'vitest';
import { mergePinnedTopics } from '../../src/knowledge/topic-discovery.js';
import type { TopicDefinition } from '../../src/knowledge/topic-discovery.js';

describe('mergePinnedTopics', () => {
  const known = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts']);

  it('pinned 主题在重探测后保留（不被换簇挤掉），文件过滤到现存清单', () => {
    const locked: TopicDefinition[] = [
      { id: 'ci-keypress', title: 'CI 双开', files: ['src/a.ts', 'src/gone.ts'], pinned: true },
      { id: 'old-cluster', title: '旧主题', files: ['src/a.ts'] },
    ];
    const discovered: TopicDefinition[] = [
      { id: 'new-cluster', title: '新主题', files: ['src/b.ts', 'src/c.ts'] },
    ];
    const merged = mergePinnedTopics(discovered, locked, known);
    expect(merged.map(t => t.id)).toEqual(['new-cluster', 'ci-keypress']);
    expect(merged[1].files).toEqual(['src/a.ts']); // 失效文件被剔除
  });

  it('未 pinned 的锁定主题不保留；pinned 全部文件失效时丢弃', () => {
    const locked: TopicDefinition[] = [
      { id: 'x', title: 'x', files: ['deleted.ts'], pinned: true },
    ];
    const merged = mergePinnedTopics([], locked, known);
    expect(merged).toEqual([]);
  });

  it('id 与新探测结果重合时不重复追加', () => {
    const locked: TopicDefinition[] = [
      { id: 'same', title: '旧题名', files: ['src/a.ts'], pinned: true },
    ];
    const discovered: TopicDefinition[] = [
      { id: 'same', title: '新题名', files: ['src/a.ts'] },
    ];
    const merged = mergePinnedTopics(discovered, locked, known);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('新题名'); // 探测版优先
  });
});
