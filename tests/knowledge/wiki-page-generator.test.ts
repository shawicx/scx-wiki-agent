import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiPageGenerator } from '../../src/knowledge/wiki-page-generator.js';
import type { OverviewContext, ArchitectureContext } from '../../src/knowledge/types.js';
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
        symbols: [{ name: 'IndexService', type: 'class' as SymbolType }],
        outgoingRelations: [],
        incomingRelations: [],
        codeSnippets: [],
      }],
      interModuleRelations: [],
    };

    await generator.generateArchitecture(ctx, vi.fn());

    // 分节生成：首节为整体思路+架构图（模块轻量清单），符号进详解节
    const prompts = mockStreamText.mock.calls.map(c => (c[0] as any).prompt as string);
    expect(prompts.length).toBe(3);
    expect(prompts[0]).toContain('services');
    expect(prompts.join('\n')).toContain('IndexService');
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

  it('generateByName 派发 decisions 并注入 ADR 数据（LLM 路径补齐）', async () => {
    mockStreamText.mockReturnValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '# ADR' };
      })(),
    } as any);

    const generator = new WikiPageGenerator('gpt-4o-mini');
    const result = await generator.generateByName('decisions', {
      adrs: [{
        id: 'ADR-001', title: '分层', status: 'proposed',
        context: 'c', decision: 'd', consequences: 'x', files: ['src/a.ts'],
      }],
      fromMcp: false,
    }, vi.fn());

    expect(streamText).toHaveBeenCalledOnce();
    const callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('ADR-001');
    expect(callArgs.prompt).toContain('proposed');
    expect(result).toBe('# ADR');
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
    }, vi.fn());

    const callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('vitest');
    expect(callArgs.prompt).toContain('pnpm test');
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
});
