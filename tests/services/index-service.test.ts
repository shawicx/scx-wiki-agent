import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { createDatabase, closeDatabase } from '../../src/core/database.js';
import { IndexService } from '../../src/services/index-service.js';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

const fixturesDir = join(process.cwd(), 'tests/fixtures/sample-project');
const tmpDir = join(process.cwd(), '.test-index-tmp');

describe('IndexService', () => {
  let db: Database;
  let service: IndexService;

  beforeEach(async () => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
    service = new IndexService(db);
    await service.init();
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should index documents from scanned files', async () => {
    await service.indexProject(fixturesDir);

    const docs = db.prepare('SELECT COUNT(*) as count FROM documents').get() as any;
    expect(docs.count).toBeGreaterThanOrEqual(2);
  });

  it('should create chunks for each document', async () => {
    await service.indexProject(fixturesDir);

    const chunks = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as any;
    expect(chunks.count).toBeGreaterThan(0);
  });

  it('should extract symbols', async () => {
    await service.indexProject(fixturesDir);

    const symbols = db.prepare('SELECT COUNT(*) as count FROM symbols').get() as any;
    expect(symbols.count).toBeGreaterThan(0);

    const userServiceSym = db.prepare(
      "SELECT * FROM symbols WHERE name = 'UserService'",
    ).get() as any;
    expect(userServiceSym).toBeDefined();
  });

  it('should populate FTS5 index', async () => {
    await service.indexProject(fixturesDir);

    const results = db.prepare(
      "SELECT * FROM chunks_fts WHERE chunks_fts MATCH 'createUser'",
    ).all();
    expect(results.length).toBeGreaterThan(0);
  });

  it('should not consume any LLM tokens', async () => {
    const tokenCount = await service.indexProject(fixturesDir);
    expect(tokenCount).toBe(0);
  });
});
