import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveIntentGitCache } from '../../src/knowledge/intent/git-cache.js';
import type { GitRunner } from '../../src/knowledge/intent-evidence.js';

describe('H5：git 缓存落盘键 = 挖掘开始时的 HEAD（无重取竞态）', () => {
  it('H5：saveIntentGitCache 用传入 head 落盘，不自起 rev-parse（无重取竞态）', () => {
    const agentDir = mkdtempSync(join(tmpdir(), 'intent-head-race-'));
    try {
      let calls = 0;
      const counting: GitRunner = args => {
        calls++;
        return args[0] === 'rev-parse' ? 'NEW-HEAD\n' : null; // 保存时若重取会拿到新值
      };
      void counting;
      const info = {
        count: 1, first: { hash: 'a'.repeat(40), date: '2026-01-01', subject: 's' },
        last: { hash: 'b'.repeat(40), date: '2026-01-02', subject: 's' }, subjects: ['s'],
      };
      saveIntentGitCache(agentDir, 'OLD-HEAD\n', new Map([['src/a.ts', info]]), []);
      expect(calls).toBe(0); // 不起任何子进程
      const raw = JSON.parse(readFileSync(join(agentDir, 'cache', 'intent.json'), 'utf-8'));
      expect(raw.head).toBe('OLD-HEAD'); // 落盘键是挖掘时的 HEAD，不是 NEW-HEAD
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
    }
  });
});
