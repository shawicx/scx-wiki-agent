import { describe, it, expect } from 'vitest';
import { rankIntentCandidates, RANKING_WEIGHTS, type RankingInputs } from '../../../src/knowledge/intent/ranking.js';

function makeInput(overrides: Partial<RankingInputs> = {}): RankingInputs {
  return {
    files: [],
    fanInByFile: new Map(),
    symbolCountByFile: new Map(),
    entryFiles: new Set(),
    boundaryPackages: new Set(),
    packageNames: ['src'],
    testedFiles: new Set(),
    docsMentionedFiles: new Set(),
    churnCounts: new Map(),
    ...overrides,
  };
}

describe('rankIntentCandidates（意图候选多信号排序）', () => {
  it('高扇入小文件排到大文件之前（本批评的最小复现：体积不再是重要性代理）', () => {
    const ranked = rankIntentCandidates(makeInput({
      files: [
        { relativePath: 'src/huge-page.ts', size: 50_000 },   // 巨大但无信号
        { relativePath: 'src/core.ts', size: 800 },           // 小而核心：高扇入 + 入口 + 被测
      ],
      fanInByFile: new Map([['src/core.ts', 40]]),
      entryFiles: new Set(['src/core.ts']),
      testedFiles: new Set(['src/core.ts']),
    }));
    expect(ranked[0].file).toBe('src/core.ts');
    expect(ranked[1].file).toBe('src/huge-page.ts');
    // 体积只在同分时作次级决胜
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('各信号独立加分：入口/boundary/测试配对/docs 提及/churn', () => {
    const base = { files: [{ relativePath: 'src/a.ts', size: 100 }, { relativePath: 'src/b.ts', size: 100 }] };
    const none = rankIntentCandidates(makeInput(base))[1].score; // b：无任何信号

    expect(rankIntentCandidates(makeInput({ ...base, entryFiles: new Set(['src/a.ts']) }))[0].score)
      .toBeGreaterThan(none);
    expect(rankIntentCandidates(makeInput({ ...base, boundaryPackages: new Set(['src']) }))[0].score)
      .toBeGreaterThan(none);
    expect(rankIntentCandidates(makeInput({ ...base, testedFiles: new Set(['src/a.ts']) }))[0].score)
      .toBeGreaterThan(none);
    expect(rankIntentCandidates(makeInput({ ...base, docsMentionedFiles: new Set(['src/a.ts']) }))[0].score)
      .toBeGreaterThan(none);
    expect(rankIntentCandidates(makeInput({ ...base, churnCounts: new Map([['src/a.ts', 9]]) }))[0].score)
      .toBeGreaterThan(none);
    expect(rankIntentCandidates(makeInput({ ...base, symbolCountByFile: new Map([['src/a.ts', 30]]) }))[0].score)
      .toBeGreaterThan(none);
  });

  it('fan-in 权重高于 docs 提及（信号强度按权重排列）', () => {
    const files = [{ relativePath: 'src/fan.ts', size: 10 }, { relativePath: 'src/doc.ts', size: 10 }];
    const ranked = rankIntentCandidates(makeInput({
      files,
      fanInByFile: new Map([['src/fan.ts', 50]]),
      docsMentionedFiles: new Set(['src/doc.ts']),
    }));
    expect(ranked[0].file).toBe('src/fan.ts');
    expect(RANKING_WEIGHTS.fanIn).toBeGreaterThan(RANKING_WEIGHTS.docsMention);
  });

  it('git 不可用（churn 空 Map）时 fail-open：其余信号照常排序', () => {
    const ranked = rankIntentCandidates(makeInput({
      files: [{ relativePath: 'src/a.ts', size: 10 }, { relativePath: 'src/b.ts', size: 10 }],
      fanInByFile: new Map([['src/a.ts', 5]]),
      churnCounts: new Map(), // git 不可用
    }));
    expect(ranked[0].file).toBe('src/a.ts');
  });

  it('同分决胜：size 降序 → 路径字典序（输出确定）', () => {
    const files = [
      { relativePath: 'src/z.ts', size: 100 },
      { relativePath: 'src/a.ts', size: 200 },
      { relativePath: 'src/m.ts', size: 100 },
    ];
    const first = rankIntentCandidates(makeInput({ files }));
    const second = rankIntentCandidates(makeInput({ files }));
    expect(first.map(r => r.file)).toEqual(['src/a.ts', 'src/m.ts', 'src/z.ts']);
    expect(first).toEqual(second); // 稳定
  });

  it('boundary 判定用包归属（boundary 包内文件加分，包外不加）', () => {
    const ranked = rankIntentCandidates(makeInput({
      files: [
        { relativePath: 'src/inside.ts', size: 10 },
        { relativePath: 'scripts/outside.ts', size: 10 },
      ],
      packageNames: ['src'],
      boundaryPackages: new Set(['src']),
    }));
    const inside = ranked.find(r => r.file === 'src/inside.ts')!;
    const outside = ranked.find(r => r.file === 'scripts/outside.ts')!;
    expect(inside.score).toBeGreaterThan(outside.score);
    expect(inside.signals.boundary).toBe(true);
    expect(outside.signals.boundary).toBe(false);
  });
});
