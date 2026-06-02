import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { createDatabase, closeDatabase } from '../../src/core/database.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const tmpDir = join(process.cwd(), '.test-db-tmp');

describe('Database', () => {
  let db: Database;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create all tables on initialization', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain('documents');
    expect(tables).toContain('chunks');
    expect(tables).toContain('symbols');
    expect(tables).toContain('relations');
    expect(tables).toContain('modules');
  });

  it('should create FTS5 virtual table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should insert and retrieve a document', () => {
    db.prepare(
      `INSERT INTO documents (id, path, content, language, hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('doc1', 'src/index.ts', 'console.log("hello")', 'typescript', 'abc123', Date.now());

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get('doc1') as any;
    expect(doc.path).toBe('src/index.ts');
    expect(doc.language).toBe('typescript');
  });

  it('should insert and retrieve a symbol', () => {
    db.prepare(
      `INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('sym1', 'UserService', 'class', 'src/user.service.ts', 1, 50, 'module', 'public');

    const sym = db.prepare('SELECT * FROM symbols WHERE id = ?').get('sym1') as any;
    expect(sym.name).toBe('UserService');
    expect(sym.type).toBe('class');
  });

  it('should insert and full-text search chunks', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO documents (id, path, content, language, hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run('doc1', 'src/app.ts', 'export function createUser() {}', 'typescript', 'h1', now);

    db.prepare(
      `INSERT INTO chunks (id, document_id, file_path, content, start_line, end_line, chunk_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('chunk1', 'doc1', 'src/app.ts', 'export function createUser() {}', 1, 1, 'code_symbol', '{}');

    db.prepare(`INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)`).run(1, 'export function createUser() {}');

    const results = db.prepare(`SELECT * FROM chunks_fts WHERE chunks_fts MATCH ?`).all('createUser');
    expect(results.length).toBeGreaterThan(0);
  });
});
