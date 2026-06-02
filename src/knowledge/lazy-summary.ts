import type { DatabaseConnection } from '../core/database.js';
import type BetterSqlite3 from 'better-sqlite3';

type Statement<P extends unknown[] = unknown[]> = BetterSqlite3.Statement<P>;

/**
 * LazySummary provides on-demand, cached summary generation for code chunks.
 *
 * Summaries are generated using rule-based extraction (no LLM) and cached
 * both in-memory and in SQLite for fast repeated lookups.
 */
export class LazySummary {
  private db: DatabaseConnection;
  private cache: Map<string, string>;
  private getStmt: Statement<[string]>;
  private setStmt: Statement<[string, string, number]>;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.cache = new Map();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_summaries (
        chunk_id TEXT PRIMARY KEY,
        summary TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    this.getStmt = this.db.prepare(
      'SELECT summary FROM chunk_summaries WHERE chunk_id = ?'
    );
    this.setStmt = this.db.prepare(
      'INSERT INTO chunk_summaries (chunk_id, summary, created_at) VALUES (?, ?, ?)'
    );
  }

  /**
   * Returns a cached summary for the given chunk, or generates a new one
   * using rule-based extraction and caches it.
   */
  getOrCreateSummary(chunkId: string, content: string, filePath: string): string {
    // 1. Check in-memory cache
    const cached = this.cache.get(chunkId);
    if (cached !== undefined) {
      return cached;
    }

    // 2. Check SQLite cache
    const row = this.getStmt.get(chunkId) as { summary: string } | undefined;
    if (row) {
      this.cache.set(chunkId, row.summary);
      return row.summary;
    }

    // 3. Generate new summary
    const summary = this.generateSummary(content, filePath);

    // 4. Cache in both stores
    this.cache.set(chunkId, summary);
    this.setStmt.run(chunkId, summary, Date.now());

    return summary;
  }

  /**
   * Rule-based summary generation. Extracts exported names (classes,
   * functions, interfaces, types), method names, and falls back to the
   * first non-empty line of content.
   */
  private generateSummary(content: string, filePath: string): string {
    const exportedNames: string[] = [];
    const methodNames: string[] = [];

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();

      // Extract exported class/function/interface/type names
      const exportMatch = trimmed.match(
        /^export\s+(?:default\s+)?(?:class|function|interface|type|const|let|var|enum)\s+(\w+)/
      );
      if (exportMatch) {
        exportedNames.push(exportMatch[1]);
        continue;
      }

      // Extract non-exported class/function/interface declarations
      const declMatch = trimmed.match(
        /^(?:class|function|interface|type|const|let|var|enum)\s+(\w+)/
      );
      if (declMatch && !trimmed.startsWith('export')) {
        exportedNames.push(declMatch[1]);
        continue;
      }

      // Extract method names (inside classes)
      const methodMatch = trimmed.match(
        /^(?:(?:public|private|protected|static|async|readonly|abstract)\s+)*(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+?)?\s*(?:\{|=>)/
      );
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
        methodNames.push(methodMatch[1]);
      }
    }

    const parts: string[] = [];
    const ext = filePath.split('.').pop() || '';

    if (exportedNames.length > 0) {
      parts.push(`Exports: ${exportedNames.join(', ')}`);
    }

    if (methodNames.length > 0) {
      const uniqueMethods = [...new Set(methodNames)];
      parts.push(`Methods: ${uniqueMethods.join(', ')}`);
    }

    if (parts.length > 0) {
      return `[${ext}] ${parts.join('. ')}`;
    }

    // Fallback: first non-empty line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        return trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed;
      }
    }

    return '(empty)';
  }
}
