import { describe, it, expect } from 'vitest';
import { HybridRanker } from '../../../src/core/retrieval/hybrid-ranker.js';
import type { RetrievalResult, RankedResult } from '../../../src/core/retrieval/types.js';

describe('HybridRanker', () => {
  const ranker = new HybridRanker();

  it('should merge results from multiple sources', () => {
    const symbolResults: RetrievalResult[] = [
      { chunkId: 'c1', filePath: 'src/user.service.ts', content: 'class UserService', startLine: 1, endLine: 50, score: 0.9, source: 'symbol', metadata: {} },
    ];
    const ftsResults: RetrievalResult[] = [
      { chunkId: 'c1', filePath: 'src/user.service.ts', content: 'class UserService', startLine: 1, endLine: 50, score: 0.7, source: 'fts', metadata: {} },
      { chunkId: 'c2', filePath: 'src/user.controller.ts', content: 'class UserController', startLine: 1, endLine: 30, score: 0.5, source: 'fts', metadata: {} },
    ];
    const graphResults: RetrievalResult[] = [];

    const ranked = ranker.rank(symbolResults, ftsResults, graphResults);

    // c1 should be ranked first (appeared in both symbol and FTS)
    expect(ranked[0].chunkId).toBe('c1');
    expect(ranked[0].sources).toContain('symbol');
    expect(ranked[0].sources).toContain('fts');
    expect(ranked[0].finalScore).toBeGreaterThan(ranked[1].finalScore);
  });

  it('should deduplicate by filePath + startLine', () => {
    const results: RetrievalResult[] = [
      { chunkId: 'c1', filePath: 'src/a.ts', content: 'x', startLine: 1, endLine: 10, score: 0.8, source: 'symbol', metadata: {} },
      { chunkId: 'c2', filePath: 'src/a.ts', content: 'x', startLine: 1, endLine: 10, score: 0.6, source: 'fts', metadata: {} },
    ];

    const ranked = ranker.rank(results, [], []);
    expect(ranked).toHaveLength(1);
  });

  it('should return results sorted by finalScore descending', () => {
    const results: RetrievalResult[] = [
      { chunkId: 'c1', filePath: 'a.ts', content: 'a', startLine: 1, endLine: 1, score: 0.3, source: 'fts', metadata: {} },
      { chunkId: 'c2', filePath: 'b.ts', content: 'b', startLine: 1, endLine: 1, score: 0.9, source: 'symbol', metadata: {} },
      { chunkId: 'c3', filePath: 'c.ts', content: 'c', startLine: 1, endLine: 1, score: 0.6, source: 'graph', metadata: {} },
    ];

    const ranked = ranker.rank([], results, []);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].finalScore).toBeGreaterThanOrEqual(ranked[i].finalScore);
    }
  });
});
