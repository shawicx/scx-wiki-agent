import { describe, it, expect } from 'vitest';
import { WikiFallbackBuilder } from '../../src/knowledge/wiki-fallback-builder.js';
import type { DecisionsContext, OverviewContext, TopicContext, ConstraintsContext } from '../../src/knowledge/types.js';

describe('WikiFallbackBuilder 意图证据渲染', () => {
  const builder = new WikiFallbackBuilder();

  it('overview 携带 intent 时输出「设计依据」证据表（带锚点列）', () => {
    const ctx: OverviewContext = {
      projectType: 'cli',
      hasTypeScript: true,
      fileCount: 3,
      techStack: ['commander'],
      sourceDirs: ['src'],
      entryFiles: [],
      topSymbols: [],
      intent: [{
        kind: 'file-header',
        target: { file: 'src/index.ts', line: 1 },
        text: 'CLI 入口：注册三个命令',
        anchor: 'src/index.ts:1',
      }],
    };
    const out = builder.buildOverview(ctx);
    expect(out).toContain('## 设计依据（意图证据）');
    expect(out).toContain('CLI 入口：注册三个命令');
    expect(out).toContain('src/index.ts:1');
    expect(out).toContain('文件头自述');
  });

  it('constraints 渲染「限制由来」常量注释证据', () => {
    const ctx: ConstraintsContext = {
      constants: [{ name: 'MAX_QPS', value: '1000', filePath: 'src/limit.ts' }],
      hotFunctions: [],
      intent: [{
        kind: 'const-comment',
        target: { file: 'src/limit.ts', line: 3, symbol: 'MAX_QPS' },
        text: '上限：接口限流',
        anchor: 'src/limit.ts:3',
      }],
    };
    const out = builder.buildConstraints(ctx);
    expect(out).toContain('## 限制由来（源码注释证据）');
    expect(out).toContain('MAX_QPS');
  });

  it('topic 渲染「设计动机」证据表；无 intent 时不输出该节', () => {
    const base: TopicContext = {
      id: 't1', title: '质量闸门', files: ['src/a.ts'], symbols: [], edges: [], boundaries: [],
    };
    const withIntent: TopicContext = {
      ...base,
      intent: [{
        kind: 'git-commit',
        target: { file: 'src/a.ts' },
        text: 'src/a.ts 首次提交：init scanner',
        anchor: 'commit:abcd1234 (2026-06-01)',
      }],
    };
    expect(builder.buildTopic(withIntent)).toContain('## 设计动机（意图证据）');
    expect(builder.buildTopic(base)).not.toContain('设计动机');
  });

  it('buildDecisions 渲染时间线/文档决策/依赖佐证/热点四节（commit 锚点保留）', () => {
    const ctx: DecisionsContext = {
      gitTimeline: [{
        module: 'knowledge',
        commitCount: 12,
        first: { hash: 'aaaa1111bbbb2222', date: '2026-06-01', subject: 'init wiki pipeline' },
        last: { hash: 'cccc3333dddd4444', date: '2026-09-01', subject: 'feat: global config' },
        themes: ['wiki pages（×4）'],
      }],
      docDecisions: [{
        kind: 'doc-section',
        target: { file: 'docs/design/adr-001.md', line: 3 },
        text: '背景：旧索引管线维护成本高',
        anchor: 'docs/design/adr-001.md#背景',
      }],
      hotFileChurn: [{ file: 'src/knowledge/wiki-service.ts', commitCount: 9, last: { hash: 'eeee5555ffff6666', date: '2026-08-15', subject: 'fix: gate' } }],
      depCommits: [{
        kind: 'git-commit',
        target: { symbol: 'yaml' },
        text: '依赖 yaml 相关提交：chore: add yaml parser',
        anchor: 'commit:1234abcd (2026-05-01)',
      }],
    };
    const out = builder.buildDecisions(ctx);

    expect(out).toContain('## 演进时间线（按模块）');
    expect(out).toContain('`aaaa1111`（2026-06-01）init wiki pipeline');
    expect(out).toContain('wiki pages（×4）');
    expect(out).toContain('## 文档记录的决策');
    expect(out).toContain('docs/design/adr-001.md#背景');
    expect(out).toContain('## 依赖引入决策（提交佐证）');
    expect(out).toContain('## 高频变更热点（维护风险）');
    expect(out).toContain('src/knowledge/wiki-service.ts');
  });

  it('buildDecisions 空 ctx 不产出空表（诚实空页）', () => {
    const out = builder.buildDecisions({ gitTimeline: [], docDecisions: [], hotFileChurn: [] });
    expect(out).not.toContain('## 演进时间线');
    expect(out).toContain('# Design Decisions & Evolution');
  });
});
