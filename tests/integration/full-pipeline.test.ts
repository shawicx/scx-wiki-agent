import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

const fixturesDir = join(process.cwd(), 'tests/fixtures/sample-project');
const tmpDir = join(process.cwd(), '.test-integration-tmp');

describe('Full Pipeline Integration', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('wiki init + scan + index end-to-end', () => {
    // Init
    execSync(`node dist/bin.js init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(existsSync(join(tmpDir, '.scx-wiki-agent'))).toBe(true);
    expect(existsSync(join(tmpDir, '.wiki'))).toBe(true);

    // Scan
    const scanOutput = execSync(`node dist/bin.js scan --project-root ${fixturesDir}`, {
      encoding: 'utf-8',
    });
    expect(scanOutput).toContain('backend');
    expect(scanOutput).toContain('express');
  });

  it('index builds database with correct data', async () => {
    // Copy fixtures to tmp to avoid polluting test fixtures
    execSync(`cp -r ${fixturesDir}/* ${tmpDir}/`, { encoding: 'utf-8' });
    execSync(`node dist/bin.js init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    execSync(`node dist/bin.js index --project-root ${tmpDir}`, { encoding: 'utf-8' });

    const dbPath = join(tmpDir, '.scx-wiki-agent', 'index.db');
    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });
    const docs = (db.prepare('SELECT COUNT(*) as c FROM documents').get() as any).c;
    const chunks = (db.prepare('SELECT COUNT(*) as c FROM chunks').get() as any).c;
    const symbols = (db.prepare('SELECT COUNT(*) as c FROM symbols').get() as any).c;

    expect(docs).toBeGreaterThan(0);
    expect(chunks).toBeGreaterThan(0);
    expect(symbols).toBeGreaterThan(0);

    // Verify UserService symbol exists
    const userService = db.prepare("SELECT * FROM symbols WHERE name = 'UserService'").get() as any;
    expect(userService).toBeDefined();

    // Verify FTS works
    const ftsResults = db.prepare("SELECT * FROM chunks_fts WHERE chunks_fts MATCH 'createUser'").all();
    expect(ftsResults.length).toBeGreaterThan(0);

    db.close();
  });
});
