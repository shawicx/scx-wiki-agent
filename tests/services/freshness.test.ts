import { describe, it, expect } from 'vitest';
import { stampFreshness } from '../../src/services/wiki/freshness.js';
import type { ProducedEntry } from '../../src/services/wiki/types.js';

const entry = (content: string): ProducedEntry => ({
  page: 'readme', relPath: 'README.md', source: 'llm', content, evidenceFiles: [],
}) as never as ProducedEntry;

describe('H6：README 时效戳（幂等注入/替换）', () => {
  it('无戳时插在一级标题后；携带 commit 短哈希与日期', () => {
    const e = entry('# 项目 Wiki\n\n## 索引\n\n内容');
    stampFreshness([e], 'abc1234def5678');
    expect(e.content).toMatch(/^# 项目 Wiki\n\n> 本 Wiki 基于 commit `abc1234d`（\d{4}-\d{2}-\d{2}）生成/u);
    expect(e.content).toContain('## 索引');
  });

  it('已有戳行时幂等替换（不重复插入）', () => {
    const e = entry('# 项目 Wiki\n\n> 本 Wiki 基于 commit `old0000`（2026-01-01）生成；旧文案。');
    stampFreshness([e], 'new12345');
    const stamps = e.content.split('\n').filter(l => l.startsWith('> 本 Wiki 基于 commit'));
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toContain('`new12345`');
  });

  it('同 HEAD 同日重建内容不变（update 模式可跳过重写）；无 git 标注；非 readme 页不动', () => {
    const a = entry('# 项目 Wiki\n');
    stampFreshness([a], 'abc1234');
    const frozen = a.content;
    stampFreshness([a], 'abc1234');
    expect(a.content).toBe(frozen);

    const noGit = entry('# 项目 Wiki\n');
    stampFreshness([noGit], null);
    expect(noGit.content).toContain('（无 git）');

    const other = { page: 'overview', relPath: '01-overview/overview.md', source: 'llm', content: '# x', evidenceFiles: [] } as never as ProducedEntry;
    stampFreshness([other], 'abc1234');
    expect(other.content).toBe('# x');
  });
});
