import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiPageGenerator } from '../../../src/knowledge/wiki-page-generator.js';
import type {
  ArchitectureContext,
  ModulesContext,
  OverviewContext,
} from '../../../src/knowledge/types.js';
import type { SymbolType } from '../../../src/core/types.js';

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
});
