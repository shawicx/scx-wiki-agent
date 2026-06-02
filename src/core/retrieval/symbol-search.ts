import type { DatabaseConnection } from '../database.js';

interface SymbolRow {
  id: string;
  name: string;
  type: string;
  file_path: string;
  start_line: number;
  end_line: number;
  scope: string | null;
}

export interface SymbolSearchResult {
  id: string;
  name: string;
  type: string;
  filePath: string;
  startLine: number;
  endLine: number;
  scope: string | null;
  score: number;
}

export class SymbolSearch {
  private db: DatabaseConnection;

  constructor(db: DatabaseConnection) {
    this.db = db;
  }

  search(query: string, limit: number = 20): SymbolSearchResult[] {
    const results: SymbolSearchResult[] = [];

    // Exact match
    const exact = this.db.prepare(
      'SELECT * FROM symbols WHERE name = ? ORDER BY start_line LIMIT ?'
    ).all(query, limit) as SymbolRow[];

    for (const row of exact) {
      results.push(this.toResult(row, 1.0));
    }

    // Prefix match
    const prefix = this.db.prepare(
      'SELECT * FROM symbols WHERE name LIKE ? AND name != ? ORDER BY start_line LIMIT ?'
    ).all(`${query}%`, query, limit) as SymbolRow[];

    for (const row of prefix) {
      if (!results.some((r) => r.id === row.id)) {
        results.push(this.toResult(row, 0.8));
      }
    }

    // Contains match
    const contains = this.db.prepare(
      'SELECT * FROM symbols WHERE name LIKE ? AND name NOT LIKE ? ORDER BY start_line LIMIT ?'
    ).all(`%${query}%`, `${query}%`, limit) as SymbolRow[];

    for (const row of contains) {
      if (!results.some((r) => r.id === row.id)) {
        results.push(this.toResult(row, 0.5));
      }
    }

    // Search by file path if query looks like a path
    if (query.includes('/') || query.includes('.')) {
      const pathResults = this.db.prepare(
        'SELECT * FROM symbols WHERE file_path LIKE ? ORDER BY start_line LIMIT ?'
      ).all(`%${query}%`, limit) as SymbolRow[];

      for (const row of pathResults) {
        if (!results.some((r) => r.id === row.id)) {
          results.push(this.toResult(row, 0.3));
        }
      }
    }

    return results.slice(0, limit);
  }

  private toResult(row: SymbolRow, score: number): SymbolSearchResult {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      filePath: row.file_path,
      startLine: row.start_line,
      endLine: row.end_line,
      scope: row.scope,
      score,
    };
  }
}
