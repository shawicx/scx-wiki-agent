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
import { ConfigDetector } from '../../src/knowledge/config-detector.js';
import { WikiContextBuilder } from '../../src/knowledge/wiki-context-builder.js';
import { WikiPageGenerator } from '../../src/knowledge/wiki-page-generator.js';
import { WikiFallbackBuilder } from '../../src/knowledge/wiki-fallback-builder.js';
import type { OutlineChapter } from '../../src/knowledge/outline.js';
import {
  parseChapterPage, chapterPageName, isChapterPage,
  pageRelPath, findPageDescriptor, buildRelatedSection,
} from '../../src/knowledge/page-registry.js';

const mockStreamText = vi.mocked(streamText);

function makeScanResult(files: string[]): ScanResult {
  return {
    rootDir: '/tmp/test-project',
    files: files.map(f => ({
      absolutePath: `/tmp/test-project/${f}`, relativePath: f,
      language: 'typescript' as const, extension: '.ts', size: 100,
    })),
    techStack: ['typescript'],
    projectType: 'cli',
    hasTypeScript: true,
    sourceDirs: ['src'],
  };
}

const outlineChapters: OutlineChapter[] = [{
  id: 'terminal-rendering',
  title: '终端渲染',
  summary: '终端渲染与主题',
  pages: [
    { id: 'xterm', title: 'xterm.js 集成', brief: '解释 XtermManager 的初始化与 resize 适配。', files: ['src/a.ts', 'src/b.ts', 'src/c.ts'] },
    { id: 'theme', title: '主题系统', brief: '说明主题变量注入。', files: ['src/a.ts', 'src/b.ts', 'src/d.ts'] },
  ],
}];

describe('page-registry 章节页命名', () => {
  it('chapterPageName 与 parseChapterPage 往返；非法形态返回 null', () => {
    const name = chapterPageName('terminal-rendering', 'xterm');
    expect(name).toBe('chapter:terminal-rendering/xterm');
    expect(isChapterPage(name)).toBe(true);
    expect(parseChapterPage(name)).toEqual({ chapter: 'terminal-rendering', page: 'xterm' });
    expect(parseChapterPage('chapter:no-slash')).toBeNull();
    expect(parseChapterPage('chapter:/leading')).toBeNull();
    expect(parseChapterPage('chapter:trailing/')).toBeNull();
    expect(parseChapterPage('topic:t1')).toBeNull();
  });

  it('pageRelPath 输出到 09-chapters/<章>/<页>.md；descriptor 合成', () => {
    expect(pageRelPath('chapter:terminal-rendering/xterm')).toBe('09-chapters/terminal-rendering/xterm.md');
    const desc = findPageDescriptor('chapter:terminal-rendering/xterm');
    expect(desc?.dir).toBe('09-chapters/terminal-rendering');
    expect(desc?.tier).toBe('structure');
  });

  it('Related 区块只链接同章兄弟页（文件名标签，同目录相对链接）', () => {
    const related = buildRelatedSection(
      'chapter:terminal-rendering/xterm',
      ['chapter:terminal-rendering/xterm', 'chapter:terminal-rendering/theme', 'chapter:other/p1', 'topic:t1', 'readme'],
    );
    expect(related).toContain('[theme.md](theme.md)');
    expect(related).not.toContain('other');
    expect(related).not.toContain('t1.md');
  });
});

describe('buildChapterPageContext（章节页）', () => {
  const files = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
  const fileList = files.map(f => `"${f}"`).join(',');
  const symCypher = `MATCH (n) WHERE n.file_path IN [${fileList}] AND n.is_test = false
         AND n.docstring IS NOT NULL AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.label AS label, n.file_path AS file, n.start_line AS line,
              n.docstring AS doc, n.signature AS sig, n.complexity AS cx
       ORDER BY n.complexity DESC LIMIT 25`;
  const edgeCypher = `MATCH (a)-[:CALLS]->(b)
       WHERE a.file_path IN [${fileList}] AND b.file_path IN [${fileList}]
         AND a.is_test = false AND b.is_test = false
       RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line
       LIMIT 30`;

  it('携带章信息与简报；查询与主题页共用图谱取法；未定义页返回 null', () => {
    const queryResults = new Map<string, QueryResult>([
      [symCypher, {
        columns: ['name', 'label', 'file', 'line', 'doc', 'sig', 'cx'],
        rows: [['XtermManager', 'Class', 'src/a.ts', 12, 'xterm 集成', 'class XtermManager', 5]],
        total: 1,
      }],
      [edgeCypher, {
        columns: ['caller', 'callerFile', 'callee', 'file', 'line'],
        rows: [['XtermManager', 'src/a.ts', 'attachResize', 'src/b.ts', 40]],
        total: 1,
      }],
    ]);
    const client = createMockClient({ queryResults });
    const builder = new WikiContextBuilder(client as any, makeScanResult(['src/a.ts', 'src/b.ts', 'src/c.ts']), new ConfigDetector('/tmp/test-project'));
    builder.setOutlineChapters(outlineChapters);

    const ctx = builder.buildByName('chapter:terminal-rendering/xterm') as {
      chapterTitle: string; title: string; brief: string;
      symbols: Array<{ name: string }>; edges: unknown[];
    };
    expect(ctx.chapterTitle).toBe('终端渲染');
    expect(ctx.title).toBe('xterm.js 集成');
    expect(ctx.brief).toContain('XtermManager');
    expect(ctx.symbols.map(s => s.name)).toEqual(['XtermManager']);
    expect(ctx.edges.length).toBe(1);

    expect(builder.buildByName('chapter:terminal-rendering/missing')).toBeNull();
    expect(builder.buildByName('chapter:missing/xterm')).toBeNull();
  });
});

describe('generateChapterPage（LLM 路径）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('brief 进入 system 提示，图谱数据进入 userPrompt', async () => {
    mockStreamText.mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '# xterm.js 集成' };
      })(),
    } as any);

    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key');
    const result = await generator.generateByName('chapter:terminal-rendering/xterm', {
      chapterId: 'terminal-rendering', chapterTitle: '终端渲染', chapterSummary: '终端渲染与主题',
      pageId: 'xterm', title: 'xterm.js 集成',
      brief: '解释 XtermManager 的初始化与 resize 适配。',
      files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      symbols: [{ name: 'XtermManager', type: 'class', file: 'src/a.ts', startLine: 12, docstring: 'xterm', signature: 'class XtermManager' }],
      edges: [{ caller: 'XtermManager', callee: 'attachResize', file: 'src/a.ts', line: 40 }],
      boundaries: [],
    }, vi.fn());

    expect(streamText).toHaveBeenCalledOnce();
    const callArgs = mockStreamText.mock.calls[0][0] as any;
    expect(callArgs.system).toContain('XtermManager 的初始化');
    expect(callArgs.system).toContain('终端渲染');
    expect(callArgs.prompt).toContain('src/a.ts:12');
    expect(callArgs.prompt).toContain('终端渲染');
    expect(result).toBe('# xterm.js 集成');
  });
});

describe('buildChapterPage（规则 fallback）', () => {
  it('渲染简报、覆盖文件、符号与边表', () => {
    const fallback = new WikiFallbackBuilder();
    const out = fallback.buildByName('chapter:terminal-rendering/xterm', {
      chapterId: 'terminal-rendering', chapterTitle: '终端渲染', chapterSummary: '',
      pageId: 'xterm', title: 'xterm.js 集成',
      brief: '解释 XtermManager 的初始化。',
      files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      symbols: [{ name: 'XtermManager', type: 'class', file: 'src/a.ts', startLine: 12, docstring: 'xterm', signature: 'class XtermManager' }],
      edges: [{ caller: 'XtermManager', callee: 'attachResize', file: 'src/a.ts', line: 40 }],
      boundaries: [],
    });
    expect(out).toContain('# xterm.js 集成');
    expect(out).toContain('终端渲染');
    expect(out).toContain('XtermManager');
    expect(out).toContain('src/a.ts');
  });
});
