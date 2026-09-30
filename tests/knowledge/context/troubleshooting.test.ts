import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { ConfigDetector } from '../../../src/knowledge/config-detector.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import type { ScanResult } from '../../../src/core/scanner.js';
import { makeScanResult } from './helpers.js';
  describe('buildTroubleshootingContext', () => {
    it('modules 来自 packages，并携带运行态/常量/入口等排障数据', () => {
      const client = createMockClient();
      const scan = makeScanResult({
        files: [
          { absolutePath: '/tmp/test-project/src/index.ts', relativePath: 'src/index.ts', language: 'typescript' as const, extension: '.ts', size: 100 },
        ],
      });
      const builder = new WikiContextBuilder(client as any, scan, new ConfigDetector(scan.rootDir));
      const ctx = builder.buildTroubleshootingContext();

      expect(ctx.modules.length).toBe(3);
      expect(ctx.modules.map(m => m.name)).toContain('core');
      // 运行态数据（ConfigDetector）：scripts/packageManager 必有（探测 /tmp 下无 package.json 也返回默认值）
      expect(ctx.packageManager).toBeTruthy();
      expect(ctx.scripts).toBeDefined();
      expect(ctx.envVars).toBeDefined();
      expect(ctx.constants).toBeDefined();
      // 入口文件过滤测试路径
      expect(ctx.entryFiles).toEqual(['src/index.ts']);
    });
  });

  describe('依赖使用证据（depUsage）', () => {
    let tmp: string;

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'dep-usage-'));
      mkdirSync(join(tmp, 'src'), { recursive: true });
      mkdirSync(join(tmp, 'tests'), { recursive: true });
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        name: 'demo',
        dependencies: { commander: '^12.0.0' },
        devDependencies: { vitest: '^1.0.0', husky: '^9.0.0' },
        scripts: { test: 'vitest run', prepare: 'husky install' },
      }));
      writeFileSync(join(tmp, 'src', 'cli.ts'), "import { Command } from 'commander'\n");
      writeFileSync(join(tmp, 'tests', 'cli.test.ts'), "import { describe } from 'vitest'\n");
    });

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true });
    });

    function makeProjectScan(techStack: string[] = ['commander', 'typescript']): ScanResult {
      return makeScanResult({
        rootDir: tmp,
        techStack,
        files: [
          { absolutePath: join(tmp, 'src/cli.ts'), relativePath: 'src/cli.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
          { absolutePath: join(tmp, 'tests/cli.test.ts'), relativePath: 'tests/cli.test.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
        ],
      });
    }

    it('overview/troubleshooting 携带依赖使用证据', () => {
      const scan = makeProjectScan();
      const builder = new WikiContextBuilder(createMockClient() as any, scan, new ConfigDetector(scan.rootDir));
      const overview = builder.buildOverviewContext();
      const troubleshooting = builder.buildTroubleshootingContext();

      expect(overview.depUsage).toBeDefined();
      const commander = overview.depUsage!.find(d => d.name === 'commander');
      expect(commander).toBeDefined();
      expect(commander!.usageKind).toBe('import');
      expect(commander!.importFiles).toEqual(['src/cli.ts']);
      expect(commander!.importCount).toBe(1);
      expect(troubleshooting.depUsage?.some(d => d.name === 'commander')).toBe(true);
    });

    it('usageKind 分级：测试型工具=仅测试文件 import，脚本型=仅 scripts 引用，不再误报声明未用', () => {
      const scan = makeProjectScan(['commander', 'vitest', 'husky', 'typescript']);
      const builder = new WikiContextBuilder(createMockClient() as any, scan, new ConfigDetector(scan.rootDir));
      const usage = builder.buildOverviewContext().depUsage!;
      const by = new Map(usage.map(d => [d.name, d]));

      expect(by.get('vitest')!.usageKind).toBe('test');
      expect(by.get('vitest')!.importFiles).toEqual(['tests/cli.test.ts']);
      expect(by.get('husky')!.usageKind).toBe('script');
      expect(by.get('husky')!.importFiles).toEqual([]);
    });

    it('getDepNames 并入声明依赖名与 techStack 探测名（断言校验 universe 回填）', () => {
      const builder = new WikiContextBuilder(createMockClient() as any, makeProjectScan());
      const names = builder.getDepNames();

      expect(names.has('commander')).toBe(true);
      expect(names.has('vitest')).toBe(true);
      expect(names.has('typescript')).toBe(true);
    });
  });
