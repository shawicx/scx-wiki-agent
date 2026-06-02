import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SymbolSearch } from '../../../src/core/retrieval/symbol-search.js';
import { createDatabase, closeDatabase } from '../../../src/core/database.js';
import type { DatabaseConnection } from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

const tmpDir = join(process.cwd(), '.test-symsearch-tmp');

describe('SymbolSearch', () => {
  let db: DatabaseConnection;
  let search: SymbolSearch;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
    search = new SymbolSearch(db);

    // Seed test data
    db.prepare(
      `INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('s1', 'UserService', 'class', 'src/user.service.ts', 1, 50, null, 'public');
    db.prepare(
      `INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('s2', 'createUser', 'method', 'src/user.service.ts', 10, 20, 'UserService', 'public');
    db.prepare(
      `INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('s3', 'deleteUser', 'method', 'src/user.service.ts', 22, 30, 'UserService', 'public');
    db.prepare(
      `INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('s4', 'OrderService', 'class', 'src/order.service.ts', 1, 80, null, 'public');
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find symbols by exact name', () => {
    const results = search.search('UserService');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'UserService')).toBe(true);
  });

  it('should find symbols by partial name (fuzzy)', () => {
    const results = search.search('User');
    expect(results.length).toBeGreaterThanOrEqual(3); // UserService, createUser, deleteUser
  });

  it('should return empty for no matches', () => {
    const results = search.search('NonExistentSymbol');
    expect(results).toHaveLength(0);
  });

  it('should include file path and line info in results', () => {
    const results = search.search('createUser');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].filePath).toBe('src/user.service.ts');
    expect(results[0].startLine).toBe(10);
  });
});
