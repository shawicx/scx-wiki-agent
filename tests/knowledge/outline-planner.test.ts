import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ chat: () => ({}) }),
}));

import { streamText } from 'ai';
import type { QueryResult } from '../../src/mcp/types.js';
import type { ScanResult } from '../../src/core/scanner.js';
import { createMockClient } from '../helpers/mock-mcp-client.js';
import { OutlinePlanner } from '../../src/knowledge/outline-planner.js';
import { WikiPageGenerator } from '../../src/knowledge/wiki-page-generator.js';

const mockStreamText = vi.mocked(streamText);

const outlineJson = JSON.stringify({
  chapters: [{
    id: 'terminal-rendering', title: '终端渲染', summary: '渲染子系统',
    pages: [{ id: 'xterm', title: 'xterm.js 集成', brief: '简报。', files: ['src/services/x.ts'] }],
  }],
});

const symCypher = `MATCH (n) WHERE n.is_test = false AND n.docstring IS NOT NULL AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.file_path AS file, n.docstring AS doc, n.complexity AS cx
       ORDER BY n.complexity DESC LIMIT 60`;

function makeScanResult(): ScanResult {
  return {
    rootDir: '/tmp/test-project',
    files: ['src/services/x.ts', 'src/services/y.ts', 'src/core/z.ts'].map(f => ({
      absolutePath: `/tmp/test-project/${f}`, relativePath: f,
      language: 'typescript' as const, extension: '.ts', size: 100,
    })),
    techStack: ['typescript'],
    projectType: 'cli',
    hasTypeScript: true,
    sourceDirs: ['src'],
  };
}

function plannerWith(queryResults?: Map<string, QueryResult>): OutlinePlanner {
  const client = createMockClient(queryResults ? { queryResults } : {});
  return new OutlinePlanner(client as any, makeScanResult());
}

describe('OutlinePlanner', () => {
  beforeEach(() => vi.clearAllMocks());

  it('提议产物带 outline-planner 标记；输入含固定页/现有 topics/候选文件防重复', async () => {
    mockStreamText.mockImplementationOnce((() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: outlineJson };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key');
    const result = await plannerWith(new Map([
      [symCypher, {
        columns: ['name', 'file', 'doc', 'cx'],
        rows: [['buildWiki', 'src/services/wiki-service.ts', '构建入口', 9]],
        total: 1,
      }],
    ])).plan(generator, [{ id: 't1', title: '质量闸门', files: ['src/services/x.ts'] }]);

    expect(result).not.toBeNull();
    expect(result!.generator).toBe('outline-planner');
    expect(result!.chapters[0].id).toBe('terminal-rendering');

    const callArgs = mockStreamText.mock.calls[0][0] as any;
    // 固定页清单（防复述）与 topics（防重复立题）进入规划输入
    expect(callArgs.prompt).toContain('fixedPages');
    expect(callArgs.prompt).toContain('modules');
    expect(callArgs.prompt).toContain('质量闸门');
    // 候选锚点池含真实扫描文件
    expect(callArgs.prompt).toContain('candidateFiles');
    expect(callArgs.prompt).toContain('src/services/x.ts');
    expect(callArgs.system).toContain('kebab-case');
  });

  it('围栏包裹的 JSON 可解析；反馈原因进入重试输入', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '```json\n' + outlineJson + '\n```' };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key');
    const planner = plannerWith();

    const first = await planner.plan(generator, []);
    expect(first).not.toBeNull();

    const second = await planner.plan(generator, [], 'terminal-rendering/xterm：有效锚点文件 0 个，不足 3');
    const lastArgs = mockStreamText.mock.calls.at(-1)![0] as any;
    expect(lastArgs.prompt).toContain('校验剔除反馈');
    expect(lastArgs.prompt).toContain('不足 3');
    expect(second).not.toBeNull();
  });

  it('LLM 输出不可解析返回 null（不抛）', async () => {
    mockStreamText.mockImplementationOnce((() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '好的，以下是我的规划建议：\n首先……' };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key');
    expect(await plannerWith().plan(generator, [])).toBeNull();
  });
});
