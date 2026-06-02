import type { DatabaseConnection } from '../database.js';
import type { RetrievalResult } from './types.js';

interface FtsRow {
  rowid: number;
  chunk_id: string;
  content: string;
  rank: number;
}

interface ChunkRow {
  id: string;
  document_id: string;
  file_path: string;
  content: string;
  start_line: number;
  end_line: number;
  chunk_type: string;
  metadata: string;
}

export class FtsSearch {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  search(query: string, limit: number = 20): RetrievalResult[] {
    // Sanitize query for FTS5
    const ftsQuery = this.sanitizeQuery(query);
    if (!ftsQuery) return [];

    let ftsResults: FtsRow[];
    try {
      ftsResults = this.db.prepare(
        `SELECT rowid, chunk_id, content, rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`
      ).all(ftsQuery, limit) as FtsRow[];
    } catch {
      return [];
    }

    const results: RetrievalResult[] = [];
    for (const fts of ftsResults) {
      const chunk = this.db.prepare(
        'SELECT * FROM chunks WHERE id = ?'
      ).get(fts.chunk_id) as ChunkRow | undefined;

      if (chunk) {
        results.push({
          chunkId: chunk.id,
          filePath: chunk.file_path,
          content: chunk.content,
          startLine: chunk.start_line,
          endLine: chunk.end_line,
          score: this.normalizeScore(fts.rank),
          source: 'fts',
          metadata: JSON.parse(chunk.metadata),
        });
      }
    }

    return results;
  }

  private sanitizeQuery(query: string): string {
    // Remove special FTS5 syntax characters, keep words
    const words = query
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) return '';

    // Join with OR for broader matching
    return words.map((w) => `"${w}"`).join(' OR ');
  }

  private normalizeScore(rank: number): number {
    // FTS5 rank is negative (lower = better), normalize to 0-1
    return Math.max(0, Math.min(1, 1 / (1 + Math.abs(rank))));
  }
}
