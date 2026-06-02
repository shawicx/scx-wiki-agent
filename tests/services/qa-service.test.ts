import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QAService } from '../../src/services/qa-service.js';
import { createDatabase, closeDatabase } from '../../src/core/database.js';
import { RelationGraph } from '../../src/core/graph/relation-graph.js';
import type { DatabaseConnection } from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

const tmpDir = join(process.cwd(), '.test-qa-tmp');

describe('QAService', () => {
  let db: DatabaseConnection;
  let graph: RelationGraph;
  let service: QAService;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
    graph = new RelationGraph();

    // Seed minimal data
    db.prepare(
      'INSERT INTO documents (id, path, content, language, hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('d1', 'src/user.service.ts', 'export class UserService { createUser() {} }', 'typescript', 'h1', Date.now());
    db.prepare(
      'INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('s1', 'UserService', 'class', 'src/user.service.ts', 1, 50, null, 'public');
    db.prepare(
      'INSERT INTO chunks (id, document_id, file_path, content, start_line, end_line, chunk_type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('c1', 'd1', 'src/user.service.ts', 'export class UserService { createUser() {} }', 1, 50, 'code_symbol', '{}');

    service = new QAService(db, graph);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should build context from retrieval results', () => {
    const context = service.buildContext([
      {
        chunkId: 'c1',
        filePath: 'src/user.service.ts',
        content: 'export class UserService { createUser() {} }',
        startLine: 1,
        endLine: 50,
        score: 0.9,
        source: 'symbol',
        metadata: {},
        finalScore: 0.9,
        sources: ['symbol'],
      },
    ]);

    expect(context).toContain('src/user.service.ts');
    expect(context).toContain('UserService');
    expect(context).toContain('createUser');
  });

  it('should include file references in context', () => {
    const context = service.buildContext([
      {
        chunkId: 'c1',
        filePath: 'src/user.service.ts',
        content: 'export class UserService { createUser() {} }',
        startLine: 1,
        endLine: 50,
        score: 0.9,
        source: 'symbol',
        metadata: {},
        finalScore: 0.9,
        sources: ['symbol'],
      },
    ]);

    expect(context).toContain('L1-50');
  });
});
