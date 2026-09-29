import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  isCancel: vi.fn(() => false),
}));

import { runConfirmationSession } from '../../src/cli/confirm-interaction.js';
import type { PendingConfirmation } from '../../src/knowledge/confirmation.js';
import * as clack from '@clack/prompts';

function makeItem(overrides?: Partial<PendingConfirmation>): PendingConfirmation {
  return {
    key: 'claim\nghostThing',
    kind: 'claim',
    text: 'ghostThing',
    context: '断言 `ghostThing`（待确认）。',
    pages: ['overview'],
    occurrences: 1,
    ...overrides,
  };
}

/** vitest 环境无真实 TTY，用 defineProperty 注入可写 isTTY */
function mockTTY(value: boolean): () => void {
  const original = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  Object.defineProperty(process.stdout, 'isTTY', {
    value, configurable: true, writable: true,
  });
  return () => {
    if (original) Object.defineProperty(process.stdout, 'isTTY', original);
    else delete (process.stdout as { isTTY?: boolean }).isTTY;
  };
}

describe('runConfirmationSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('非 TTY 环境直接返回空（CI/管道安全），不启动会话', async () => {
    const restore = mockTTY(false);
    const out = await runConfirmationSession([makeItem()]);
    expect(out).toEqual([]);
    expect(clack.intro).not.toHaveBeenCalled();
    restore();
  });

  it('TTY：claim 项裁决 resolve → 返回决定；keep → 不产出决定', async () => {
    const restore = mockTTY(true);
    const select = vi.mocked(clack.select).mockResolvedValueOnce('resolve' as never);

    const out = await runConfirmationSession([makeItem()]);
    expect(out).toEqual([
      { key: 'claim\nghostThing', kind: 'claim', action: 'resolve', replacement: undefined },
    ]);
    expect(select).toHaveBeenCalledTimes(1);
    restore();
  });

  it('TTY：cell 项 resolve 后追问确认内容（必填校验走 clack validate）', async () => {
    const restore = mockTTY(true);
    vi.mocked(clack.select).mockResolvedValueOnce('resolve' as never);
    vi.mocked(clack.text).mockResolvedValueOnce('LLM provider 鉴权' as never);

    const out = await runConfirmationSession([
      makeItem({ key: 'cell\nAPI_KEY', kind: 'cell', text: 'API_KEY' }),
    ]);
    expect(out).toEqual([
      { key: 'cell\nAPI_KEY', kind: 'cell', action: 'resolve', replacement: 'LLM provider 鉴权' },
    ]);
    restore();
  });

  it('取消中断：保留已裁决项并停止（其余按保持处理）', async () => {
    const restore = mockTTY(true);
    const isCancel = vi.mocked(clack.isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.mocked(clack.select).mockResolvedValue('resolve' as never);
    vi.mocked(clack.text).mockResolvedValue('x' as never);

    const out = await runConfirmationSession([
      makeItem({ key: 'claim\nfirst' }),
      makeItem({ key: 'claim\nsecond', text: 'second' }),
      makeItem({ key: 'claim\nthird', text: 'third' }),
    ]);
    // 第 1 项正常裁决，第 2 项取消 → 中断，第 3 项不再询问
    expect(out.map(d => d.key)).toEqual(['claim\nfirst']);
    expect(clack.select).toHaveBeenCalledTimes(2);
    restore();
    isCancel.mockReset();
  });
});
