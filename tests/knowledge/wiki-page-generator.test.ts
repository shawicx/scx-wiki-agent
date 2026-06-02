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
      textStream: (async function* () { yield 'This is a CLI tool for'; yield ' generating wiki docs.'; })(),
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
    const mockStream = {
      textStream: (async function* () { yield 'The project uses a layered architecture.'; })(),
    };
    mockStreamText.mockReturnValue(mockStream as any);

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

    const callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.prompt).toContain('services');
    expect(callArgs.prompt).toContain('IndexService');
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
