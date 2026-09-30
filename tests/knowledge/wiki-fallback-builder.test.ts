import { describe, expect, it } from 'vitest';
import { WikiFallbackBuilder } from '../../src/knowledge/wiki-fallback-builder.js';
import type {
  ArchitectureContext,
  EnvironmentContext,
  ModulesContext,
  TechStackContext,
  TestingContext,
} from '../../src/knowledge/types.js';
import type { SymbolType } from '../../src/core/types.js';

describe('WikiFallbackBuilder architecture/modules production module rendering', () => {
  it('Architecture key exports preserve sampled symbol file anchors', () => {
    const ctx: ArchitectureContext = {
      modules: [{
        name: 'services',
        files: ['src/services/wiki-service.ts'],
        fileCount: 4,
        symbols: [{
          name: 'WikiService',
          type: 'class' as SymbolType,
          file: 'src/services/wiki-service.ts',
          startLine: 65,
        }],
        outgoingRelations: [{ target: 'knowledge', type: 'calls' }],
        incomingRelations: [],
        codeSnippets: [],
        languages: [{ language: 'ts', fileCount: 4 }],
        fanIn: 2,
        fanOut: 41,
      }],
      interModuleRelations: [],
    };

    const output = new WikiFallbackBuilder().buildArchitecture(ctx);
    expect(output).toContain('`WikiService`（src/services/wiki-service.ts:65）');
    expect(output).toContain('Files: 4');
    expect(output).toContain('Languages: ts × 4');
    expect(output).toContain('Fan-in/out: 2 / 41');
  });

  it('Modules without graph symbols still expose deterministic production module facts', () => {
    const ctx: ModulesContext = {
      modules: [{
        name: 'core',
        files: ['src/core/scanner.ts'],
        fileCount: 3,
        symbols: [],
        fileSymbols: [],
        outgoingRelations: [{ target: 'shared', type: 'calls' }],
        incomingRelations: [{ source: 'services', type: 'calls' }],
        codeSnippets: [],
        languages: [
          { language: 'ts', fileCount: 2 },
          { language: 'rust', fileCount: 1 },
        ],
        fanIn: 2,
        fanOut: 3,
      }],
    };

    const output = new WikiFallbackBuilder().buildModules(ctx);
    expect(output).toContain('Files: 3');
    expect(output).toContain('Languages: ts × 2 / rust × 1');
    expect(output).toContain('Depends on: `shared`');
    expect(output).toContain('Used by: `services`');
    expect(output).toContain('Fan-in/out: 2 / 3');
  });

  it('Modules aggregate fallback explains composite importance ranking', () => {
    const ctx: ModulesContext = {
      modules: [],
      otherModules: [
        { name: 'secondary', fileCount: 4, symbolCount: 20 },
      ],
    };

    const output = new WikiFallbackBuilder().buildModules(ctx);
    expect(output).toContain('扇入/扇出/节点数/生产文件数综合重要性取前 12');
  });

  it('Environment fallback only renders production env evidence with file anchors', () => {
    const ctx: EnvironmentContext = {
      packageName: 'demo',
      version: '1.0.0',
      runtime: 'ESM',
      nodeVersion: '20',
      packageManager: 'pnpm',
      scripts: {},
      envVars: [{
        name: 'API_KEY',
        sensitive: true,
        filePaths: ['src/index.ts'],
      }],
    };

    const output = new WikiFallbackBuilder().buildEnvironment(ctx);
    expect(output).toContain('| API_KEY | ⚠️ 是 | src/index.ts |');
    expect(output).not.toContain('⚠️ 待确认');
  });

  it('Testing fallback renders test-only evidence separately', () => {
    const ctx: TestingContext = {
      framework: 'vitest',
      configPath: 'vitest.config.ts',
      testDirs: ['tests'],
      fixturesDir: 'tests/fixtures',
      runCommand: 'pnpm test',
      productionFileCount: 12,
      testFileCount: 8,
      testOnlyEnvVars: [{
        name: 'TEST_WIKI_KEY',
        sensitive: true,
        filePaths: ['tests/config.test.ts'],
      }],
      testOnlyConstants: [{
        name: 'TEST_MAX_ROWS',
        value: '20',
        filePath: 'tests/config.test.ts',
        line: 3,
      }],
      testOnlyDeps: [{
        name: 'vitest',
        version: '^4.0.0',
        importFiles: ['tests/config.test.ts'],
      }],
    };

    const output = new WikiFallbackBuilder().buildTesting(ctx);
    expect(output).toContain('生产文件 12 / 测试文件 8');
    expect(output).toContain('| TEST_WIKI_KEY | ⚠️ 是 | tests/config.test.ts |');
    expect(output).toContain('| `TEST_MAX_ROWS` | `20` | tests/config.test.ts:3 |');
    expect(output).toContain('| `vitest` | ^4.0.0 | `tests/config.test.ts` |');
  });

  it('Tech-stack fallback renders test-only dependencies separately', () => {
    const ctx: TechStackContext = {
      coreDeps: [],
      devDeps: [],
      testDeps: [{
        name: 'vitest',
        version: '^4.0.0',
        importFiles: ['tests/config.test.ts'],
        usageKind: 'test',
      }],
      unusedDeps: [],
      runtime: 'ESM',
      buildTool: 'tsup',
      packageManager: 'pnpm',
    };

    const output = new WikiFallbackBuilder().buildTechStack(ctx);
    expect(output).toContain('## 测试专用依赖');
    expect(output).toContain('| `vitest` | ^4.0.0 | `tests/config.test.ts` |');
  });
});
