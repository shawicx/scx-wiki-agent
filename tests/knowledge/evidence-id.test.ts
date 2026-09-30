import { describe, it, expect } from 'vitest';
import { buildEvidenceIndex, resolveEvidenceCitations } from '../../src/knowledge/evidence-id.js';
import type { TopicContext } from '../../src/knowledge/types.js';

const ctx: Pick<TopicContext, 'symbols' | 'edges' | 'boundaries' | 'intent'> = {
  symbols: [
    { name: 'buildWiki', type: 'function', file: 'src/services/wiki-service.ts', startLine: 100 },
    { name: 'scanAll', type: 'function', file: 'src/core/scanner.ts' },
  ],
  edges: [
    { caller: 'buildWiki', callee: 'scanAll', file: 'src/services/wiki-service.ts', line: 120 },
  ],
  boundaries: [{ from: 'services', to: 'core', callCount: 5 }],
  intent: [{
    kind: 'comment',
    text: '构建入口：组装扫描与生成',
    anchor: 'src/services/wiki-service.ts:1',
    target: { file: 'src/services/wiki-service.ts' },
  }],
};

describe('buildEvidenceIndex', () => {
  it('确定性编号：类别（symbol→edge→boundary→intent）→锚点→名称排序', () => {
    const idx = buildEvidenceIndex(ctx);
    expect(idx.map(e => e.kind)).toEqual(['symbol', 'symbol', 'edge', 'boundary', 'intent']);
    expect(idx.map(e => e.id)).toEqual(['E1', 'E2', 'E3', 'E4', 'E5']);
    // symbol 锚点含行号（有 startLine 时）
    expect(idx.find(e => e.name === 'buildWiki')?.anchor).toBe('src/services/wiki-service.ts:100');
    expect(idx.find(e => e.name === 'scanAll')?.anchor).toBe('src/core/scanner.ts');
    // 无 startLine 排在前面？按锚点字典序：src/core < src/services
    expect(idx[0].name).toBe('scanAll');
    expect(idx.find(e => e.kind === 'edge')?.name).toBe('buildWiki→scanAll');
  });

  it('context 不变时编号跨调用稳定', () => {
    expect(buildEvidenceIndex(ctx).map(e => e.id + e.name))
      .toEqual(buildEvidenceIndex(ctx).map(e => e.id + e.name));
  });
});

describe('resolveEvidenceCitations', () => {
  const idx = buildEvidenceIndex(ctx);

  it('有效引用计数并剥离 [E#] 脚手架；无效引用计数', () => {
    const md = '构建入口 [E1] 调用扫描 [E2]，机制见 [E9]。';
    const r = resolveEvidenceCitations(md, idx);
    expect(r.cited).toBe(2);
    expect(r.invalid).toBe(1);
    expect(r.content).not.toContain('[E');
    expect(r.content).toContain('构建入口');
  });

  it('无引用时不改写内容', () => {
    const r = resolveEvidenceCitations('# 主题\n\n无脚手架正文。', idx);
    expect(r.content).toBe('# 主题\n\n无脚手架正文。');
    expect(r.cited).toBe(0);
    expect(r.invalid).toBe(0);
  });
});
