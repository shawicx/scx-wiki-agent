import { describe, it, expect } from 'vitest';
import { sanitizeWikiOutput } from '../../src/knowledge/wiki-output-sanitizer.js';

describe('sanitizeWikiOutput', () => {
  it('移除"好的，作为…"寒暄前导语，保留首个标题', () => {
    const input = '好的，作为资深代码文档专家，我将根据您提供的JSON数据生成文档。\n\n# 设计决策文档\n\n正文内容';
    const result = sanitizeWikiOutput(input);
    expect(result.startsWith('# 设计决策文档')).toBe(true);
    expect(result).not.toContain('好的');
    expect(result).not.toContain('作为');
  });

  it('移除"根据您提供的JSON数据…"前导语', () => {
    const input = '根据您提供的JSON数据，以下是数据流文档。\n\n# 数据流文档\n\n内容';
    const result = sanitizeWikiOutput(input);
    expect(result.startsWith('# 数据流文档')).toBe(true);
    expect(result).not.toContain('根据您');
  });

  it('去除整体 ```markdown 代码围栏', () => {
    const input = '```markdown\n# 标题\n\n正文\n```';
    const result = sanitizeWikiOutput(input);
    expect(result.startsWith('# 标题')).toBe(true);
    expect(result).not.toContain('```markdown');
    expect(result).not.toContain('```');
  });

  it('无残骸的内容原样返回（首行即标题）', () => {
    const input = '# 项目概述\n\n这是一个项目。';
    const result = sanitizeWikiOutput(input);
    expect(result).toBe(input);
  });

  it('首行是二级标题（##）也视为有效内容，不误删', () => {
    const input = '## 项目模块架构概览\n\n模块内容';
    const result = sanitizeWikiOutput(input);
    expect(result).toBe(input);
  });

  it('寒暄 + markdown 围栏同时存在时都能清理', () => {
    const input = '好的，我来生成文档。\n\n```markdown\n# 架构文档\n\n正文\n```';
    const result = sanitizeWikiOutput(input);
    expect(result.startsWith('# 架构文档')).toBe(true);
    expect(result).not.toContain('好的');
    expect(result).not.toContain('```');
  });

  it('多行寒暄前导语全部移除', () => {
    const input = '好的，作为资深架构师。\n我将为您生成详尽的文档。\n基于提供的JSON数据。\n\n# 架构文档\n\n正文';
    const result = sanitizeWikiOutput(input);
    expect(result.startsWith('# 架构文档')).toBe(true);
    expect(result).not.toContain('好的');
    expect(result).not.toContain('我将');
  });
});
