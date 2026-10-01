import { describe, it, expect } from 'vitest';
import { detectScopeOverlap } from '../../../src/knowledge/crosspage/scope.js';
import { detectDepConsistency, detectTermInconsistency } from '../../../src/knowledge/crosspage/consistency.js';
import { collectFingerprints } from '../../../src/knowledge/crosspage/collector.js';
import { applyCrossPageActions, demoteDataFlow, foldIntentTables } from '../../../src/knowledge/crosspage/actions.js';
import { crosspageReview } from '../../../src/knowledge/crosspage/index.js';
import type { DataFlowContext, TechStackContext, OverviewContext } from '../../../src/knowledge/types.js';

describe('crosspage scope', () => {
  it('他页出现 calls 专属表头 → page-scope-overlap warn', () => {
    const fps = collectFingerprints([
      { page: 'calls', content: '| 调用方 | 被调方 |\n| --- | --- |\n| `a` | `b` |' },
      { page: 'onboarding', content: '## 调用一览\n\n| 调用方 | 被调方 | 源文件:行号 |\n| --- | --- | --- |\n| `a` | `b` | f:1 |' },
    ]);
    const issues = detectScopeOverlap(fps);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('page-scope-overlap');
    expect(issues[0].pages).toEqual(['onboarding', 'calls']);
  });

  it('owner 页自身与无关表头不告警', () => {
    const fps = collectFingerprints([
      { page: 'calls', content: '| 调用方 | 被调方 |\n| --- | --- |\n| `a` | `b` |' },
      { page: 'overview', content: '| 项 | 值 |\n| --- | --- |\n| a | b |' },
    ]);
    expect(detectScopeOverlap(fps)).toHaveLength(0);
  });
});

describe('crosspage consistency', () => {
  it('术语仅大小写差异 → term-inconsistency', () => {
    const fps = collectFingerprints([
      { page: 'glossary', content: '定义 `fetchData` 与 `parseArgs`。' },
      { page: 'modules', content: '模块内 `FetchData` 完成拉取。' },
    ]);
    const issues = detectTermInconsistency(fps);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('`FetchData`');
    expect(issues[0].message).toContain('`fetchData`');
  });

  it('完全不同的术语不告警；glossary 缺席跳过', () => {
    expect(detectTermInconsistency(collectFingerprints([{ page: 'modules', content: '`foo`' }]))).toHaveLength(0);
  });

  it('overview 与 tech-stack 依赖归类矛盾 → dep-consistency', () => {
    const overview = {
      depUsage: [{ name: 'express', importFiles: ['src/a.ts'], importCount: 1, usageKind: 'import' }],
    } as unknown as OverviewContext;
    const techStack = {
      coreDeps: [],
      devDeps: [],
      testDeps: [{ name: 'express', version: '4', importFiles: [], usageKind: 'test' as const }],
      unusedDeps: [],
    } as unknown as TechStackContext;
    const contexts = new Map<string, unknown>([
      ['overview', overview],
      ['tech-stack', techStack],
    ]);
    const issues = detectDepConsistency(contexts);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('dep-consistency');
  });

  it('归类一致不告警；context 缺失 fail-open', () => {
    const overview = {
      depUsage: [{ name: 'express', importFiles: ['src/a.ts'], importCount: 1, usageKind: 'import' }],
    } as unknown as OverviewContext;
    const techStack = {
      coreDeps: [{ name: 'express', version: '4', importFiles: ['src/a.ts'], usageKind: 'import' as const }],
      devDeps: [], testDeps: [], unusedDeps: [],
    } as unknown as TechStackContext;
    const contexts = new Map<string, unknown>([
      ['overview', overview],
      ['tech-stack', techStack],
    ]);
    expect(detectDepConsistency(contexts)).toHaveLength(0);
    expect(detectDepConsistency(new Map())).toHaveLength(0);
  });
});

describe('crosspage actions', () => {
  it('demoteDataFlow 产出摘要 + calls.md 链接（带 ctx 统计）', () => {
    const ctx = {
      shapeCoverage: { stages: 3, transitions: 5, dataBearingTransitions: 4, controlOnlyTransitions: 1, ioEvents: 2, typedStages: 2, unknownStages: 1, typeDefinitions: 1, symbolsConsidered: 10, approximatedBodies: 0 },
      stages: [{ symbol: 'main', role: 'entry', file: 'src/a.ts', line: 1 }],
      ioEvents: [{ kind: 'fs-read', symbol: 'main', file: 'src/a.ts', line: 2 }],
    } as unknown as DataFlowContext;
    const out = demoteDataFlow('# 数据流\n旧正文', ctx);
    expect(out).toContain('[calls.md](calls.md)');
    expect(out).toContain('数据阶段：3 个');
    expect(out).toContain('`main`');
    expect(out).not.toContain('旧正文');
  });

  it('foldIntentTables 折叠重合表、保留低重合表', () => {
    const table = (rows: string[]) => [
      '| 证据 | 类型 | 目标 | 锚点 |',
      '| --- | --- | --- | --- |',
      ...rows,
    ].join('\n');
    const content = [
      '# Modules',
      '',
      '## 模块 A',
      '',
      table(['| 首次提交 | git-commit | a | src/a.ts:1 |']),
      '',
      '## 模块 B',
      '',
      table(['| 头注释 | file-header | b | src/only-modules.ts:9 |']),
    ].join('\n');
    const keep = new Set(['src/a.ts:1', 'src/a.ts:2', 'src/a.ts:3']);
    const out = foldIntentTables(content, keep);
    expect(out).toContain('architecture.md');
    expect(out).not.toContain('src/a.ts:1 |');
    expect(out).toContain('src/only-modules.ts:9 |'); // 模块特有证据保留
  });

  it('applyCrossPageActions 按 page 匹配动作，无匹配原样返回', () => {
    const actions = [{ kind: 'demote-data-flow', page: 'data-flow' }] as const;
    expect(applyCrossPageActions('# 其他页', null, 'overview', actions)).toBe('# 其他页');
    expect(applyCrossPageActions('# 数据流', null, 'data-flow', actions)).toContain('calls.md');
  });
});

describe('crosspageReview 编排', () => {
  it('产出报告 + 跨页 Related 链接（互补页 + 亲和度，零死链）', () => {
    const edgeTable = '| 调用方 | 被调方 |\n| --- | --- |\n| `a` | `b` |';
    const { report, crossLinks } = crosspageReview({
      pages: [
        { page: 'calls', content: edgeTable, evidenceFiles: ['src/a.ts'] },
        { page: 'data-flow', content: edgeTable, evidenceFiles: ['src/a.ts'] },
        { page: 'overview', content: '`a` 与 `b`', evidenceFiles: ['src/a.ts'] },
      ],
      plannedPages: ['calls', 'data-flow', 'overview'],
    });
    expect(report.actions).toContainEqual({ kind: 'demote-data-flow', page: 'data-flow' });
    const callsLinks = crossLinks.get('calls')!;
    expect(callsLinks.map(l => l.target)).toContain('data-flow'); // 互补职责
    expect(callsLinks.map(l => l.target)).not.toContain('calls');
    // 未列入计划的页面不出现（零死链）
    for (const links of crossLinks.values()) {
      for (const l of links) expect(['calls', 'data-flow', 'overview']).toContain(l.target);
    }
  });
});
