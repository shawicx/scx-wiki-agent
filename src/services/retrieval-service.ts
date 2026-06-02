import type { DatabaseConnection } from '../core/database.js';
import type { RelationGraph } from '../core/graph/relation-graph.js';
import { IntentClassifier } from '../core/retrieval/intent-classifier.js';
import { SymbolSearch } from '../core/retrieval/symbol-search.js';
import type { SymbolSearchResult } from '../core/retrieval/symbol-search.js';
import { FtsSearch } from '../core/retrieval/fts-search.js';
import { GraphSearch } from '../core/retrieval/graph-search.js';
import { HybridRanker } from '../core/retrieval/hybrid-ranker.js';
import type { ClassifiedQuery, QueryIntent, RankedResult, RetrievalResult } from '../core/retrieval/types.js';

export interface RetrievalOutput {
  intent: QueryIntent;
  query: ClassifiedQuery;
  results: RankedResult[];
}

export class RetrievalService {
  private db: DatabaseConnection;
  private graph: RelationGraph;
  private classifier: IntentClassifier;
  private symbolSearch: SymbolSearch;
  private ftsSearch: FtsSearch;
  private graphSearch: GraphSearch;
  private ranker: HybridRanker;

  constructor(db: DatabaseConnection, graph: RelationGraph) {
    this.db = db;
    this.graph = graph;
    this.classifier = new IntentClassifier();
    this.symbolSearch = new SymbolSearch(db);
    this.ftsSearch = new FtsSearch(db);
    this.graphSearch = new GraphSearch(graph, db);
    this.ranker = new HybridRanker();
  }

  retrieve(query: string, limit: number = 10): RetrievalOutput {
    const classified = this.classifier.classify(query);

    const symbolResults = this.searchByIntent(classified, 'symbol');
    const ftsResults = this.searchByIntent(classified, 'fts');
    const graphResults = this.searchByIntent(classified, 'graph');

    const ranked = this.ranker.rank(symbolResults, ftsResults, graphResults, limit);

    return { intent: classified.intent, query: classified, results: ranked };
  }

  private searchByIntent(classified: ClassifiedQuery, searchType: 'symbol' | 'fts' | 'graph'): RetrievalResult[] {
    switch (searchType) {
      case 'symbol': {
        const results: RetrievalResult[] = [];
        for (const keyword of classified.keywords) {
          const symbolResults = this.symbolSearch.search(keyword);
          results.push(...symbolResults.map((r) => this.convertSymbolResult(r)));
        }
        return results;
      }
      case 'fts':
        return this.ftsSearch.search(classified.rewrittenQuery || classified.original);
      case 'graph': {
        const results: RetrievalResult[] = [];
        for (const keyword of classified.keywords) {
          results.push(...this.graphSearch.search(keyword));
        }
        return results;
      }
    }
  }

  private convertSymbolResult(result: SymbolSearchResult): RetrievalResult {
    const content = this.lookupSymbolContent(result.filePath, result.startLine, result.endLine);

    return {
      chunkId: result.id,
      filePath: result.filePath,
      content: content ?? `${result.name} (${result.type})`,
      startLine: result.startLine,
      endLine: result.endLine,
      score: result.score,
      source: 'symbol',
      metadata: { symbolName: result.name, symbolType: result.type, scope: result.scope },
    };
  }

  private lookupSymbolContent(filePath: string, startLine: number, endLine: number): string | null {
    const chunk = this.db.prepare(
      'SELECT content FROM chunks WHERE file_path = ? AND start_line <= ? AND end_line >= ? LIMIT 1'
    ).get(filePath, endLine, startLine) as { content: string } | undefined;

    return chunk?.content ?? null;
  }
}
