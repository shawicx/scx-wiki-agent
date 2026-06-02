import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphSearch } from '../../../src/core/retrieval/graph-search.js';
import { RelationGraph } from '../../../src/core/graph/relation-graph.js';
import type { DatabaseConnection } from 'better-sqlite3';
import { createDatabase, closeDatabase } from '../../../src/core/database.js';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

const tmpDir = join(process.cwd(), '.test-graphsearch-tmp');

describe('GraphSearch', () => {
  let graph: RelationGraph;
  let db: DatabaseConnection;
  let search: GraphSearch;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));

    graph = new RelationGraph();
    graph.addNode({ id: 'ctrl', name: 'UserController', type: 'api', filePath: 'src/user.controller.ts', metadata: {} });
    graph.addNode({ id: 'svc', name: 'UserService', type: 'service', filePath: 'src/user.service.ts', metadata: {} });
    graph.addNode({ id: 'repo', name: 'UserRepository', type: 'service', filePath: 'src/user.repository.ts', metadata: {} });
    graph.addEdge({ source: 'ctrl', target: 'svc', type: 'injects', filePath: 'src/user.controller.ts' });
    graph.addEdge({ source: 'svc', target: 'repo', type: 'calls', filePath: 'src/user.service.ts' });

    // Seed symbols for DB lookup
    db.prepare(
      `INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('s1', 'UserController', 'class', 'src/user.controller.ts', 1, 50, null, 'public');
    db.prepare(
      `INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('s2', 'UserService', 'class', 'src/user.service.ts', 1, 80, null, 'public');
    db.prepare(
      `INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('s3', 'UserRepository', 'class', 'src/user.repository.ts', 1, 40, null, 'public');

    search = new GraphSearch(graph, db);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should find related nodes by name', () => {
    const results = search.search('UserService');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.filePath.includes('user'))).toBe(true);
  });

  it('should return related files with scores', () => {
    const results = search.search('UserController');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.score > 0)).toBe(true);
  });
});
