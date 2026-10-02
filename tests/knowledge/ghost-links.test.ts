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
