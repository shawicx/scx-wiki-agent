import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, cpSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

const tmpDir = join(process.cwd(), '.test-phase2-tmp');

describe('Phase 2 Integration', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should build relation graph and module index for NestJS project', () => {
    // Copy NestJS fixtures
    const fixtureDir = join(process.cwd(), 'tests/fixtures/nestjs-project');
    cpSync(fixtureDir, join(tmpDir, 'src'), { recursive: true });

    // Add a package.json to the temp project
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-nestjs-project',
      dependencies: { '@nestjs/common': '^10.0.0', '@nestjs/core': '^10.0.0' }
    }));

    execSync(`node dist/bin.js init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    execSync(`node dist/bin.js index --project-root ${tmpDir}`, { encoding: 'utf-8' });

    const dbPath = join(tmpDir, '.scx-wiki-agent', 'index.db');
    expect(existsSync(dbPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });

    const relations = db.prepare('SELECT COUNT(*) as c FROM relations').get() as any;
    expect(relations.c).toBeGreaterThan(0);

    const modules = db.prepare('SELECT COUNT(*) as c FROM modules').get() as any;
    expect(modules.c).toBeGreaterThan(0);

    db.close();
  });
});
