import { describe, it, expect } from 'vitest';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { ConfigDetector } from '../../../src/knowledge/config-detector.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { makeScanResult, scannedFile } from './helpers.js';
  describe('buildOverviewContext', () => {
    it('从 scanResult 提取项目元数据', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        files: [
          { absolutePath: '/tmp/src/index.ts', relativePath: 'src/index.ts', language: 'typescript' as const, extension: '.ts', size: 100 },
        ],
      }));
      const ctx = builder.buildOverviewContext();

      expect(ctx.projectType).toBe('cli');
      expect(ctx.hasTypeScript).toBe(true);
      expect(ctx.techStack).toContain('commander');
    });

    it('topSymbols 来自 MCP hotspots', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildOverviewContext();

      expect(ctx.topSymbols.length).toBeGreaterThan(0);
      expect(ctx.topSymbols[0].name).toBe('build');
      expect(ctx.topSymbols[0].complexity).toBe(8);
    });

  it('entryFiles 检测 index.ts', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        files: [
          { absolutePath: '/tmp/src/index.ts', relativePath: 'src/index.ts', language: 'typescript' as const, extension: '.ts', size: 100 },
        ],
      }));
      const ctx = builder.buildOverviewContext();

    expect(ctx.entryFiles.some(f => f.path === 'src/index.ts')).toBe(true);
  });

  it('overview 语言分布来自生产扫描文件，不采用图谱的全量语言统计', () => {
    const client = createMockClient({
      architecture: {
        ...createMockClient().getArchitecture(),
        languages: [{ language: 'TypeScript', file_count: 999 }],
      },
    });
    const builder = new WikiContextBuilder(client as any, makeScanResult({
      files: [
        'src/index.ts',
        'src-tauri/main.rs',
        'tests/index.test.ts',
      ].map(f => scannedFile('/tmp/test-project', f)),
    }));

    const ctx = builder.buildOverviewContext();
    expect(ctx.languages).toEqual([
      { language: 'typescript', fileCount: 1, exampleFiles: ['src/index.ts'] },
      { language: 'rust', fileCount: 1, exampleFiles: ['src-tauri/main.rs'] },
    ]);
  });
});

  describe('context 质量补齐（fixtures 过滤与包元数据）', () => {
    it('overview 入口文件过滤 tests/ 路径', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        files: [
          { absolutePath: '/tmp/test-project/src/index.ts', relativePath: 'src/index.ts', language: 'typescript' as const, extension: '.ts', size: 100 },
          { absolutePath: '/tmp/test-project/tests/fixtures/sample-project/src/index.ts', relativePath: 'tests/fixtures/sample-project/src/index.ts', language: 'typescript' as const, extension: '.ts', size: 100 },
        ],
      }));
      const ctx = builder.buildOverviewContext();

      expect(ctx.entryFiles.map(f => f.path)).toEqual(['src/index.ts']);
    });

    it('overview 携带 package.json 的 name/description，缺失时诚实为空', () => {
      const client = createMockClient();
      const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      const builder = new WikiContextBuilder(client as any, makeScanResult({ rootDir: process.cwd() }));
      const withPkg = builder.buildOverviewContext();
      expect(withPkg.packageName).toBe(pkg.name);

      const noPkg = new WikiContextBuilder(client as any, makeScanResult({ rootDir: '/tmp/definitely-missing' }))
        .buildOverviewContext();
      expect(noPkg.packageName).toBe('');
      expect(noPkg.packageDescription).toBe('');
    });

    it('tech-stack 区分生产依赖、脚本工具与测试专用依赖', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'tech-scope-'));
      try {
        writeFileSync(join(tmp, 'package.json'), JSON.stringify({
          name: 'tech-scope',
          dependencies: { commander: '^12.0.0' },
          devDependencies: { tsup: '^8.0.0', vitest: '^4.0.0' },
          scripts: { build: 'tsup', test: 'vitest run' },
        }));
        mkdirSync(join(tmp, 'src'), { recursive: true });
        mkdirSync(join(tmp, 'tests'), { recursive: true });
        writeFileSync(join(tmp, 'src/cli.ts'), "import { Command } from 'commander'\n");
        writeFileSync(join(tmp, 'tests/cli.test.ts'), "import { describe } from 'vitest'\n");

        const scan = makeScanResult({
          rootDir: tmp,
          files: [
            'src/cli.ts',
            'tests/cli.test.ts',
          ].map(f => scannedFile(tmp, f)),
          techStack: ['commander'],
          testTechStack: ['vitest'],
        });
        const detector = new ConfigDetector(tmp);
        detector.setSourceClassification({
          production: [join(tmp, 'src/cli.ts')],
          test: [join(tmp, 'tests/cli.test.ts')],
        });
        const ctx = new WikiContextBuilder(createMockClient() as any, scan, detector)
          .buildTechStackContext();

        expect(ctx.coreDeps).toEqual([{
          name: 'commander',
          version: '^12.0.0',
          importFiles: ['src/cli.ts'],
          usageKind: 'import',
        }]);
        expect(ctx.devDeps).toEqual([{
          name: 'tsup',
          version: '^8.0.0',
          importFiles: [],
          usageKind: 'script',
        }]);
        expect(ctx.testDeps).toEqual([{
          name: 'vitest',
          version: '^4.0.0',
          importFiles: ['tests/cli.test.ts'],
          usageKind: 'test',
        }]);
        expect(ctx.unusedDeps).toEqual([]);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('证据补强（二次扩展检索）', () => {
    const supplementalCypher = `MATCH (n) WHERE n.is_test = false AND n.file_path IS NOT NULL
         AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.label AS label, n.file_path AS file,
              n.complexity AS cx, n.signature AS sig, n.docstring AS doc
       ORDER BY n.complexity DESC LIMIT 8`;

    it('structure 页证据不足时附加 supplementalSymbols（只保留扫描清单内文件）', () => {
      const queryResults = new Map<string, QueryResult>([
        [supplementalCypher, {
          columns: ['name', 'label', 'file', 'cx', 'sig', 'doc'],
          rows: [
            ['buildWiki', 'Method', 'src/services/wiki-service.ts', 9, 'async buildWiki()', 'build all pages'],
            ['ghostFn', 'Function', 'src/ghost.ts', 5, 'ghostFn()', null],
          ],
          total: 2,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        files: [
          { absolutePath: '/tmp/test-project/src/index.ts', relativePath: 'src/index.ts', language: 'typescript' as const, extension: '.ts', size: 100 },
          { absolutePath: '/tmp/test-project/src/services/wiki-service.ts', relativePath: 'src/services/wiki-service.ts', language: 'typescript' as const, extension: '.ts', size: 100 },
        ],
      }));
      // overview ctx 证据仅 entryFiles（1 个）→ 触发补强
      const ctx = builder.buildByName('overview') as { supplementalSymbols?: Array<{ name: string; file: string }> };
      expect(ctx.supplementalSymbols).toBeDefined();
      expect(ctx.supplementalSymbols!.map(s => s.name)).toEqual(['buildWiki']);
      expect(ctx.supplementalSymbols![0].file).toBe('src/services/wiki-service.ts');
    });

    it('证据充足时不触发补强查询', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        files: [
          'src/index.ts', 'src/cli.ts', 'src/main.ts',
        ].map(rel => ({
          absolutePath: `/tmp/test-project/${rel}`,
          relativePath: rel,
          language: 'typescript' as const,
          extension: '.ts',
          size: 100,
        })),
      }));
      // 3 个入口文件 → 证据达标
      const ctx = builder.buildByName('overview') as { supplementalSymbols?: unknown };
      expect(ctx.supplementalSymbols).toBeUndefined();
      expect(client.queryGraph).not.toHaveBeenCalledWith(expect.stringContaining('file_path IS NOT NULL'));
    });
  });
