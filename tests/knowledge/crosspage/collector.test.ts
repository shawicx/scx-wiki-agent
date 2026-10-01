import { describe, it, expect } from 'vitest';
import {
  collectFingerprints,
  extractTables,
  extractTerms,
  extractIntentAnchors,
} from '../../../src/knowledge/crosspage/collector.js';
import { detectDuplication, jaccard } from '../../../src/knowledge/crosspage/duplication.js';

describe('crosspage collector', () => {
  it('extractTables 提取表头/行数/首列/小节，跳过代码围栏', () => {
    const md = [
      '# 标题',
      '',
      '```',
      '| 假 | 表 |',
      '| --- | --- |',
      '| a | b |',
      '```',
      '',
      '## 阶段转换',
      '',
      '| 调用方 | 被调方 | 源文件:行号 |',
      '| --- | --- | --- |',
      '| `main` | `init` | src/a.ts:1 |',
      '| `main` | `run` | src/a.ts:2 |',
    ].join('\n');
    const tables = extractTables(md);
    expect(tables).toHaveLength(1);
    expect(tables[0].header).toEqual(['调用方', '被调方', '源文件:行号']);
    expect(tables[0].rows).toBe(2);
    expect(tables[0].section).toBe('阶段转换');
    expect([...tables[0].firstColumn]).toEqual(['`main`']);
  });

  it('extractTerms 提取反引号标识符，跳过围栏', () => {
    const md = '正文 `fooBar` 与 `express`。\n```\n`fenced`\n```';
    const terms = extractTerms(md);
    expect(terms.has('fooBar')).toBe(true);
    expect(terms.has('express')).toBe(true);
    expect(terms.has('fenced')).toBe(false);
  });

  it('extractIntentAnchors 提取证据表锚点列与 commit: 前缀', () => {
    const md = [
      '| 证据 | 类型 | 目标 | 锚点 |',
      '| --- | --- | --- | --- |',
      '| 首次提交 | git-commit | m | commit:abc12345 (2026-01-01) |',
      '| 头注释 | file-header | m | src/a.ts:1 |',
      '',
      '正文提及 commit:deadbeef00。',
    ].join('\n');
    const anchors = extractIntentAnchors(md, []);
    // 表格两行锚点 + 正文 commit: 前缀（表格内 commit 锚点亦被前缀正则单独捕获）
    expect(anchors.size).toBe(4);
  });
});

describe('crosspage duplication', () => {
  it('jaccard：交集/并集，空集安全', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b', 'c']))).toBeCloseTo(2 / 3);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
    expect(jaccard(new Set(['a']), new Set(['a']))).toBe(1);
  });

  it('data-flow 与 calls 表格首列重合 ≥50% → demote-data-flow 动作', () => {
    const edgeTable = (rows: string[]) => [
      '| 调用方 | 被调方 | 源文件:行号 |',
      '| --- | --- | --- |',
      ...rows,
    ].join('\n');
    const fps = collectFingerprints([
      { page: 'calls', content: edgeTable(['| `a` | `b` | f:1 |', '| `c` | `d` | f:2 |']) },
      { page: 'data-flow', content: edgeTable(['| `a` | `b` | f:1 |', '| `c` | `d` | f:2 |']) },
    ]);
    const { issues, actions } = detectDuplication(fps);
    expect(actions).toEqual([{ kind: 'demote-data-flow', page: 'data-flow' }]);
    expect(issues[0].rule).toBe('table-duplication');
  });

  it('表头不同不算重合；低重合不触发动作', () => {
    const fps = collectFingerprints([
      { page: 'calls', content: '| 调用方 | 被调方 |\n| --- | --- |\n| `a` | `b` |' },
      { page: 'data-flow', content: '| 阶段 | 角色 |\n| --- | --- |\n| `a` | entry |' },
    ]);
    expect(detectDuplication(fps).actions).toHaveLength(0);
  });

  it('architecture/modules 意图证据锚点重合 ≥70% → fold-intent-tables 动作', () => {
    const intentTable = (anchors: string[]) => [
      '| 证据 | 类型 | 目标 | 锚点 |',
      '| --- | --- | --- | --- |',
      ...anchors.map(a => `| 首次提交 | git-commit | m | ${a} |`),
    ].join('\n');
    const anchors = ['src/a.ts:1', 'src/b.ts:2', 'src/c.ts:3', 'src/d.ts:4'];
    const fps = collectFingerprints([
      { page: 'architecture', content: intentTable(anchors) },
      { page: 'modules', content: intentTable([...anchors, 'src/e.ts:5']) },
    ]);
    const { actions, issues } = detectDuplication(fps);
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('fold-intent-tables');
    expect(issues[0].rule).toBe('intent-evidence-duplication');
  });
});
