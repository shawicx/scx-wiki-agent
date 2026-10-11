import { describe, it, expect } from 'vitest';
import { stripUnplannedPageLinks } from '../../src/knowledge/ghost-links.js';

describe('stripUnplannedPageLinks', () => {
  const planned = new Set(['03-interface/api.md', '03-interface/components.md']);

  it('剥离指向已注册但未规划页面的链接，保留标签文本', () => {
    const content = '路由详见 [routing](routing.md)，组件见 [components](components.md)。';
    const [out, n] = stripUnplannedPageLinks(content, planned);
    expect(n).toBe(1);
    expect(out).toBe('路由详见 routing，组件见 [components](components.md)。');
  });

  it('仓库文件 ../ 链接与外链不受影响', () => {
    const content = '见 [README](../README.md) 与 [官网](https://example.com/x.md)。';
    const [out, n] = stripUnplannedPageLinks(content, planned);
    expect(n).toBe(0);
    expect(out).toBe(content);
  });

  it('子目录路径中的未规划页同样剥离', () => {
    const content = '见 [routing](03-interface/routing.md)';
    const [, n] = stripUnplannedPageLinks(content, planned);
    expect(n).toBe(1);
  });
});

import { normalizeRepoFileLinks } from '../../src/knowledge/ghost-links.js';

describe('normalizeRepoFileLinks', () => {
  const repoFiles = new Set(['src/main.ts', 'vite.config.ts', 'AGENTS.md']);
  const resolveRepoFile = (t: string) => repoFiles.has(t);

  it('子目录页内的仓库根相对链接重写为穿出 .wiki 的前缀', () => {
    const content = '入口见 [src/main.ts](src/main.ts) 与 [vite.config.ts](vite.config.ts)。';
    const [out, n] = normalizeRepoFileLinks(content, '01-overview/tech-stack.md', resolveRepoFile);
    expect(n).toBe(2);
    expect(out).toBe(
      '入口见 [src/main.ts](../../src/main.ts) 与 [vite.config.ts](../../vite.config.ts)。',
    );
  });

  it('根目录页（README.md）只加一层 ../', () => {
    const [out, n] = normalizeRepoFileLinks('见 [main](src/main.ts)', 'README.md', resolveRepoFile);
    expect(n).toBe(1);
    expect(out).toBe('见 [main](../src/main.ts)');
  });

  it('仓库中不存在的目标与 .md 页链接不动', () => {
    const content = '[api](api.md) 与 [ghost](src/nope.ts) 与 [ext](https://x/y.ts)';
    const [out, n] = normalizeRepoFileLinks(content, '01-overview/tech-stack.md', resolveRepoFile);
    expect(n).toBe(0);
    expect(out).toBe(content);
  });
});
