import { describe, it, expect } from 'vitest';
import { summarizeDocstring, renderFactsAndUnknowns } from '../../src/knowledge/fallback/shared.js';
import { WikiBuilder } from '../../src/knowledge/wiki-builder.js';

describe('summarizeDocstring（JSDoc 摘要渲染）', () => {
  it('剥离 JSDoc 星号与字面 \\n，取第一段', () => {
    const raw = '/**\\n   * 关键概念页确定性节表：符号按所属模块分组。\\n   * 贪心分桶为 1-3 节。\\n   */';
    expect(summarizeDocstring(raw)).toBe(
      '关键概念页确定性节表：符号按所属模块分组。 贪心分桶为 1-3 节。',
    );
  });

  it('列表行转 <br>，普通换行转空格', () => {
    const raw = '概述行\\n- 第一项\\n- 第二项';
    expect(summarizeDocstring(raw)).toBe('概述行<br>- 第一项<br>- 第二项');
  });

  it('转义竖线防破表，超长截断', () => {
    const out = summarizeDocstring('a | b '.repeat(40));
    expect(out).not.toMatch(/(?<!\\)\|/);
    expect(out.length).toBeLessThanOrEqual(121); // 120 + 省略号
    expect(out.endsWith('…')).toBe(true);
  });

  it('空值返回占位符，不输出空话', () => {
    expect(summarizeDocstring(null)).toBe('—');
    expect(summarizeDocstring('')).toBe('—');
    expect(summarizeDocstring('/**\\n *\\n */')).toBe('—');
  });

  it('多段落只取第一段（@tag 段丢弃）', () => {
    const raw = '首段说明\\n\\n@param x 参数';
    expect(summarizeDocstring(raw)).toBe('首段说明');
  });
});

describe('renderFactsAndUnknowns（事实/未知项区块）', () => {
  it('两个区块均渲染 bullet 列表', () => {
    const builder = new WikiBuilder();
    renderFactsAndUnknowns(builder, ['事实 A', '事实 B'], ['缺口 A']);
    const out = builder.build();
    expect(out).toContain('## 本页确定知道的事实');
    expect(out).toContain('- 事实 A\n- 事实 B');
    expect(out).toContain('## 未知项');
    expect(out).toContain('- 缺口 A');
  });

  it('空列表不产出空节', () => {
    const builder = new WikiBuilder();
    renderFactsAndUnknowns(builder, [], []);
    expect(builder.build()).not.toContain('本页确定知道的事实');
    expect(builder.build()).not.toContain('未知项');
  });
});
