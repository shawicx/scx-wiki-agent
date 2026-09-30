import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WikiPageGenerator } from '../../../src/knowledge/wiki-page-generator.js';

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

  it('thinking-only 响应：reasoning 不作为正文，重试后恢复', async () => {
    // 首轮只有 reasoning-delta（思考模型关闭思考失败），重试轮输出正文
    mockStreamText
      .mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', text: '我需要先分析数据结构……也许应该……' };
        })(),
      } as any)
      .mockReturnValueOnce({
        fullStream: (async function* () {
          yield { type: 'text-delta', text: '# 概述\n\n正文内容。' };
        })(),
      } as any);

    const notices: any[] = [];
    const generator = new WikiPageGenerator('qwen3', undefined, undefined, n => notices.push(n));
    const result = await generator.plan('sys', 'user');

    expect(streamText).toHaveBeenCalledTimes(2);
    // 重试轮注入显式"只输出最终 Markdown"指令
    const retryArgs = mockStreamText.mock.calls[1][0] as any;
    expect(retryArgs.system).toContain('思考通道');
    expect(retryArgs.system).toContain('最终 Markdown 正文');
    // reasoning 未混入结果
    expect(result).toBe('# 概述\n\n正文内容。');
    expect(result).not.toContain('我需要先分析');
    expect(notices).toContainEqual({ kind: 'thinking-only', recovered: true });
  });

  it('thinking-only 响应：重试仍失败则返回空串（交由降级路径）', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield { type: 'reasoning-delta', text: '内部草稿……' };
      })(),
    })) as any);

    const notices: any[] = [];
    const generator = new WikiPageGenerator('qwen3', undefined, undefined, n => notices.push(n));
    const result = await generator.plan('sys', 'user');

    expect(streamText).toHaveBeenCalledTimes(2);
    expect(result).toBe('');
    expect(result).not.toContain('内部草稿');
    expect(notices).toContainEqual({ kind: 'thinking-only', recovered: false });
  });

  it('正文非空时忽略 reasoning，行为不变（回归保护）', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield { type: 'reasoning-delta', text: '思考过程' };
        yield { type: 'text-delta', text: '# 正文' };
      })(),
    })) as any);

    const notices: any[] = [];
    const generator = new WikiPageGenerator('qwen3', undefined, undefined, n => notices.push(n));
    const result = await generator.plan('sys', 'user');

    expect(streamText).toHaveBeenCalledOnce();
    expect(result).toBe('# 正文');
    expect(notices).toHaveLength(0);
  });
});
