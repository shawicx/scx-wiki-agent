import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RetrievalService } from '../../src/services/retrieval-service.js';
import { createDatabase, closeDatabase } from '../../src/core/database.js';
import { RelationGraph } from '../../src/core/graph/relation-graph.js';
import type { DatabaseConnection } from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

const tmpDir = join(process.cwd(), '.test-retrieval-tmp');

describe('RetrievalService', () => {
  let db: DatabaseConnection;
  let graph: RelationGraph;
  let service: RetrievalService;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
    graph = new RelationGraph();

    // Seed data
    db.prepare(
      'INSERT INTO documents (id, path, content, language, hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('d1', 'src/user.service.ts', 'export class UserService { createUser() {} }', 'typescript', 'h1', Date.now());
    db.prepare(
      'INSERT INTO chunks (id, document_id, file_path, content, start_line, end_line, chunk_type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('c1', 'd1', 'src/user.service.ts', 'export class UserService { createUser(name: string): void {} }', 1, 1, 'code_symbol', '{"symbols":["UserService","createUser"]}');
    db.prepare('INSERT INTO chunks_fts (rowid, content, chunk_id) VALUES (?, ?, ?)').run(1, 'export class UserService createUser name string void', 'c1');
    db.prepare(
      'INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('s1', 'UserService', 'class', 'src/user.service.ts', 1, 1, null, 'public');
    db.prepare(
      'INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('s2', 'createUser', 'method', 'src/user.service.ts', 1, 1, 'UserService', 'public');

    graph.addNode({ id: 'n1', name: 'UserService', type: 'service', filePath: 'src/user.service.ts', metadata: {} });

    service = new RetrievalService(db, graph);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should classify intent and return ranked results', () => {
    const result = service.retrieve('What does UserService.createUser do?');

    expect(result.intent).toBe('symbol_query');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].filePath).toContain('user.service');
  });

  it('should return results sorted by finalScore', () => {
    const result = service.retrieve('UserService');
    for (let i = 1; i < result.results.length; i++) {
      expect(result.results[i - 1].finalScore).toBeGreaterThanOrEqual(result.results[i].finalScore);
    }
  });
});
