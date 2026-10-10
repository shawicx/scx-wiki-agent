import { describe, it, expect } from 'vitest';
import { generatePage } from '../../src/services/wiki/generate-phase.js';
import { WikiFallbackBuilder } from '../../src/knowledge/wiki-fallback-builder.js';

describe('H2：LLM 生成异常保留可诊断的错误摘要', () => {
  it('超时/鉴权等异常 message 进入 llmDrop（进构建报告），不再折叠成一句话', async () => {
    const throwing = {
      hasModel: () => true,
      generateByName: async () => {
        throw new Error('This operation was aborted due to timeout');
      },
    } as never;
    const fallback = new WikiFallbackBuilder();
    const produced = await generatePage(
      'overview', { projectType: 'cli', techStack: [], sourceDirs: [], entryFiles: [], topSymbols: [] }, fallback, throwing, false, () => {},
    );
    expect(produced.source).toBe('fallback');
    expect(produced.llmDrop).toContain('LLM 生成异常（');
    expect(produced.llmDrop).toContain('aborted due to timeout');
  });

  it('非 Error 抛出物也安全折叠（String(err) 兜底）', async () => {
    const throwing = {
      hasModel: () => true,
      generateByName: async () => { throw 'string error'; },
    } as never;
    const produced = await generatePage(
      'overview', { projectType: 'cli', techStack: [], sourceDirs: [], entryFiles: [], topSymbols: [] }, new WikiFallbackBuilder(), throwing, false, () => {},
    );
    expect(produced.llmDrop).toContain('string error');
  });
});
