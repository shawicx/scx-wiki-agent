import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FtsSearch } from '../../../src/core/retrieval/fts-search.js';
import { createDatabase, closeDatabase } from '../../../src/core/database.js';
import type { DatabaseConnection } from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

const tmpDir = join(process.cwd(), '.test-fts-tmp');

describe('FtsSearch', () => {
  let db: DatabaseConnection;
  let search: FtsSearch;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
    search = new FtsSearch(db);

    // Seed data
    db.prepare(
      'INSERT INTO documents (id, path, content, language, hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('d1', 'src/user.service.ts', 'export class UserService { createUser() {} }', 'typescript', 'h1', Date.now());
    db.prepare(
      'INSERT INTO chunks (id, document_id, file_path, content, start_line, end_line, chunk_type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('c1', 'd1', 'src/user.service.ts', 'export class UserService { createUser() {} }', 1, 1, 'code_symbol', '{}');
    db.prepare('INSERT INTO chunks_fts (rowid, content, chunk_id) VALUES (?, ?, ?)').run(1, 'export class UserService { createUser() {} deleteUser() {} }', 'c1');
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find chunks matching a keyword', () => {
    const results = search.search('createUser');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('createUser');
  });

  it('should return results with relevance scores', () => {
    const results = search.search('UserService');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should return empty for no matches', () => {
    const results = search.search('nonexistent_xyz_12345');
    expect(results).toHaveLength(0);
  });
});
