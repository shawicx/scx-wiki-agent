import type { RetrievalResult, RankedResult } from './types.js';

// Source weights: symbol match is strongest, then graph context, then FTS
const SOURCE_WEIGHTS: Record<string, number> = {
  symbol: 1.5,
  graph: 1.2,
  fts: 1.0,
};

export class HybridRanker {
  rank(
    symbolResults: RetrievalResult[],
    ftsResults: RetrievalResult[],
    graphResults: RetrievalResult[],
    limit: number = 10
  ): RankedResult[] {
    const merged = new Map<string, RankedResult>();

    const allResults = [...symbolResults, ...ftsResults, ...graphResults];

    for (const result of allResults) {
      const key = `${result.filePath}:${result.startLine}`;
      const existing = merged.get(key);

      if (existing) {
        // Boost score if found in multiple sources
        existing.finalScore += result.score * SOURCE_WEIGHTS[result.source] * 0.5;
        if (!existing.sources.includes(result.source)) {
          existing.sources.push(result.source);
        }
      } else {
        merged.set(key, {
          ...result,
          finalScore: result.score * SOURCE_WEIGHTS[result.source],
          sources: [result.source],
        });
      }
    }

    return [...merged.values()]
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);
  }
}
