import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WikiService } from '../../../src/services/wiki-service.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpBase, makeBackendScanResult, makeOutlineScanResult } from './helpers.js';

const tmpDir = join(tmpBase, 'llm');

vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

import { streamText } from 'ai';
const mockStreamText = vi.mocked(streamText);

describe('LLM 路径：断言校验与两阶段构建', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should annotate unverified claims on LLM pages via three-level verification', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 概览\n\n核心由 `realThing` 与 `ghostThing` 构成。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    // realThing 有词法实据（search_code 命中），ghostThing 查无实据
    const client = createMockClient({ searchCounts: new Map([['realThing', 3]]) });
    const wikiDir = join(tmpDir, 'wiki-claims');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'] });

    const overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`ghostThing`（待确认）');
    expect(overview).not.toContain('realThing`（待确认）');
    // pending marker 是会话期脚手架，写盘内容零残留（可见「待确认」文本保留）
    expect(overview).not.toContain('wiki:pending');
    expect(client.searchCodeMatches).toHaveBeenCalledWith('realThing', 20);
    expect(client.searchCodeMatches).toHaveBeenCalledWith('ghostThing', 20);
  });

  it('claim 核验按页面作用域过滤：非 testing 页不采纳测试文件证据，testing 页可采纳', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 文档\n\n测试符号 `TEST_ONLY_SYMBOL`。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient();
    client.searchCodeMatches.mockImplementation((pattern: string) =>
      pattern === 'TEST_ONLY_SYMBOL'
        ? [{ file: 'tests/config.test.ts', line: 1 }]
        : []);
    client.queryGraph.mockImplementation((cypher: string) =>
      cypher.includes('RETURN n.name AS name, n.file_path AS file')
        ? {
            columns: ['name', 'file'],
            rows: [['TEST_ONLY_SYMBOL', '/tmp/test-project/tests/config.test.ts']],
            total: 1,
          }
        : { columns: [], rows: [], total: 0 });

    const scan = makeBackendScanResult();
    scan.files.push({
      absolutePath: '/tmp/test-project/tests/config.test.ts',
      relativePath: 'tests/config.test.ts',
      language: 'typescript',
      extension: '.ts',
      size: 100,
      scope: 'test',
    });
    scan.testFiles = scan.files.filter(f => f.scope === 'test');
    scan.productionFiles = scan.files.filter(f => f.scope === 'production');
    scan.fileCounts = {
      total: scan.files.length,
      production: scan.productionFiles.length,
      test: scan.testFiles.length,
    };

    const service = new WikiService(client as any, scan);
    const overviewDir = join(tmpDir, 'wiki-scope-overview');
    await service.buildWiki(overviewDir, { model: 'test-model', pages: ['overview'] });
    const overview = readFileSync(join(overviewDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`TEST_ONLY_SYMBOL`（待确认）');

    const testingDir = join(tmpDir, 'wiki-scope-testing');
    await service.buildWiki(testingDir, { model: 'test-model', pages: ['testing'] });
    const testing = readFileSync(join(testingDir, '05-guides', 'testing.md'), 'utf-8');
    expect(testing).not.toContain('`TEST_ONLY_SYMBOL`（待确认）');
  });

  it('两阶段构建：confirmSession 在生成后写盘前收到聚合项，resolve 后写盘无标记并持久化白名单', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 概览\n\n核心由 `ghostThing` 构成。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient(); // searchCode 默认 0 命中 → ghostThing 查无实据
    const wikiDir = join(tmpDir, 'wiki-confirm');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });
    rmSync(join(agentDir, 'confirmations.json'), { force: true });

    const sessionCalls: number[][] = [];
    const confirmSession = vi.fn(async (items: Array<{ key: string }>) => {
      sessionCalls.push(items.map(i => i.key));
      // 全部确认为事实
      return items
        .filter(i => i.key === 'claim\nghostThing')
        .map(i => ({ key: i.key, kind: 'claim' as const, action: 'resolve' as const }));
    });

    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'], confirmSession });

    // 阶段二收到跨页聚合后的待确认项
    expect(confirmSession).toHaveBeenCalledTimes(1);
    expect(sessionCalls[0]).toContain('claim\nghostThing');

    // resolve 应用后写盘：标记已移除
    const overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`ghostThing`');
    expect(overview).not.toContain('`ghostThing`（待确认）');

    // 确认的 claim 持久化（v2 指纹条目；tmpDir 非 git 仓库 → head=''，HEAD-scoped）
    const store = JSON.parse(readFileSync(join(agentDir, 'confirmations.json'), 'utf-8'));
    expect(store.version).toBe(2);
    expect(store.entries.map((e: { raw: string }) => e.raw)).toContain('ghostThing');

    // 第二次构建：白名单免标 → 无待确认项 → 会话不再触发
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'], confirmSession });
    expect(confirmSession).toHaveBeenCalledTimes(1);
    const rebuilt = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(rebuilt).not.toContain('（待确认）');
  });

  it('两阶段构建：keep 决定保留待确认标记；未注入会话时不交互', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 概览\n\n核心由 `ghostThing` 构成。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-confirm-keep');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });
    rmSync(join(agentDir, 'confirmations.json'), { force: true });

    // 未注入 confirmSession：行为与旧版一致，直接写盘
    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'] });
    let overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`ghostThing`（待确认）');

    // 注入会话但全部 keep：标记保留
    const keepSession = vi.fn(async () => []);
    rmSync(wikiDir, { recursive: true, force: true });
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'], confirmSession: keepSession });
    expect(keepSession).toHaveBeenCalledTimes(1);
    overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`ghostThing`（待确认）');
  });

  it('章节树规划 LLM 异常不阻断构建（fail-open，按无章节页继续）', async () => {
    mockStreamText.mockImplementation((() => { throw new Error('Insufficient Balance'); }) as any);
    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-planfail');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const service = new WikiService(client as any, makeBackendScanResult());
    const generated = await service.buildWiki(wikiDir, { model: 'test-model' });

    expect(generated.length).toBeGreaterThan(0);
    expect(existsSync(join(wikiDir, '01-overview', 'overview.md'))).toBe(true);
    expect(existsSync(join(wikiDir, '09-chapters'))).toBe(false);
  });

  it('should not flag declared dependency names as unverified claims', async () => {    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 概览\n\n会话层核心依赖 `express`（多处 import），另有 `ghostThing`。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    // searchCode 全部 0 命中、图谱 universe 为空：express 仅靠 dep-name 回填免于误标
    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-dep-claims');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'] });

    const overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).not.toContain('`express`（待确认）');
    expect(overview).toContain('`ghostThing`（待确认）');
  });

  it('should auto-plan outline on first build when LLM available and lock outline.json', async () => {    // 首次自动提议：outline.json 缺失 + 模型可用 → planner 产出并锁定
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: JSON.stringify({
            chapters: [{
              id: 'terminal', title: '终端渲染', summary: '渲染子系统',
              pages: [{ id: 'xterm', title: 'xterm 集成', brief: '说明 xterm 集成方式与 resize 适配。', files: ['src/index.ts', 'src/a.ts', 'src/b.ts'] }],
            }],
          }),
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-planner');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const service = new WikiService(client as any, makeOutlineScanResult());
    const generated = await service.buildWiki(wikiDir, { model: 'test-model' });

    // 锁定文件写入（generator=outline-planner），章页进入产出清单
    const locked = JSON.parse(readFileSync(join(agentDir, 'outline.json'), 'utf-8'));
    expect(locked.generator).toBe('outline-planner');
    expect(locked.chapters[0].id).toBe('terminal');
    expect(generated).toContain('09-chapters/terminal/xterm.md');
    expect(existsSync(join(wikiDir, '09-chapters', 'terminal', 'xterm.md'))).toBe(true);
  });
});
