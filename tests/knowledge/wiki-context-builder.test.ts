import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WikiContextBuilder } from '../../src/knowledge/wiki-context-builder.js';
import { ConfigDetector } from '../../src/knowledge/config-detector.js';
import { IntentEvidenceProvider } from '../../src/knowledge/intent-evidence.js';
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
      // data-flow 用 Cypher CALLS 边 BFS，过滤测试节点，RETURN 携带 caller 双键与 start_line
      const callsEdgeCypher = `MATCH (caller)-[:CALLS]->(callee)
         WHERE caller.name IN ["registerBuildCommand"]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, caller.file_path AS callerFile,
                callee.name AS callee, callee.file_path AS file, callee.label AS label, callee.start_line AS line
         LIMIT 40`;
      const queryResults = new Map<string, QueryResult>([
        [callsEdgeCypher, {
          columns: ['caller', 'callerFile', 'callee', 'file', 'label', 'line'],
          rows: [
            ['registerBuildCommand', 'src/cli/commands/build.ts', 'FileScanner', 'src/core/scanner.ts', 'Class', 67],
            ['registerBuildCommand', 'src/cli/commands/build.ts', 'WikiService', 'src/services/wiki-service.ts', 'Class', 19],
            ['registerBuildCommand', 'src/cli/commands/build.ts', 'CodebaseMemoryClient', 'src/mcp/codebase-memory-client.ts', 'Class', 24],
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
    it('通过 Cypher 查询，结果含 docstring 与行号，按类型优先级排序，过滤测试路径', () => {
      const glossaryCypher = `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file,
              n.start_line AS line
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`;
      const queryResults = new Map<string, QueryResult>([
        [glossaryCypher, {
          columns: ['name', 'type', 'doc', 'sig', 'cx', 'file', 'line'],
          rows: [
            ['Foo', 'Class', 'A foo class', 'class Foo', 3, 'src/foo.ts', 10],
            ['bar', 'Method', 'does bar', 'bar(): void', 1, 'src/bar.ts', 20],
            ['Ghost', 'Class', 'fixture class', 'class Ghost', 9, 'tests/fixtures/ghost.ts', 1],
          ],
          total: 3,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildGlossaryContext();

      // fixtures 行被过滤，仅保留 2 个生产符号
      expect(ctx.symbols.length).toBe(2);
      expect(ctx.symbols[0].docstring).toBe('A foo class');
      expect(ctx.symbols[0].type).toBe('class');
      expect(ctx.symbols[0].startLine).toBe(10);
      // Class 排在 Method 前
      expect(ctx.symbols[0].name).toBe('Foo');
    });

    it('去重同名符号', () => {
      const glossaryCypher = `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file,
              n.start_line AS line
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`;
      const queryResults = new Map<string, QueryResult>([
        [glossaryCypher, {
          columns: ['name', 'type', 'doc', 'sig', 'cx', 'file', 'line'],
          rows: [
            ['Foo', 'Class', 'A foo class', 'class Foo', 3, 'src/foo.ts', 10],
            ['Foo', 'Class', 'dup', 'class Foo', 1, 'src/foo2.ts', 5],
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

    it('命令描述从 commander 源码 .command(name, desc) 提取（docstring 缺失时兜底）', () => {
      const client = createMockClient({
        codeSnippet: {
          name: 'registerBuildCommand',
          qualified_name: 'proj.registerBuildCommand',
          label: 'Function',
          file_path: 'src/cli/commands/build.ts',
          start_line: 9,
          end_line: 20,
          source: `export function registerBuildCommand(program: Command) {\n  program\n    .command('build', 'Generate wiki documentation from codebase knowledge graph')\n    .option('--no-llm', 'Generate wiki without LLM');\n}`,
        },
      });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildApiContext();

      expect(ctx.commands[0].description).toBe('Generate wiki documentation from codebase knowledge graph');
      expect(ctx.commands[0].startLine).toBe(9);
    });

    it('链式 .description(desc) 风格同样可提取（本仓库实际风格）', () => {
      const client = createMockClient({
        codeSnippet: {
          name: 'registerBuildCommand',
          qualified_name: 'proj.registerBuildCommand',
          label: 'Function',
          file_path: 'src/cli/commands/build.ts',
          start_line: 9,
          end_line: 21,
          source: `export function registerBuildCommand(program: Command) {\n  program\n    .command('build')\n    .description('Generate wiki documentation from codebase knowledge graph')\n    .option('--no-llm', 'Generate wiki without LLM (pure rules)');\n}`,
        },
      });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildApiContext();

      expect(ctx.commands[0].description).toBe('Generate wiki documentation from codebase knowledge graph');
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
  });

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

  describe('buildTopicContext（主题页）', () => {
    const files = ['src/services/wiki-service.ts', 'src/knowledge/page-registry.ts'];
    const fileList = files.map(f => `"${f}"`).join(',');
    const symCypher = `MATCH (n) WHERE n.file_path IN [${fileList}] AND n.is_test = false
         AND (n.docstring IS NOT NULL OR n.complexity > 5) AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.label AS label, n.file_path AS file, n.start_line AS line,
              n.docstring AS doc, n.signature AS sig, n.complexity AS cx
       ORDER BY n.complexity DESC LIMIT 25`;
    const edgeCypher = `MATCH (a)-[:CALLS]->(b)
       WHERE a.file_path IN [${fileList}] AND b.file_path IN [${fileList}]
         AND a.is_test = false AND b.is_test = false
       RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line
       LIMIT 30`;

    it('查询主题文件的符号、CALLS 边与相关边界；未定义主题返回 null', () => {
      const queryResults = new Map<string, QueryResult>([
        [symCypher, {
          columns: ['name', 'label', 'file', 'line', 'doc', 'sig', 'cx'],
          rows: [
            ['buildWiki', 'Method', 'src/services/wiki-service.ts', 34, 'build all', 'async buildWiki()', 9],
            ['ghost', 'Method', 'tests/fixtures/ghost.ts', 1, '', '', 1],
          ],
          total: 2,
        }],
        [edgeCypher, {
          columns: ['caller', 'callerFile', 'callee', 'file', 'line'],
          rows: [['buildWiki', 'src/services/wiki-service.ts', 'pageRelPath', 'src/knowledge/page-registry.ts', 96]],
          total: 1,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      builder.setTopics([{ id: 't1', title: '质量闸门', files }]);

      const ctx = builder.buildByName('topic:t1') as {
        title: string; symbols: Array<{ name: string }>; edges: unknown[]; boundaries: Array<{ from: string }>;
      };
      expect(ctx.title).toBe('质量闸门');
      // fixtures 符号被过滤
      expect(ctx.symbols.map(s => s.name)).toEqual(['buildWiki']);
      expect(ctx.edges.length).toBe(1);
      // mock 边界 services→core 与主题文件（services/knowledge）相关
      expect(ctx.boundaries.map(b => b.from)).toContain('services');

      // 未定义的主题 id → null（服务层跳过写盘）
      expect(builder.buildByName('topic:missing')).toBeNull();
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

  describe('buildCallsContext', () => {
    const methodCypher = (names: string) =>
      `MATCH (a:Method)-[:CALLS]->(b) WHERE a.name IN [${names}] AND a.is_test = false AND b.is_test = false
         RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT 40`;
    const functionCypher = (names: string) =>
      `MATCH (a:Function)-[:CALLS]->(b) WHERE a.name IN [${names}] AND a.is_test = false AND b.is_test = false
         RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT 40`;
    const edgeRow = (caller: string, callerFile: string, callee: string, calleeFile: string, line: number): any[] =>
      [caller, callerFile, callee, calleeFile, line, null];

    it('调用边按组内去重：多个入口共享的中游边在每个入口组都保留', () => {
      const queryResults = new Map<string, QueryResult>([
        [methodCypher('"registerBuildCommand"'), { columns: [], rows: [edgeRow('registerBuildCommand', 'src/cli/commands/build.ts', 'midCall', 'src/core/mid.ts', 10)], total: 1 }],
        [methodCypher('"createProgram"'), { columns: [], rows: [edgeRow('createProgram', 'src/cli/index.ts', 'midCall', 'src/core/mid.ts', 20)], total: 1 }],
        [methodCypher('"midCall"'), { columns: [], rows: [edgeRow('midCall', 'src/core/mid.ts', 'sharedUtil', 'src/core/util.ts', 30)], total: 1 }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildCallsContext();

      expect(ctx.groups.length).toBe(2);
      expect(ctx.groups.map(g => g.entry)).toEqual(['registerBuildCommand', 'createProgram']);
      expect(ctx.groups.every(g => g.kind === 'entry')).toBe(true);
      // 共享的中游边在两个入口组都保留（旧版跨组全局去重会饿死第二个入口组）
      for (const g of ctx.groups) {
        expect(g.edges.some(e => e.callee === 'sharedUtil')).toBe(true);
      }
    });

    it('入口查无边时以高扇入热点锚定回填（kind=hotspot）', () => {
      const fileCypher = `MATCH (n) WHERE n.name IN ["build","init"] AND n.is_test = false
       RETURN n.name AS name, n.file_path AS file LIMIT 15`;
      const queryResults = new Map<string, QueryResult>([
        [fileCypher, { columns: [], rows: [['build', 'src/core/build.ts'], ['init', 'src/core/init.ts']], total: 2 }],
        [methodCypher('"build"'), { columns: [], rows: [edgeRow('build', 'src/core/build.ts', 'helper', 'src/core/helper.ts', 12)], total: 1 }],
        [methodCypher('"init"'), { columns: [], rows: [edgeRow('init', 'src/core/init.ts', 'helper2', 'src/core/helper2.ts', 22)], total: 1 }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildCallsContext();

      // mock 入口无 CALLS 边 → 全部组来自热点回填
      expect(ctx.groups.length).toBe(2);
      expect(ctx.groups.every(g => g.kind === 'hotspot')).toBe(true);
      expect(ctx.groups.map(g => g.entry)).toEqual(['build', 'init']);
      expect(ctx.fanIn.map(f => f.symbol)).toEqual(['build', 'init']);
      expect(ctx.fanIn.every(f => f.file !== '')).toBe(true);
    });

    it('Tauri 项目附加 IPC 命令对表（真实跨语言执行边）', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'calls-ipc-'));
      try {
        mkdirSync(join(tmp, 'src'), { recursive: true });
        mkdirSync(join(tmp, 'src-tauri', 'src'), { recursive: true });
        writeFileSync(join(tmp, 'src-tauri', 'tauri.conf.json'), '{}');
        writeFileSync(join(tmp, 'src', 'store.ts'), "import { invoke } from '@tauri-apps/api/core'\nawait invoke('history_list')\n");
        writeFileSync(join(tmp, 'src-tauri', 'src', 'cmd.rs'), '#[tauri::command]\nfn history_list() {}\n');

        const scan = makeScanResult({
          rootDir: tmp,
          files: [
            { absolutePath: join(tmp, 'src/store.ts'), relativePath: 'src/store.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
            { absolutePath: join(tmp, 'src-tauri/src/cmd.rs'), relativePath: 'src-tauri/src/cmd.rs', language: 'rust' as const, extension: '.rs', size: 50 },
          ],
        });
        const builder = new WikiContextBuilder(createMockClient() as any, scan);
        const ctx = builder.buildCallsContext();

        expect(ctx.ipc).toBeDefined();
        expect(ctx.ipc!.commands.length).toBe(1);
        expect(ctx.ipc!.commands[0].name).toBe('history_list');
        expect(ctx.ipc!.commands[0].rustDef?.file).toBe('src-tauri/src/cmd.rs');
        expect(ctx.ipc!.commands[0].frontendCalls[0].file).toBe('src/store.ts');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
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

  describe('buildOnboardingContext CLI 命令启发式门控', () => {
    const archWithComposable = {
      total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [],
      languages: [{ language: 'TypeScript', file_count: 5 }],
      packages: [{ name: 'components', node_count: 5, fan_in: 1, fan_out: 1 }],
      entry_points: [
        { name: 'openCreateQuickCommandGroup', qualified_name: 'p.openCreateQuickCommandGroup', file: 'src/components/settings/useGroupNameDialog.ts' },
      ],
      hotspots: [], boundaries: [], layers: [], clusters: [],
    };

    it('frontend 项目不把 composable（名含 Command）当 CLI 命令', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'onboard-'));
      try {
        writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'web' }));
        const scan = makeScanResult({
          rootDir: tmp,
          projectType: 'frontend',
          files: [
            { absolutePath: join(tmp, 'src/components/settings/useGroupNameDialog.ts'), relativePath: 'src/components/settings/useGroupNameDialog.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
          ],
        });
        const builder = new WikiContextBuilder(createMockClient({ architecture: archWithComposable }) as any, scan, new ConfigDetector(tmp));
        const ctx = builder.buildOnboardingContext();

        expect(ctx.cliCommands).toEqual([]);
        // 非命令式项目首次运行示例不再拼 node dist/bin.js <command>
        expect(ctx.firstRunExample).not.toContain('node dist/bin.js');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('cli 项目照常派生命令名，并登记入断言校验 universe', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'onboard-'));
      try {
        writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'cli', scripts: { build: 'tsc' } }));
        const scan = makeScanResult({
          rootDir: tmp,
          projectType: 'cli',
          files: [
            { absolutePath: join(tmp, 'src/cli/commands/build.ts'), relativePath: 'src/cli/commands/build.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
          ],
        });
        const arch = {
          ...archWithComposable,
          entry_points: [{ name: 'registerBuildCommand', qualified_name: 'p.registerBuildCommand', file: 'src/cli/commands/build.ts' }],
        };
        const builder = new WikiContextBuilder(createMockClient({ architecture: arch }) as any, scan, new ConfigDetector(tmp));
        const ctx = builder.buildOnboardingContext();

        expect(ctx.cliCommands.map(c => c.name)).toContain('build');
        expect(builder.getFallbackSymbolNames().has('build')).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('意图证据接线（intent-evidence 集成）', () => {
    it('overview/architecture/modules 注入 intent 与 fanIn/fanOut；layers 消费侧过滤脏行', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'intent-wire-'));
      try {
        mkdirSync(join(tmp, 'src/core'), { recursive: true });
        writeFileSync(join(tmp, 'src/index.ts'), '// CLI 入口：注册三个命令\nexport const main = 1;\n');
        writeFileSync(join(tmp, 'src/core/scanner.ts'), '// 扫描器：递归遍历并识别技术栈\nexport const A = 1;\n');
        const scan = makeScanResult({
          rootDir: tmp,
          files: [
            { absolutePath: join(tmp, 'src/index.ts'), relativePath: 'src/index.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
            { absolutePath: join(tmp, 'src/core/scanner.ts'), relativePath: 'src/core/scanner.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
          ],
        });
        const arch = {
          ...createMockClient().getArchitecture(),
          layers: [
            { name: 'core', layer: 'core', reason: 'high fan-in' },
            { name: '', layer: 'api', reason: 'has HTTP route definitions' },
            { name: 'ts', layer: 'api', reason: 'has HTTP route definitions' },
          ],
          clusters: [{ id: 0, label: 'src', members: 3, cohesion: 0.87, top_nodes: ['a'] }],
        };
        const provider = new IntentEvidenceProvider(scan, { runGit: () => null });
        const builder = new WikiContextBuilder(createMockClient({ architecture: arch }) as any, scan, new ConfigDetector(tmp));
        builder.setIntentProvider(provider);

        const overview = builder.buildOverviewContext();
        expect(overview.intent?.some(e => e.kind === 'file-header')).toBe(true);

        const architecture = builder.buildArchitectureContext();
        expect(architecture.layers?.map(l => l.name)).toEqual(['core']);
        expect(architecture.clusters?.[0].cohesion).toBeCloseTo(0.87);
        const coreModule = architecture.modules.find(m => m.name === 'core')!;
        expect(coreModule.fanIn).toBe(3);
        expect(coreModule.fanOut).toBe(1);
        expect(coreModule.intent?.some(e => e.kind === 'file-header')).toBe(true);

        const modules = builder.buildModulesContext();
        expect(modules.modules.find(m => m.name === 'core')?.intent).toBeDefined();
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('decisions：无 provider 返回 null；证据全缺返回 null；有 git 证据时成上下文', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'intent-dec-'));
      try {
        mkdirSync(join(tmp, 'src/core'), { recursive: true });
        writeFileSync(join(tmp, 'src/core/a.ts'), 'export const A = 1;\n');
        const scan = makeScanResult({
          rootDir: tmp,
          files: [
            { absolutePath: join(tmp, 'src/core/a.ts'), relativePath: 'src/core/a.ts', language: 'typescript' as const, extension: '.ts', size: 30 },
          ],
        });
        const client = createMockClient();
        const noProvider = new WikiContextBuilder(client as any, scan, new ConfigDetector(tmp));
        expect(noProvider.buildDecisionsContext()).toBeNull();

        const emptyProvider = new IntentEvidenceProvider(scan, { runGit: () => null });
        const withEmpty = new WikiContextBuilder(client as any, scan, new ConfigDetector(tmp));
        withEmpty.setIntentProvider(emptyProvider);
        expect(withEmpty.buildDecisionsContext()).toBeNull();

        const log = 'aaaa1111bbbb2222cccc3333dddd4444\t2026-06-01\tinit scanner\n';
        const gitProvider = new IntentEvidenceProvider(scan, {
          runGit: args => (args[0] === 'rev-parse' ? 'HEAD\n' : args[0] === 'log' ? log : null),
        });
        const withGit = new WikiContextBuilder(client as any, scan, new ConfigDetector(tmp));
        withGit.setIntentProvider(gitProvider);
        const ctx = withGit.buildDecisionsContext();
        expect(ctx).not.toBeNull();
        expect(ctx!.gitTimeline.length).toBe(1);
        expect(ctx!.gitTimeline[0].first!.subject).toBe('init scanner');
        expect(ctx!.hotFileChurn.map(c => c.file)).toContain('src/core/a.ts');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
