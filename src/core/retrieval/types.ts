export type QueryIntent = 'flow_query' | 'symbol_query' | 'architecture_query';

export interface ClassifiedQuery {
  original: string;
  intent: QueryIntent;
  keywords: string[];
  rewrittenQuery: string;
}

export interface RetrievalResult {
  chunkId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
  source: 'symbol' | 'graph' | 'fts';
  metadata: Record<string, unknown>;
}

export interface RankedResult extends RetrievalResult {
  finalScore: number;
  sources: ('symbol' | 'graph' | 'fts')[];
}
