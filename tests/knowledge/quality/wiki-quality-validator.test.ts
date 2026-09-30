import { describe, it, expect } from 'vitest';
import { validatePageContent } from '../../../src/knowledge/wiki-quality-validator.js';
import type { ValidateOptions } from '../../../src/knowledge/wiki-quality-validator.js';

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

  it('测试文件锚点按页面作用域裁决：非 testing 告警，testing 可用', () => {
    const content = '# Page\n\n见 `tests/config.test.ts:1`';
    const production = validatePageContent(content, baseOpts);
    expect(production.issues.some(i => i.rule === 'broken-anchor' && i.message.includes('tests/config.test.ts'))).toBe(true);

    const testing = validatePageContent(content, {
      ...baseOpts,
      page: 'testing',
      pagePath: '05-guides/testing.md',
      knownFiles: new Set([...baseOpts.knownFiles, 'tests/config.test.ts']),
    });
    expect(testing.issues.some(i => i.rule === 'broken-anchor')).toBe(false);
  });

  it('有效锚点计入统计且不产生告警（未注入 reader 时分类为 0，行为不变）', () => {
    const content = '# Calls\n\n见 `src/index.ts:42` 与 `src/services/wiki-service.ts:10`';
    const r = validatePageContent(content, baseOpts);
    expect(r.anchors).toEqual({ total: 2, valid: 2, outOfRange: 0, comment: 0, doc: 0, usage: 0 });
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

  describe('unanchored-rationale（R7 事后核验）', () => {
    it('动机类小节零锚点产生告警（warn，不拦截）', () => {
      const content = '# Overview\n\n## 设计思路\n\n该项目采用了分层架构，因为这样最合理。\n\n## 技术栈\n\n- vue\n';
      const r = validatePageContent(content, baseOpts);
      expect(r.passed).toBe(true);
      const issue = r.issues.find(i => i.rule === 'unanchored-rationale');
      expect(issue?.severity).toBe('warn');
      expect(issue?.message).toContain('设计思路');
      // 非动机类小节不告警
      expect(r.issues.filter(i => i.rule === 'unanchored-rationale')).toHaveLength(1);
    });

    it('file:line / commit 锚点均可满足 R7，不产生告警', () => {
      const fileAnchor = '# A\n\n## 设计思路\n\n见 `src/index.ts:12` 的注释。\n';
      expect(validatePageContent(fileAnchor, baseOpts).issues.some(i => i.rule === 'unanchored-rationale')).toBe(false);

      const commitAnchor = '# A\n\n## 演进脉络\n\n引入于 commit:abc12345 (2026-06-24)。\n';
      expect(validatePageContent(commitAnchor, baseOpts).issues.some(i => i.rule === 'unanchored-rationale')).toBe(false);

      const commitAnchor2 = '# A\n\n## 演进脉络\n\n引入于 `abc12345`（2026-06-24）。\n';
      expect(validatePageContent(commitAnchor2, baseOpts).issues.some(i => i.rule === 'unanchored-rationale')).toBe(false);

      const docAnchor = '# A\n\n## 文档记录的决策\n\n摘录自 docs/design/adr.md#决策。\n';
      expect(validatePageContent(docAnchor, baseOpts).issues.some(i => i.rule === 'unanchored-rationale')).toBe(false);
    });

    it('空小节与非动机类标题不参与核验；锚点在小节正文即可', () => {
      const content = [
        '# Decisions',
        '',
        '## 演进时间线（按模块）',
        '',
        '| 模块 | 提交 |',
        '| --- | --- |',
        '| core | commit:abc12345 (2026-01-01) |',
        '',
        '## 未分类条目',
        '',
        '一些普通描述。',
      ].join('\n');
      const r = validatePageContent(content, baseOpts);
      expect(r.issues.some(i => i.rule === 'unanchored-rationale')).toBe(false);
    });
  });
});

describe('incomplete-page（截断残页检测）', () => {
  const fenceContent = '# Overview\n\n正文段落。\n\n```ts\nconst half =';
  const tableContent = '# Modules\n\n| 模块 | 职责 |\n|---|---|\n| core | 扫描 |\n| services | 编排';

  it('未闭合代码块：默认 warn 不拦截', () => {
    const r = validatePageContent(fenceContent, baseOpts);
    expect(r.passed).toBe(true);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ rule: 'incomplete-page', severity: 'warn', message: expect.stringContaining('未闭合代码块') }),
    );
  });

  it('末尾表格残行：默认 warn 不拦截', () => {
    const r = validatePageContent(tableContent, baseOpts);
    expect(r.passed).toBe(true);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ rule: 'incomplete-page', severity: 'warn', message: expect.stringContaining('表格残行') }),
    );
  });

  it('truncated=true（生成期仍截断）时升级为 error，拒绝写盘', () => {
    for (const content of [fenceContent, tableContent]) {
      const r = validatePageContent(content, { ...baseOpts, truncated: true });
      expect(r.passed).toBe(false);
      expect(r.issues).toContainEqual(
        expect.objectContaining({ rule: 'incomplete-page', severity: 'error' }),
      );
    }
  });

  it('完整内容无 incomplete-page 告警', () => {
    const content = '# Overview\n\n完整正文。\n\n```ts\nconst a = 1;\n```\n\n| A |\n|---|\n| 1 |';
    const r = validatePageContent(content, baseOpts);
    expect(r.issues.some(i => i.rule === 'incomplete-page')).toBe(false);
    expect(r.passed).toBe(true);
  });
});

describe('unanchored-dependency（tech-stack 依赖 import 点核验）', () => {
  const techOpts: ValidateOptions = { ...baseOpts, page: 'tech-stack', pagePath: 'tech-stack.md' };
  const withAnchor = '# 技术栈\n\n## 核心依赖\n\n| 依赖 | 版本 | 首个 import 点 |\n|---|---|---|\n| vue | ^3.4 | src/main.ts |\n| commander | ^12 | src/cli/index.ts:10 |';
  const withoutAnchor = '# 技术栈\n\n## 核心依赖\n\n| 依赖 | 版本 | 首个 import 点 |\n|---|---|---|\n| vue | ^3.4 | - |\n| commander | ^12 | 未知 |';

  it('依赖表格行带 import 点锚点：无告警', () => {
    const r = validatePageContent(withAnchor, techOpts);
    expect(r.issues.some(i => i.rule === 'unanchored-dependency')).toBe(false);
  });

  it('依赖表格行缺 import 点锚点：warn 并列出依赖名', () => {
    const r = validatePageContent(withoutAnchor, techOpts);
    const issue = r.issues.find(i => i.rule === 'unanchored-dependency');
    expect(issue?.severity).toBe('warn');
    expect(issue?.message).toContain('vue');
    expect(issue?.message).toContain('commander');
  });

  it('版本号不算锚点；「声明未用」小节豁免；非 tech-stack 页不检查', () => {
    // 版本号 ^4.0.0 不构成锚点 → 仍告警
    const versionOnly = '# 技术栈\n\n## 开发依赖\n\n| 依赖 | 版本 | import 点 |\n|---|---|---|\n| vitest | ^4.0.0 | - |';
    expect(validatePageContent(versionOnly, techOpts).issues.some(i => i.rule === 'unanchored-dependency')).toBe(true);
    // 声明未用依赖小节合法无 import 点
    const unused = '# 技术栈\n\n## 声明未用依赖\n\n| 依赖 | 版本 |\n|---|---|\n| left-pad | ^1 |';
    expect(validatePageContent(unused, techOpts).issues.some(i => i.rule === 'unanchored-dependency')).toBe(false);
    // 其他页同名结构不检查
    expect(validatePageContent(withoutAnchor, baseOpts).issues.some(i => i.rule === 'unanchored-dependency')).toBe(false);
  });
});
