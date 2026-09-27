import { describe, it, expect } from 'vitest';
import { validatePageContent } from '../../src/knowledge/wiki-quality-validator.js';
import type { ValidateOptions } from '../../src/knowledge/wiki-quality-validator.js';

const baseOpts: ValidateOptions = {
  page: 'overview',
  pagePath: 'overview.md',
  knownFiles: new Set(['src/index.ts', 'src/services/wiki-service.ts']),
  plannedPaths: new Set(['overview.md', 'glossary.md', 'readme.md']),
};

describe('validatePageContent', () => {
  it('空内容判定为空壳（error）', () => {
    const r = validatePageContent('', baseOpts);
    expect(r.passed).toBe(false);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ rule: 'empty-shell', severity: 'error' }),
    );
  });

  it('仅标题无正文判定为空壳（error）', () => {
    const r = validatePageContent('# Overview', baseOpts);
    expect(r.passed).toBe(false);
    expect(r.issues.some(i => i.rule === 'empty-shell')).toBe(true);
  });

  it('无标题结构判定为空壳（error）', () => {
    const r = validatePageContent('只是一段正文，没有任何标题。', baseOpts);
    expect(r.passed).toBe(false);
    expect(r.issues.some(i => i.rule === 'empty-shell')).toBe(true);
  });

  it('诚实无数据页通过（标题 + 一句说明）', () => {
    const r = validatePageContent('# Data Flow\n\nNo execution sequences traced.', baseOpts);
    expect(r.passed).toBe(true);
  });

  it('检测密钥泄漏（error），报告中不回显密钥值', () => {
    const content = '# Overview\n\n配置示例：`sk-abcdefghijklmnopqrstuvwx`';
    const r = validatePageContent(content, baseOpts);
    expect(r.passed).toBe(false);
    const secret = r.issues.find(i => i.rule === 'secret');
    expect(secret?.severity).toBe('error');
    expect(secret?.message).not.toContain('abcdefghijklmnopqrstuvwx');
  });

  it('file:0 残缺锚点产生 broken-anchor 告警（warn，不拦截）', () => {
    const content = '# Calls\n\n| 边 |\n| --- |\n| `src/index.ts:0` |';
    const r = validatePageContent(content, baseOpts);
    expect(r.passed).toBe(true);
    expect(r.issues.some(i => i.rule === 'broken-anchor' && i.message.includes(':0'))).toBe(true);
  });

  it('未知路径锚点产生告警', () => {
    const content = '# Calls\n\n见 `src/ghost.ts:12`';
    const r = validatePageContent(content, baseOpts);
    expect(r.issues.some(i => i.rule === 'broken-anchor' && i.message.includes('src/ghost.ts'))).toBe(true);
  });

  it('有效锚点计入统计且不产生告警', () => {
    const content = '# Calls\n\n见 `src/index.ts:42` 与 `src/services/wiki-service.ts:10`';
    const r = validatePageContent(content, baseOpts);
    expect(r.anchors).toEqual({ total: 2, valid: 2 });
    expect(r.issues.some(i => i.rule === 'broken-anchor')).toBe(false);
  });

  it('短文件名锚点：basename 唯一可解析时有效，多义或无命中才告警', () => {
    const opts: ValidateOptions = {
      ...baseOpts,
      knownFiles: new Set(['src/index.ts', 'src/main.rs', 'docs/main.rs']),
    };
    const unique = validatePageContent('# A\n\n见 `index.ts:5`', opts);
    expect(unique.anchors.valid).toBe(1);
    expect(unique.issues.some(i => i.rule === 'broken-anchor')).toBe(false);

    // main.rs 有两个同 basename 文件（src/main.rs / docs/main.rs）→ 多义，告警
    const ambiguous = validatePageContent('# A\n\n见 `main.rs:5`', opts);
    expect(ambiguous.issues.some(i => i.rule === 'broken-anchor' && i.message.includes('main.rs'))).toBe(true);

    // 无命中
    const missing = validatePageContent('# A\n\n见 `ghost.rs:5`', opts);
    expect(missing.issues.some(i => i.rule === 'broken-anchor' && i.message.includes('ghost.rs'))).toBe(true);
  });

  it('指向本次未产出页面的链接产生 dead-link 告警（warn，不拦截）', () => {
    const content = '# Readme\n\n参见 [api](api.md)。';
    const r = validatePageContent(content, baseOpts);
    expect(r.passed).toBe(true);
    expect(r.issues.some(i => i.rule === 'dead-link' && i.message.includes('api.md'))).toBe(true);
  });

  it('指向计划内页面的链接通过', () => {
    const content = '# Readme\n\n参见 [glossary](glossary.md)。';
    const r = validatePageContent(content, baseOpts);
    expect(r.issues.some(i => i.rule === 'dead-link')).toBe(false);
  });

  it('外链与页内锚点链接跳过校验', () => {
    const content = '# Readme\n\n[官网](https://example.com/a.md) 与 [本节](#section)。';
    const r = validatePageContent(content, baseOpts);
    expect(r.issues.some(i => i.rule === 'dead-link')).toBe(false);
  });

  it('wiki 根 README 链接 ../仓库文件不误报死链（relatedDocs 场景）', () => {
    const content = '# Readme\n\n[仓库 README](../README.md) 与 [文档](../docs/guide.md)。';
    const r = validatePageContent(content, {
      ...baseOpts,
      pagePath: 'README.md',
      knownFiles: new Set(['README.md', 'docs/guide.md']),
      plannedPaths: new Set<string>(),
    });
    expect(r.issues.some(i => i.rule === 'dead-link')).toBe(false);
  });

  it('子目录页面内的相对链接按所在目录解析', () => {
    const content = '# Guide\n\n参见 [overview](../overview.md)。';
    const r = validatePageContent(content, { ...baseOpts, pagePath: '05-guides/onboarding.md' });
    expect(r.issues.some(i => i.rule === 'dead-link')).toBe(false);
  });
});

describe('证据锚定与图表规则', () => {
  const evidencePage = (n: number): string =>
    `# Overview\n\n<details>\n<summary>Relevant source files</summary>\n\n${
      Array.from({ length: n }, (_, i) => `- src/file${i}.ts`).join('\n')
    }\n</details>\n\n正文见 \`src/index.ts:1\`。`;

  it('structure 页证据不足产生 thin-evidence 告警（warn，不拦截）', () => {
    const r = validatePageContent(evidencePage(2), { ...baseOpts, tier: 'structure' });
    expect(r.passed).toBe(true);
    expect(r.evidence).toBe(2);
    expect(r.issues.some(i => i.rule === 'thin-evidence')).toBe(true);
  });

  it('structure 页证据达标不告警', () => {
    const r = validatePageContent(evidencePage(3), { ...baseOpts, tier: 'structure' });
    expect(r.evidence).toBe(3);
    expect(r.issues.some(i => i.rule === 'thin-evidence')).toBe(false);
  });

  it('operations 页与 readme 索引页豁免 thin-evidence', () => {
    const ops = validatePageContent('# Environment\n\n未检出。', {
      ...baseOpts, page: 'environment', tier: 'operations',
    });
    expect(ops.issues.some(i => i.rule === 'thin-evidence')).toBe(false);
    const readme = validatePageContent('# Wiki\n\n索引页。', {
      ...baseOpts, page: 'readme', tier: 'structure',
    });
    expect(readme.issues.some(i => i.rule === 'thin-evidence')).toBe(false);
  });

  it('Mermaid 引用扫描清单外文件产生 mermaid-ghost 告警', () => {
    const content = '# Architecture\n\n```mermaid\ngraph TD\n  A[src/index.ts] --> B[src/ghost.ts]\n```\n';
    const r = validatePageContent(content, baseOpts);
    expect(r.issues.some(i => i.rule === 'mermaid-ghost' && i.message.includes('src/ghost.ts'))).toBe(true);
    expect(r.issues.some(i => i.rule === 'mermaid-ghost' && i.message.includes('src/index.ts'))).toBe(false);
  });

  it('sequenceDiagram 出现在 calls 页之外产生 diagram-misuse 告警，calls 页豁免', () => {
    const content = '# Data Flow\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n';
    const r = validatePageContent(content, baseOpts);
    expect(r.issues.some(i => i.rule === 'diagram-misuse')).toBe(true);
    const calls = validatePageContent(content, { ...baseOpts, page: 'calls' });
    expect(calls.issues.some(i => i.rule === 'diagram-misuse')).toBe(false);
  });
});
