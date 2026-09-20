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
    it('从 entry_points + CALLS 边构建真实调用序列（带行号，子链去重）', () => {
      // data-flow 用 Cypher CALLS 边 BFS，过滤测试节点，RETURN 携带 start_line
      const callsEdgeCypher = `MATCH (caller)-[:CALLS]->(callee)
         WHERE caller.name IN ["registerBuildCommand"]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, callee.name AS callee,
                callee.file_path AS file, callee.label AS label, callee.start_line AS line
         LIMIT 40`;
      const queryResults = new Map<string, QueryResult>([
        [callsEdgeCypher, {
          columns: ['caller', 'callee', 'file', 'label', 'line'],
          rows: [
            ['registerBuildCommand', 'FileScanner', 'src/core/scanner.ts', 'Class', 67],
            ['registerBuildCommand', 'WikiService', 'src/services/wiki-service.ts', 'Class', 19],
            ['registerBuildCommand', 'CodebaseMemoryClient', 'src/mcp/codebase-memory-client.ts', 'Class', 24],
          ],
          total: 3,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildDataFlowContext();

      expect(ctx.sequences.length).toBeGreaterThan(0);
      const seq = ctx.sequences[0];
      expect(seq.name).toBe('registerBuildCommand');
      expect(seq.messages.length).toBe(3);
      // 每条消息的 from 都是真实 caller（registerBuildCommand），不是线性串联
      expect(seq.messages.every(m => m.from === 'registerBuildCommand')).toBe(true);
      expect(seq.participants.length).toBe(4); // entry + 3 callees
      // 行号来自图谱 start_line，不再产出 file:0 残缺锚点
      expect(seq.messages.every(m => m.callLine > 0)).toBe(true);
      // createProgram 不是 registerBuildCommand 链的参与者，应保留自己的序列尝试
      // （其 BFS 查询无结果 → 不产生序列；registerBuildCommand 链内符号不重复成节）
      expect(ctx.sequences.filter(s => s.name === 'FileScanner').length).toBe(0);
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
    it('只有 register*/*Command 入口标为命令，普通导出函数归入导出函数表', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildApiContext();

      // mock entry_points: registerBuildCommand + createProgram（非命令）
      expect(ctx.commands.length).toBe(1);
      expect(ctx.commands[0].name).toBe('registerBuildCommand');
      // createProgram 是无调用者的导出符号，应出现在导出函数表而非命令表
      expect(ctx.commands.map(c => c.name)).not.toContain('createProgram');
      expect(ctx.exportedFunctions.map(f => f.name)).toContain('createProgram');
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

  describe('证据补强（二次扩展检索）', () => {
    const supplementalCypher = `MATCH (n) WHERE n.is_test = false AND n.file_path IS NOT NULL
         AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.label AS label, n.file_path AS file,
              n.complexity AS cx, n.signature AS sig
       ORDER BY n.complexity DESC LIMIT 8`;

    it('structure 页证据不足时附加 supplementalSymbols（只保留扫描清单内文件）', () => {
      const queryResults = new Map<string, QueryResult>([
        [supplementalCypher, {
          columns: ['name', 'label', 'file', 'cx', 'sig'],
          rows: [
            ['buildWiki', 'Method', 'src/services/wiki-service.ts', 9, 'async buildWiki()'],
            ['ghostFn', 'Function', 'src/ghost.ts', 5, 'ghostFn()'],
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

  describe('buildModulesContext 大仓库分组', () => {
    it('模块数超过 12 时详述前 12、其余聚合为概要', () => {
      const manyPackages = Array.from({ length: 15 }, (_, i) => ({
        name: `mod${i}`, node_count: 2, fan_in: 0, fan_out: 1,
      }));
      const client = createMockClient({
        architecture: {
          total_nodes: 30, total_edges: 10,
          node_labels: [], edge_types: [], languages: [],
          packages: manyPackages,
          entry_points: [], hotspots: [], boundaries: [], layers: [], clusters: [],
        },
      });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildModulesContext();

      expect(ctx.modules.length).toBe(12);
      expect(ctx.otherModules).toBeDefined();
      expect(ctx.otherModules!.length).toBe(3);
      expect(ctx.otherModules!.map(m => m.name)).toEqual(['mod12', 'mod13', 'mod14']);
    });
  });
});
