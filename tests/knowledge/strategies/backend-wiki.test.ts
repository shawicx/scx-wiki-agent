import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { createDatabase, closeDatabase } from '../../../src/core/database.js';
import { BackendWikiStrategy } from '../../../src/knowledge/strategies/backend-wiki.js';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';
import type { ScanResult } from '../../../src/core/scanner.js';

const tmpDir = join(process.cwd(), '.test-backend-wiki-tmp');

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    rootDir: '/tmp/test-project',
    files: [],
    techStack: ['express'],
    projectType: 'backend',
    hasTypeScript: true,
    sourceDirs: ['src'],
    ...overrides,
  };
}

describe('BackendWikiStrategy', () => {
  let db: Database;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));

    // Seed symbols: UserController class with createUser method, UserService class
    db.prepare(
      "INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('sym-uc', 'UserController', 'class', 'src/controllers/user-controller.ts', 1, 50, null, null);

    db.prepare(
      "INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('sym-create', 'createUser', 'method', 'src/controllers/user-controller.ts', 10, 20, 'UserController', 'public');

    db.prepare(
      "INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('sym-us', 'UserService', 'class', 'src/services/user-service.ts', 1, 40, null, null);

    db.prepare(
      "INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run('sym-find', 'findById', 'method', 'src/services/user-service.ts', 5, 15, 'UserService', 'public');
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate two pages: api.md and business.md', () => {
    const strategy = new BackendWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();

    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.filename)).toEqual(['api.md', 'business.md']);
  });

  it('should include UserController in api.md', () => {
    const strategy = new BackendWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();
    const apiPage = pages.find((p) => p.filename === 'api.md')!;

    expect(apiPage.content).toContain('# API Reference');
    expect(apiPage.content).toContain('UserController');
    expect(apiPage.content).toContain('createUser');
  });

  it('should include UserService in business.md', () => {
    const strategy = new BackendWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();
    const businessPage = pages.find((p) => p.filename === 'business.md')!;

    expect(businessPage.content).toContain('# Business Logic');
    expect(businessPage.content).toContain('UserService');
    expect(businessPage.content).toContain('findById');
  });

  it('should show dependencies from relations table', () => {
    db.prepare(
      "INSERT INTO relations (id, source, target, type, file_path) VALUES (?, ?, ?, ?, ?)",
    ).run('rel-1', 'UserController', 'UserService', 'depends_on', 'src/controllers/user-controller.ts');

    const strategy = new BackendWikiStrategy(db, makeScanResult());
    const pages = strategy.generatePages();
    const apiPage = pages.find((p) => p.filename === 'api.md')!;

    expect(apiPage.content).toContain('UserService');
  });

  it('should handle empty database gracefully', () => {
    // Use a fresh DB without seeded data
    const freshDb = createDatabase(join(tmpDir, 'empty.db'));
    const strategy = new BackendWikiStrategy(freshDb, makeScanResult());
    const pages = strategy.generatePages();

    expect(pages).toHaveLength(2);
    expect(pages[0].content).toContain('No controllers found.');
    expect(pages[1].content).toContain('No services or repositories found.');

    closeDatabase(freshDb);
  });
});
