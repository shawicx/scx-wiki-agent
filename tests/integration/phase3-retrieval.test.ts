import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, cpSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

const fixturesDir = join(process.cwd(), 'tests/fixtures/nestjs-project');
const tmpDir = join(process.cwd(), '.test-phase3-tmp');

describe('Phase 3 Retrieval Integration', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });

    // Copy NestJS fixtures into tmp dir
    cpSync(fixturesDir, join(tmpDir, 'src'), { recursive: true });

    // Add a package.json so framework detection works
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-nestjs-project',
      dependencies: { '@nestjs/common': '^10.0.0', '@nestjs/core': '^10.0.0' },
    }));

    // Run full pipeline: init -> index
    execSync(`node dist/bin.js init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    execSync(`node dist/bin.js index --project-root ${tmpDir}`, { encoding: 'utf-8' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should answer a symbol query about UserService', () => {
    const output = execSync(
      `node dist/bin.js ask "What does UserService do?" --project-root ${tmpDir}`,
      { encoding: 'utf-8' },
    );

    // The answer should mention UserService from symbol search results
    expect(output).toContain('UserService');
  });

  it('should include file references in ask output', () => {
    const output = execSync(
      `node dist/bin.js ask "UserController" --project-root ${tmpDir}`,
      { encoding: 'utf-8' },
    );

    // The ask command prints "--- References ---" followed by file paths
    expect(output).toContain('--- References ---');
    // Should reference the user module file that imports UserController
    expect(output).toContain('user.module');
  });

  it('should include score information from retrieval pipeline', () => {
    const output = execSync(
      `node dist/bin.js ask "UserService" --project-root ${tmpDir}`,
      { encoding: 'utf-8' },
    );

    // Should include score information from the hybrid ranker
    expect(output).toContain('score:');
    // Should indicate retrieval source (symbol, fts, or graph)
    expect(output).toContain('sources:');
  });

  it('should report no results for unrelated queries', () => {
    const output = execSync(
      `node dist/bin.js ask "xyznonexistentfoobar" --project-root ${tmpDir}`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('No relevant code found');
  });

  it('should have indexed symbols for retrieval', () => {
    const dbPath = join(tmpDir, '.scx-wiki-agent', 'index.db');
    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });

    const symbols = db.prepare("SELECT * FROM symbols WHERE name = 'UserService'").all() as any[];
    expect(symbols.length).toBeGreaterThan(0);

    const controllerSymbols = db.prepare("SELECT * FROM symbols WHERE name = 'UserController'").all() as any[];
    expect(controllerSymbols.length).toBeGreaterThan(0);

    db.close();
  });
});
