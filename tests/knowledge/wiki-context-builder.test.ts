import { describe, it, expect } from 'vitest';
import { WikiContextBuilder } from '../../src/knowledge/wiki-context-builder.js';
import { createMockClient } from '../helpers/mock-mcp-client.js';
import type { ScanResult } from '../../src/core/scanner.js';
import type { QueryResult } from '../../src/mcp/types.js';

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

describe('WikiContextBuilder (MCP-backed)', () => {
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
  });

  describe('buildArchitectureContext', () => {
    it('包含 MCP 的 layers/boundaries/clusters', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildArchitectureContext();

      expect(ctx.layers).toBeDefined();
      expect(ctx.layers!.length).toBeGreaterThan(0);
      expect(ctx.boundaries).toBeDefined();
      expect(ctx.boundaries!.length).toBeGreaterThan(0);
      expect(ctx.clusters).toBeDefined();
    });

    it('modules 来自 packages', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildArchitectureContext();

      expect(ctx.modules.length).toBe(3); // core, services, cli
      expect(ctx.modules.map(m => m.name)).toContain('core');
    });

    it('interModuleRelations 来自 boundaries', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildArchitectureContext();

      expect(ctx.interModuleRelations.length).toBe(2);
      expect(ctx.interModuleRelations[0].source).toBe('services');
    });
  });

  describe('buildDataFlowContext', () => {
    it('从 entry_points + tracePath 构建序列', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildDataFlowContext();

      expect(ctx.sequences.length).toBeGreaterThan(0);
      const seq = ctx.sequences[0];
      expect(seq.name).toBe('registerBuildCommand');
      expect(seq.messages.length).toBeGreaterThan(0);
      expect(seq.participants.length).toBeGreaterThan(0);
    });
  });

  describe('buildGlossaryContext', () => {
    it('通过 Cypher 查询，结果含 docstring，按类型优先级排序', () => {
      const glossaryCypher = `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`;
      const queryResults = new Map<string, QueryResult>([
        [glossaryCypher, {
          columns: ['name', 'type', 'doc', 'sig', 'cx', 'file'],
          rows: [
            ['Foo', 'Class', 'A foo class', 'class Foo', 3, 'src/foo.ts'],
            ['bar', 'Method', 'does bar', 'bar(): void', 1, 'src/bar.ts'],
          ],
          total: 2,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildGlossaryContext();

      expect(ctx.symbols.length).toBe(2);
      expect(ctx.symbols[0].docstring).toBe('A foo class');
      expect(ctx.symbols[0].type).toBe('class');
      // Class 排在 Method 前
      expect(ctx.symbols[0].name).toBe('Foo');
    });

    it('去重同名符号', () => {
      const glossaryCypher = `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`;
      const queryResults = new Map<string, QueryResult>([
        [glossaryCypher, {
          columns: ['name', 'type', 'doc', 'sig', 'cx', 'file'],
          rows: [
            ['Foo', 'Class', 'A foo class', 'class Foo', 3, 'src/foo.ts'],
            ['Foo', 'Class', 'dup', 'class Foo', 1, 'src/foo2.ts'],
          ],
          total: 2,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildGlossaryContext();

      const fooEntries = ctx.symbols.filter(s => s.name === 'Foo');
      expect(fooEntries.length).toBe(1);
    });
  });

  describe('buildApiContext', () => {
    it('commands 来自 entry_points', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildApiContext();

      expect(ctx.commands.length).toBe(2);
      expect(ctx.commands.map(c => c.name)).toContain('registerBuildCommand');
    });
  });

  describe('buildTroubleshootingContext', () => {
    it('modules 来自 packages', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildTroubleshootingContext();

      expect(ctx.modules.length).toBe(3);
      expect(ctx.modules.map(m => m.name)).toContain('core');
    });
  });
});
