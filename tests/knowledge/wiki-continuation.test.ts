import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ chat: () => ({}) }),
}));

import { streamText } from 'ai';
import { findSafeCut, isAbnormalFinish, MIN_CONTINUATION_KEEP } from '../../src/knowledge/wiki-continuation.js';
import { WikiPageGenerator } from '../../src/knowledge/wiki-page-generator.js';
import type { PageGenNotice } from '../../src/knowledge/wiki-page-generator.js';

const mockStreamText = vi.mocked(streamText);

const LONG = '这是一段足够长的正文内容，用于越过最低保留长度阈值。'.repeat(10);

interface FakePart {
  type: string;
  text?: string;
}

function streamResult(parts: FakePart[], finish: string, opts?: { throwAfterParts?: boolean }) {
  return {
    fullStream: (async function* () {
      for (const p of parts) yield p;
      if (opts?.throwAfterParts) throw new Error('simulated stream failure');
    })(),
    finishReason: Promise.resolve(finish),
  };
}

const textPart = (text: string): FakePart => ({ type: 'text-delta', text });
const reasoningPart = (text: string): FakePart => ({ type: 'reasoning-delta', text });

describe('isAbnormalFinish', () => {
  it('length 与 error 视为异常终止，stop/undefined 不算', () => {
    expect(isAbnormalFinish('length')).toBe(true);
    expect(isAbnormalFinish('error')).toBe(true);
    expect(isAbnormalFinish('stop')).toBe(false);
    expect(isAbnormalFinish(undefined)).toBe(false);
  });
});

describe('findSafeCut', () => {
  it('末尾悬在未闭合代码块内：切到开栏前的空行，残块被丢弃', () => {
    const text = `# 页面\n\n${LONG}\n\n\`\`\`ts\nconst half =`;
    const cut = findSafeCut(text);
    expect(cut).not.toBeNull();
    expect(cut!.kept).toContain(LONG);
    expect(cut!.kept).not.toContain('```ts');
    expect(cut!.kept).not.toContain('const half');
  });

  it('末尾是表格且最后一行残缺：保留到最后一个以 | 结尾的完整行', () => {
    const text = `# 数据流\n\n${LONG}\n\n| 阶段 | 关键函数 |\n|---|---|\n| 扫描 | scan() |\n| 构建 | buil`;
    const cut = findSafeCut(text);
    expect(cut).not.toBeNull();
    expect(cut!.kept).toContain('| 扫描 | scan() |');
    expect(cut!.kept).not.toContain('| 构建 | buil');
  });

  it('表格全部为残行（仅残缺表头，无尾竖线）：放弃表格，回退空行切点', () => {
    const text = `# 页面\n\n${LONG}\n\n| 名称`;
    const cut = findSafeCut(text);
    expect(cut).not.toBeNull();
    expect(cut!.kept).not.toContain('| 名称');
  });

  it('末尾段落截断：切到最后一个围栏外空行，保留完整小节标题', () => {
    const text = `# 页面\n\n${LONG}\n\n## 第二节\n\n半截句子`;
    const cut = findSafeCut(text);
    expect(cut).not.toBeNull();
    expect(cut!.kept).toContain('## 第二节');
    expect(cut!.kept).not.toContain('半截句子');
  });

  it('围栏内的空行不作为切点', () => {
    const text = `# 页面\n\n${LONG}\n\n\`\`\`ts\n\ncode continues`;
    const cut = findSafeCut(text);
    expect(cut).not.toBeNull();
    expect(cut!.kept).not.toContain('```ts');
  });

  it('无安全切点（连续段落无空行）返回 null', () => {
    const text = LONG.replace(/。/g, '');
    expect(findSafeCut(text)).toBeNull();
  });

  it('安全前缀低于最低保留长度时返回 null', () => {
    expect(findSafeCut('# 标题\n\n短')).toBeNull();
    expect(findSafeCut('# 标题\n\n' + 'x'.repeat(50) + '\n\n残')).toBeNull();
  });
});

describe('WikiPageGenerator 断流续写', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finishReason=length 时发起续写并拼接：丢弃残段、剥除续写段寒暄', async () => {
    const prefix = `# 测试\n\n${LONG}\n\n## 第二节\n\n半截`;
    const segment = '好的，继续。\n\n## 第三节\n\n续写内容。';
    mockStreamText
      .mockReturnValueOnce(streamResult([textPart(prefix)], 'length') as any)
      .mockReturnValueOnce(streamResult([textPart(segment)], 'stop') as any);

    const notices: PageGenNotice[] = [];
    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key', n => notices.push(n));
    const result = await generator.generateByName('testing', {
      framework: 'vitest', configPath: 'vitest.config.ts',
      testDirs: ['tests'], fixturesDir: null, runCommand: 'pnpm test',
    }, vi.fn());

    expect(mockStreamText).toHaveBeenCalledTimes(2);
    expect(result).toContain('## 第三节');
    expect(result).toContain('续写内容。');
    expect(result).not.toContain('半截');
    expect(result).not.toContain('好的，继续');

    const second = mockStreamText.mock.calls[1][0] as any;
    expect(second.prompt).toBeUndefined();
    expect(second.messages).toHaveLength(3);
    expect(second.messages[0].role).toBe('user');
    expect(second.messages[1].role).toBe('assistant');
    expect(second.messages[1].content).toContain('## 第二节');
    expect(second.messages[1].content).not.toContain('半截');
    expect(second.messages[2].role).toBe('user');
    expect(second.messages[2].content).toContain('R1');

    expect(notices).toEqual([{ kind: 'continuation', rounds: 1, truncated: false }]);
  });

  it('finishReason=error 同样触发续写', async () => {
    const prefix = `# 测试\n\n${LONG}\n\n残`;
    mockStreamText
      .mockReturnValueOnce(streamResult([textPart(prefix)], 'error') as any)
      .mockReturnValueOnce(streamResult([textPart('## 续\n\n完整内容。')], 'stop') as any);

    const notices: PageGenNotice[] = [];
    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key', n => notices.push(n));
    const result = await generator.generateByName('testing', {
      framework: 'vitest', configPath: 'vitest.config.ts',
      testDirs: ['tests'], fixturesDir: null, runCommand: 'pnpm test',
    }, vi.fn());

    expect(mockStreamText).toHaveBeenCalledTimes(2);
    expect(result).toContain('完整内容。');
    expect(notices).toEqual([{ kind: 'continuation', rounds: 1, truncated: false }]);
  });

  it('续写调用抛异常时保留原内容且不外抛', async () => {
    const prefix = `# 测试\n\n${LONG}\n\n半截`;
    mockStreamText
      .mockReturnValueOnce(streamResult([textPart(prefix)], 'length') as any)
      .mockReturnValueOnce(streamResult([textPart('x')], 'stop', { throwAfterParts: true }) as any);

    const notices: PageGenNotice[] = [];
    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key', n => notices.push(n));
    const result = await generator.generateByName('testing', {
      framework: 'vitest', configPath: 'vitest.config.ts',
      testDirs: ['tests'], fixturesDir: null, runCommand: 'pnpm test',
    }, vi.fn());

    expect(result).toBe(prefix);
    expect(notices).toEqual([]);
  });

  it('连续截断受轮数上限约束（2 轮后停止并上报仍截断）', async () => {
    const prefix = `# 测试\n\n${LONG}\n\n半截`;
    mockStreamText
      .mockReturnValueOnce(streamResult([textPart(prefix)], 'length') as any)
      .mockReturnValueOnce(streamResult([textPart(`# 测试\n\n${LONG}\n\n又半截`)], 'length') as any)
      .mockReturnValueOnce(streamResult([textPart(`# 测试\n\n${LONG}\n\n还半截`)], 'length') as any);

    const notices: PageGenNotice[] = [];
    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key', n => notices.push(n));
    await generator.generateByName('testing', {
      framework: 'vitest', configPath: 'vitest.config.ts',
      testDirs: ['tests'], fixturesDir: null, runCommand: 'pnpm test',
    }, vi.fn());

    expect(mockStreamText).toHaveBeenCalledTimes(3);
    expect(notices).toEqual([{ kind: 'continuation', rounds: 2, truncated: true }]);
  });

  it('正常 stop 终止不触发续写', async () => {
    mockStreamText.mockReturnValueOnce(streamResult([textPart(`# 测试\n\n${LONG}`)], 'stop') as any);

    const notices: PageGenNotice[] = [];
    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key', n => notices.push(n));
    await generator.generateByName('testing', {
      framework: 'vitest', configPath: 'vitest.config.ts',
      testDirs: ['tests'], fixturesDir: null, runCommand: 'pnpm test',
    }, vi.fn());

    expect(mockStreamText).toHaveBeenCalledOnce();
    expect(notices).toEqual([]);
  });

  it('思考回退路径（text 空、reasoning 非空）不参与续写', async () => {
    mockStreamText.mockReturnValueOnce(streamResult([reasoningPart('思考内容')], 'length') as any);

    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key');
    const result = await generator.generateByName('testing', {
      framework: 'vitest', configPath: 'vitest.config.ts',
      testDirs: ['tests'], fixturesDir: null, runCommand: 'pnpm test',
    }, vi.fn());

    expect(result).toBe('思考内容');
    expect(mockStreamText).toHaveBeenCalledOnce();
  });
});
