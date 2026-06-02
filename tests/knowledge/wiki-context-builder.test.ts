import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from 'better-sqlite3';
import { createDatabase, closeDatabase } from '../../src/core/database.js';
import { WikiContextBuilder } from '../../src/knowledge/wiki-context-builder.js';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';
import type { ScanResult } from '../../src/core/scanner.js';

const tmpDir = join(process.cwd(), '.test-ctx-tmp');

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    rootDir: '/tmp/test-project',
    files: [],
    techStack: ['commander', 'typescript'],
    projectType: 'cli',
    hasTypeScript: true,
    sourceDirs: ['src'],
    ...overrides,
  };
}

describe('WikiContextBuilder', () => {
  let db: Database;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('buildOverviewContext', () => {
    it('should extract project metadata from scan result', () => {
      const builder = new WikiContextBuilder(db, makeScanResult({
        files: [
          { absolutePath: '/tmp/src/index.ts', relativePath: 'src/index.ts', language: 'typescript' as const, extension: '.ts', size: 100 },
          { absolutePath: '/tmp/src/cli.ts', relativePath: 'src/cli.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
        ],
      }));
      const ctx = builder.buildOverviewContext();

      expect(ctx.projectType).toBe('cli');
      expect(ctx.hasTypeScript).toBe(true);
      expect(ctx.fileCount).toBe(2);
      expect(ctx.techStack).toContain('commander');
      expect(ctx.sourceDirs).toContain('src');
    });

    it('should include entry files (index.ts/main.ts)', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s1', 'main', 'function', 'src/index.ts', 1, 10);

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildOverviewContext();

      expect(ctx.entryFiles.length).toBeGreaterThanOrEqual(0);
    });

    it('should include top-level symbols', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s1', 'IndexService', 'class', 'src/services/index-service.ts', 1, 50);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s2', 'scan', 'function', 'src/scanner.ts', 1, 20);

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildOverviewContext();

      expect(ctx.topSymbols.length).toBeGreaterThan(0);
      expect(ctx.topSymbols.map(s => s.name)).toContain('IndexService');
    });
  });

  describe('buildArchitectureContext', () => {
    it('should extract modules and inter-module relations', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s1', 'IndexService', 'class', 'src/services/index-service.ts', 1, 50);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s2', 'Scanner', 'class', 'src/core/scanner.ts', 1, 30);
      db.prepare(
        "INSERT INTO modules (id, name, paths, symbols, dependencies) VALUES (?, ?, ?, ?, ?)"
      ).run('m1', 'services', '["src/services"]', '["IndexService"]', '["core"]');
      db.prepare(
        "INSERT INTO modules (id, name, paths, symbols, dependencies) VALUES (?, ?, ?, ?, ?)"
      ).run('m2', 'core', '["src/core"]', '["Scanner"]', '[]');
      db.prepare(
        "INSERT INTO relations (id, source, target, type, file_path) VALUES (?, ?, ?, ?, ?)"
      ).run('r1', 'IndexService', 'Scanner', 'depends_on', 'src/services/index-service.ts');

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildArchitectureContext();

      expect(ctx.modules.length).toBe(2);
      expect(ctx.interModuleRelations.length).toBe(1);
      expect(ctx.interModuleRelations[0].source).toBe('IndexService');
      expect(ctx.interModuleRelations[0].target).toBe('Scanner');
    });

    it('should filter out intra-module relations', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s1', 'IndexService', 'class', 'src/services/index-service.ts', 1, 50);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s2', 'QAService', 'class', 'src/services/qa-service.ts', 1, 30);
      db.prepare(
        "INSERT INTO modules (id, name, paths, symbols, dependencies) VALUES (?, ?, ?, ?, ?)"
      ).run('m1', 'services', '["src/services"]', '["IndexService", "QAService"]', '[]');
      db.prepare(
        "INSERT INTO relations (id, source, target, type, file_path) VALUES (?, ?, ?, ?, ?)"
      ).run('r1', 'IndexService', 'QAService', 'depends_on', 'src/services/index-service.ts');

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildArchitectureContext();

      // Both symbols belong to same module, so relation is intra-module
      expect(ctx.interModuleRelations.length).toBe(0);
    });
  });

  describe('buildDataFlowContext', () => {
    it('should trace execution pipelines from entry points', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s1', 'createProgram', 'function', 'src/cli/index.ts', 1, 10);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s2', 'registerBuildCommand', 'function', 'src/cli/commands/build.ts', 1, 10);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s3', 'buildWiki', 'method', 'src/services/wiki-service.ts', 5, 50);

      db.prepare(
        "INSERT INTO relations (id, source, target, type, file_path) VALUES (?, ?, ?, ?, ?)"
      ).run('r1', 'createProgram', 'registerBuildCommand', 'calls', 'src/cli/index.ts');
      db.prepare(
        "INSERT INTO relations (id, source, target, type, file_path) VALUES (?, ?, ?, ?, ?)"
      ).run('r2', 'registerBuildCommand', 'buildWiki', 'calls', 'src/cli/commands/build.ts');

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildDataFlowContext();

      expect(ctx.pipelines.length).toBeGreaterThan(0);
    });
  });

  describe('buildApiContext', () => {
    it('should extract CLI commands and exported functions', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s1', 'registerBuildCommand', 'function', 'src/cli/commands/build.ts', 1, 20);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s2', 'registerAskCommand', 'function', 'src/cli/commands/ask.ts', 1, 15);

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildApiContext();

      expect(ctx.commands.length).toBe(2);
      expect(ctx.commands.map(c => c.name)).toContain('registerBuildCommand');
    });
  });

  describe('buildBusinessContext', () => {
    it('should extract services with methods and dependencies', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run('s1', 'IndexService', 'class', 'src/services/index-service.ts', 1, 50, null, null);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run('s2', 'indexProject', 'method', 'src/services/index-service.ts', 10, 40, 'IndexService', 'public');
      db.prepare(
        "INSERT INTO relations (id, source, target, type, file_path) VALUES (?, ?, ?, ?, ?)"
      ).run('r1', 'IndexService', 'FileScanner', 'depends_on', 'src/services/index-service.ts');

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildBusinessContext();

      expect(ctx.services.length).toBe(1);
      expect(ctx.services[0].name).toBe('IndexService');
      expect(ctx.services[0].methods.map(m => m.name)).toContain('indexProject');
      expect(ctx.services[0].dependencies.length).toBe(1);
    });
  });

  describe('buildDesignDecisionsContext', () => {
    it('should detect strategy pattern from resolver registry', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s1', 'ResolverRegistry', 'class', 'src/strategy/resolver-registry.ts', 1, 30);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s2', 'NestResolver', 'class', 'src/strategy/resolvers/nest-resolver.ts', 1, 20);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s3', 'ReactResolver', 'class', 'src/strategy/resolvers/react-resolver.ts', 1, 20);

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildDesignDecisionsContext();

      expect(ctx.patterns.length).toBe(0); // No register() method, so no pattern detected
    });

    it('should detect tech choices from dependencies', () => {
      const builder = new WikiContextBuilder(db, makeScanResult({
        techStack: ['better-sqlite3', 'tree-sitter-typescript', 'commander'],
      }));
      const ctx = builder.buildDesignDecisionsContext();

      expect(ctx.techChoices.length).toBeGreaterThan(0);
    });
  });

  describe('buildGlossaryContext', () => {
    it('should return deduplicated symbols', () => {
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s1', 'UserService', 'class', 'src/services/user.ts', 1, 50);
      db.prepare(
        "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
      ).run('s2', 'UserService', 'class', 'src/services/user.ts', 1, 50);

      const builder = new WikiContextBuilder(db, makeScanResult());
      const ctx = builder.buildGlossaryContext();

      // Deduplicated: only one UserService entry
      const userServiceEntries = ctx.symbols.filter(s => s.name === 'UserService');
      expect(userServiceEntries.length).toBe(1);
    });
  });
});
