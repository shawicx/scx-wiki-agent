import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { createDatabase, closeDatabase } from '../../src/core/database.js';
import { WikiService } from '../../src/services/wiki-service.js';
import type { ScanResult } from '../../src/core/scanner.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';

const tmpDir = join(process.cwd(), '.test-wiki-tmp');

function makeBackendScanResult(): ScanResult {
  return {
    rootDir: '/tmp/test-project',
    files: [
      {
        absolutePath: '/tmp/test-project/src/index.ts',
        relativePath: 'src/index.ts',
        language: 'typescript',
        extension: '.ts',
        size: 100,
      },
    ],
    techStack: ['express', 'typescript'],
    projectType: 'backend',
    hasTypeScript: true,
    sourceDirs: ['src'],
  };
}

describe('WikiService', () => {
  let db: Database;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate common pages', async () => {
    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, { noLlm: true });

    expect(generated).toContain('overview.md');
    expect(generated).toContain('architecture.md');
    expect(generated).toContain('modules.md');
    expect(generated).toContain('glossary.md');
  });

  it('should write files to disk', async () => {
    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    expect(existsSync(join(wikiDir, 'overview.md'))).toBe(true);
    expect(existsSync(join(wikiDir, 'glossary.md'))).toBe(true);
    expect(existsSync(join(wikiDir, 'api.md'))).toBe(true);
  });

  it('should include scan result data in overview page', async () => {
    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, 'overview.md'), 'utf-8');
    expect(content).toContain('backend');
    expect(content).toContain('express');
  });

  it('should include symbols in glossary page', async () => {
    db.prepare(
      "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)",
    ).run('sym-1', 'UserService', 'class', 'src/services/user.ts', 1, 50);

    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, 'glossary.md'), 'utf-8');
    expect(content).toContain('UserService');
    expect(content).toContain('class');
  });

  it('should include modules in architecture page', async () => {
    db.prepare(
      "INSERT INTO modules (id, name, paths, symbols, dependencies) VALUES (?, ?, ?, ?, ?)",
    ).run('mod-1', 'services', '["src/services"]', '["UserService"]', '[]');

    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, 'architecture.md'), 'utf-8');
    expect(content).toContain('services');
  });

  it('should include modules in modules page', async () => {
    db.prepare(
      "INSERT INTO modules (id, name, paths, symbols, dependencies) VALUES (?, ?, ?, ?, ?)",
    ).run('mod-1', 'core', '["src/core/index.ts"]', '["Scanner"]', '[]');

    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, 'modules.md'), 'utf-8');
    expect(content).toContain('core');
  });
});

describe('WikiService with LLM options', () => {
  let db: Database;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate 8 pages in noLlm mode', async () => {
    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, { noLlm: true });

    expect(generated).toContain('overview.md');
    expect(generated).toContain('architecture.md');
    expect(generated).toContain('data-flow.md');
    expect(generated).toContain('modules.md');
    expect(generated).toContain('api.md');
    expect(generated).toContain('business.md');
    expect(generated).toContain('design-decisions.md');
    expect(generated).toContain('glossary.md');
    expect(generated.length).toBe(10);
  });

  it('should generate only specified pages', async () => {
    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, {
      noLlm: true,
      pages: ['overview', 'glossary'],
    });

    expect(generated).toEqual(['overview.md', 'glossary.md']);
  });

  it('should produce glossary without LLM placeholders', async () => {
    const scanResult = makeBackendScanResult();
    const service = new WikiService(db, scanResult);
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, 'glossary.md'), 'utf-8');
    expect(content).not.toContain('{{LLM:');
  });
});
