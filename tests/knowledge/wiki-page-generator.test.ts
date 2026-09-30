import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiPageGenerator } from '../../src/knowledge/wiki-page-generator.js';
import type {
  ArchitectureContext,
  ModulesContext,
  OverviewContext,
} from '../../src/knowledge/types.js';
import type { SymbolType } from '../../src/core/types.js';

// Mock the ai module
vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

import { streamText } from 'ai';
const mockStreamText = vi.mocked(streamText);

describe('WikiPageGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call streamText with correct prompt for overview', async () => {
    const mockStream = {
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'This is a CLI tool for' };
        yield { type: 'text-delta', text: ' generating wiki docs.' };
      })(),
    };
    mockStreamText.mockReturnValue(mockStream as any);

    const onChunk = vi.fn();
    const generator = new WikiPageGenerator('gpt-4o-mini');
    const ctx: OverviewContext = {
      projectType: 'cli',
      hasTypeScript: true,
      fileCount: 42,
      productionFileCount: 35,
      testFileCount: 7,
      techStack: ['commander'],
      sourceDirs: ['src'],
      entryFiles: [],
      topSymbols: [],
    };

    const result = await generator.generateOverview(ctx, onChunk);

    expect(streamText).toHaveBeenCalledOnce();
    const callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('cli');
    expect(callArgs.prompt).toContain('commander');
    expect(callArgs.prompt).toContain('"productionFileCount": 35');
    expect(callArgs.prompt).toContain('"testFileCount": 7');
    expect(onChunk).toHaveBeenCalled();
    expect(result).toContain('This is a CLI tool for');
    expect(result).toContain('generating wiki docs.');
  });

  it('should construct prompt with architecture context', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'The project uses a layered architecture.' };
      })(),
    })) as any);

    const generator = new WikiPageGenerator('gpt-4o-mini');
    const ctx: ArchitectureContext = {
      modules: [{
        name: 'services',
        files: ['src/services'],
        symbols: [{
          name: 'IndexService',
          type: 'class' as SymbolType,
          file: 'src/services/index.ts',
          startLine: 12,
        }],
        outgoingRelations: [],
        incomingRelations: [],
        codeSnippets: [],
        fileCount: 7,
      }],
      interModuleRelations: [],
    };

    await generator.generateArchitecture(ctx, vi.fn());

    // 分节生成：首节为整体思路+架构图（模块轻量清单），符号进详解节
    const prompts = mockStreamText.mock.calls.map(c => (c[0] as any).prompt as string);
    expect(prompts.length).toBe(3);
    expect(prompts[0]).toContain('services');
    expect(prompts[0]).toContain('"fileCount": 7');
    expect(prompts.join('\n')).toContain('IndexService');
    expect(prompts.join('\n')).toContain('src/services/index.ts:12');
  });

  it('should preserve module symbol file anchors and real file counts in modules prompt', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '# Modules' };
      })(),
    })) as any);

    const generator = new WikiPageGenerator('gpt-4o-mini');
    const symbols = Array.from({ length: 10 }, (_, i) => ({
      name: `moduleSymbol${i}`,
      type: 'function' as SymbolType,
      file: `src/knowledge/module-${i}.ts`,
      startLine: i + 1,
    }));
    const ctx: ModulesContext = {
      modules: [{
        name: 'knowledge',
        files: ['src/knowledge/representative.ts'],
        fileCount: 18,
        symbols,
        fileSymbols: [{
          file: 'src/knowledge/wiki-context-builder.ts',
          symbols: [{
            name: 'buildArchitectureContext',
            type: 'method' as SymbolType,
            file: 'src/knowledge/wiki-context-builder.ts',
            startLine: 350,
          }],
        }],
        outgoingRelations: [],
        incomingRelations: [],
        codeSnippets: [],
      }],
    };

    await generator.generateModules(ctx, vi.fn());
    const prompts = mockStreamText.mock.calls.map(c => (c[0] as any).prompt as string);
    expect(prompts.join('\n')).toContain('"fileCount": 18');
    expect(prompts.join('\n')).toContain('src/knowledge/wiki-context-builder.ts:350');
    for (let i = 0; i < 10; i++) {
      expect(prompts.join('\n')).toContain(`moduleSymbol${i}`);
    }
  });

  it('should return empty string when model is not configured', async () => {
    const generator = new WikiPageGenerator();
    const ctx: OverviewContext = {
      projectType: 'cli',
      hasTypeScript: true,
      fileCount: 1,
      techStack: [],
      sourceDirs: [],
      entryFiles: [],
      topSymbols: [],
    };

    const result = await generator.generateOverview(ctx, vi.fn());
    expect(result).toBe('');
    expect(streamText).not.toHaveBeenCalled();
  });

  it('generateByName 派发 environment/tech-stack/conventions/cli（LLM 路径补齐）', async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '# Page' };
      })(),
    } as any);

    const generator = new WikiPageGenerator('gpt-4o-mini');

    await generator.generateByName('environment', {
      packageName: 'p', version: '1.0.0', runtime: 'ESM', nodeVersion: '20',
      packageManager: 'bun', scripts: { test: 'bun test' }, envVars: [{
        name: 'API_KEY',
        sensitive: true,
        filePaths: ['src/index.ts'],
      }],
    }, vi.fn());
    expect(streamText).toHaveBeenCalledOnce();
    let callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('"bun"');
    expect(callArgs.prompt).toContain('bun test');
    expect(callArgs.prompt).toContain('src/index.ts');
    expect(callArgs.system).toContain('生产引用');
    mockStreamText.mockClear();

    await generator.generateByName('tech-stack', {
      coreDeps: [{ name: 'vue', version: '3', importFiles: ['src/main.ts'] }],
      devDeps: [],
      testDeps: [{ name: 'vitest', version: '4', importFiles: ['tests/a.test.ts'], usageKind: 'test' }],
      unusedDeps: [{ name: 'left-pad', version: '1' }],
      runtime: 'ESM', buildTool: 'vite', packageManager: 'bun',
    }, vi.fn());
    expect(streamText).toHaveBeenCalledOnce();
    callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('left-pad');
    expect(callArgs.prompt).toContain('tests/a.test.ts');
    expect(callArgs.system).toContain('测试专用依赖');
    expect(callArgs.system).toContain('人工复核');
    mockStreamText.mockClear();

    await generator.generateByName('conventions', {
      hasLinter: true, linterConfig: 'scripts.lint: oxlint',
      hasEditorConfig: false, editorConfig: null,
      agentsMd: '## 命名\n使用 kebab-case',
    }, vi.fn());
    expect(streamText).toHaveBeenCalledOnce();
    callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('oxlint');
    expect(callArgs.prompt).toContain('kebab-case');
    mockStreamText.mockClear();

    await generator.generateByName('cli', {
      commands: [{ name: 'build', description: '构建', filePath: 'src/cli/build.ts', startLine: 10, options: [] }],
      exitCodes: [{ code: 1, context: 'process.exit(1)', filePath: 'src/cli/build.ts' }],
    }, vi.fn());
    expect(streamText).toHaveBeenCalledOnce();
    callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('src/cli/build.ts');

    // decisions 已复活（git + 文档证据锚定）：派发 LLM，空 ctx 防御性降级为空表
    mockStreamText.mockClear();
    await generator.generateByName('decisions', {}, vi.fn());
    expect(streamText).toHaveBeenCalledOnce();
    callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.system).toContain('每条决策必须携带证据锚点');
    expect(callArgs.system).toContain('R7');
  });

  it('generateByName 派发 testing 并注入探测事实', async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '# Testing' };
      })(),
    } as any);

    const generator = new WikiPageGenerator('gpt-4o-mini');
    await generator.generateByName('testing', {
      framework: 'vitest', configPath: 'vitest.config.ts',
      testDirs: ['tests'], fixturesDir: null, runCommand: 'pnpm test',
      productionFileCount: 35,
      testFileCount: 7,
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
    }, vi.fn());

    const callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('vitest');
    expect(callArgs.prompt).toContain('pnpm test');
    expect(callArgs.prompt).toContain('"productionFileCount": 35');
    expect(callArgs.prompt).toContain('TEST_WIKI_KEY');
    expect(callArgs.prompt).toContain('tests/config.test.ts:3');
    expect(callArgs.system).toContain('测试专用证据');
  });

  it('generateByName 派发 constraints 并注入限制数据', async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '# Constraints' };
      })(),
    } as any);

    const generator = new WikiPageGenerator('gpt-4o-mini');
    await generator.generateByName('constraints', {
      constants: [{ name: 'MAX_ROWS', value: '100', filePath: 'src/core/db.ts' }],
      hotFunctions: [{ name: 'buildWiki', filePath: 'src/services/wiki-service.ts', complexity: 9, loopDepth: 2 }],
    }, vi.fn());

    const callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('MAX_ROWS');
    expect(callArgs.prompt).toContain('buildWiki');
    expect(callArgs.system).toContain('R6');
  });

  it('generateByName 派发主题页并注入主题数据', async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '# 质量闸门' };
      })(),
    } as any);

    const generator = new WikiPageGenerator('gpt-4o-mini');
    const result = await generator.generateByName('topic:t1', {
      id: 't1',
      title: '质量闸门',
      files: ['src/knowledge/wiki-quality-validator.ts'],
      symbols: [{ name: 'validatePageContent', type: 'function', file: 'src/knowledge/wiki-quality-validator.ts', startLine: 65, docstring: '质量闸门' }],
      edges: [{ caller: 'buildWiki', callee: 'validatePageContent', file: 'src/knowledge/wiki-quality-validator.ts', line: 85 }],
      boundaries: [],
    }, vi.fn());

    const callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('质量闸门');
    expect(callArgs.prompt).toContain('wiki-quality-validator.ts:65');
    expect(callArgs.system).toContain('跨模块协作面');
    expect(result).toBe('# 质量闸门');
  });

  it('data-flow prompt 注入 stages/transitions/ioEvents/typeDefinitions 与禁止编造规则', async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '## 核心数据流概览' };
      })(),
    } as any);

    const generator = new WikiPageGenerator('gpt-4o-mini');
    await generator.generateByName('data-flow', {
      sequences: [{
        name: 'main',
        entrySymbol: 'main',
        participants: [{ name: 'main', type: 'function' as SymbolType, filePath: 'src/index.ts' }],
        messages: [],
      }],
      stages: [{
        id: 'readConfig@src/config.ts',
        name: 'readConfig',
        role: 'io-boundary' as const,
        symbol: 'readConfig',
        file: 'src/config.ts',
        line: 3,
        inputs: [{ expression: 'configPath', type: 'string', evidence: 'call-argument' as const, anchor: 'src/index.ts:10' }],
        outputs: [{ type: 'Config', evidence: 'graph-signature' as const, anchor: 'src/config.ts:3' }],
        evidenceKinds: ['signature', 'call-argument'] as const,
        dataShapeKnown: true,
      }],
      transitions: [{
        from: 'main',
        to: 'readConfig',
        callFile: 'src/index.ts',
        callLine: 10,
        args: [{ expression: 'configPath', evidence: 'call-argument' as const }],
        calleeDefinition: 'src/config.ts:3',
        confidence: 0.6,
      }],
      ioEvents: [{
        kind: 'fs-read' as const,
        symbol: 'readConfig',
        file: 'src/config.ts',
        line: 4,
        expression: "readFileSync(configPath, 'utf-8')",
        medium: 'configPath',
        direction: 'input' as const,
      }],
      typeDefinitions: [{
        name: 'Config',
        kind: 'interface' as const,
        file: 'src/config.ts',
        line: 1,
        text: 'export interface Config { name: string }',
      }],
      shapeCoverage: {
        symbolsConsidered: 2, stages: 1, transitions: 1, dataBearingTransitions: 1,
        controlOnlyTransitions: 0, ioEvents: 1, typedStages: 1, unknownStages: 0,
        typeDefinitions: 1, approximatedBodies: 0,
      },
    }, vi.fn());

    const callArgs = mockStreamText.mock.calls[0][0] as any;
    const prompt = callArgs.prompt as string;
    // 结构化输入
    expect(prompt).toContain('"stages"');
    expect(prompt).toContain('"transitions"');
    expect(prompt).toContain('"ioEvents"');
    expect(prompt).toContain('"typeDefinitions"');
    expect(prompt).toContain('"shapeCoverage"');
    // 调用点与定义点两套锚点都要给
    expect(prompt).toContain('src/index.ts:10');
    expect(prompt).toContain('src/config.ts:3');
    // 实参表达式与置信度
    expect(prompt).toContain('configPath');
    expect(prompt).toContain('"confidence": 0.6');
    // 固定章节与禁止事项
    expect(callArgs.system).toContain('## 数据阶段表');
    expect(callArgs.system).toContain('| 阶段 | 输入形态 | 输出形态 | 转换依据 | 证据 |');
    expect(callArgs.system).toContain('| From | To | 调用实参 | 调用点 | To 定义 |');
    expect(callArgs.system).toContain('禁止根据函数名编造 schema');
    expect(callArgs.system).toContain('禁止把调用链当数据转换');
    expect(callArgs.system).toContain('完整控制流与调用可达性见 calls.md');
    // 不再要求从调用链推导阶段
    expect(callArgs.system).not.toContain('从 sequences 数据推导出阶段');
  });
});
