import { describe, it, expect } from 'vitest';
import { validatePageContent, headingSlug } from '../../../src/knowledge/wiki-quality-validator.js';
import type { ValidateOptions } from '../../../src/knowledge/wiki-quality-validator.js';

const baseOpts: ValidateOptions = {
  page: 'overview',
  pagePath: 'overview.md',
  knownFiles: new Set(['src/index.ts', 'src/services/wiki-service.ts']),
  plannedPaths: new Set(['overview.md', 'glossary.md', 'readme.md']),
};

describe('真锚点核验（注入式 reader/symbolFiles）', () => {
  const srcLines = [
    'import { foo } from "bar";',
    'const x = 1;',
    '// 注释行：说明用途',
    'export function realFn() {}',
    'export function other() {}',
  ];
  const optsWithReader = (over?: Partial<ValidateOptions>): ValidateOptions => ({
    ...baseOpts,
    readFileLine: (file, line) => (line >= 1 && line <= srcLines.length ? srcLines[line - 1] : null),
    ...over,
  });

  it('行号超出文件范围 → warn 并计入 outOfRange', () => {
    const r = validatePageContent('# A\n\n见 `src/index.ts:999`', optsWithReader());
    expect(r.anchors.outOfRange).toBe(1);
    expect(r.issues).toContainEqual(
      expect.objectContaining({ rule: 'broken-anchor', message: expect.stringContaining('超出文件范围') }),
    );
  });

  it('注释行锚点不告警，计入 comment 分类；代码行计入 usage', () => {
    const content = '# A\n\n定义 `src/index.ts:4`，说明 `src/index.ts:3`';
    const r = validatePageContent(content, optsWithReader());
    expect(r.anchors.usage).toBe(1);
    expect(r.anchors.comment).toBe(1);
    expect(r.issues.some(i => i.rule === 'broken-anchor')).toBe(false);
  });

  it('锚点文件与符号定义文件不符 → warn；歧义名（0 文件）不告警', () => {
    const symbolFiles = new Map<string, ReadonlySet<string>>([
      ['realFn', new Set(['src/services/wiki-service.ts'])],
      ['nowhere', new Set()],
    ]);
    const r = validatePageContent(
      '# A\n\n`realFn` 见 `src/index.ts:4`；`nowhere` 见 `src/index.ts:4`',
      optsWithReader({ symbolFiles }),
    );
    const mismatch = r.issues.filter(i => i.message.includes('定义文件不符'));
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].message).toContain('realFn');
  });

  it('文档锚点：目标 heading 存在通过，不存在告警', () => {
    const docs: Record<string, string> = {
      'docs/design/adr.md': '# 架构决策\n\n## 决策一：本地索引\n\n内容\n',
    };
    const opts = optsWithReader({
      knownFiles: new Set([...baseOpts.knownFiles, 'docs/design/adr.md']),
      readFile: f => docs[f] ?? null,
    });
    const ok = validatePageContent('# A\n\n见 docs/design/adr.md#决策一本地索引', opts);
    expect(ok.issues.some(i => i.message.includes('文档锚点目标不存在'))).toBe(false);
    const bad = validatePageContent('# A\n\n见 docs/design/adr.md#不存在的章节', opts);
    expect(bad.issues).toContainEqual(
      expect.objectContaining({ rule: 'broken-anchor', message: expect.stringContaining('文档锚点目标不存在') }),
    );
  });

  it('页内 fragment 链接：heading 存在通过，编造目标告警', () => {
    const content = '# 页\n\n## 真实章节\n\n见 [跳转](#真实章节) 与 [编造](#ghost-section)';
    const r = validatePageContent(content, baseOpts);
    const fragIssues = r.issues.filter(i => i.message.includes('页内锚链接目标不存在'));
    expect(fragIssues).toHaveLength(1);
    expect(fragIssues[0].message).toContain('ghost-section');
  });
});

describe('headingSlug', () => {
  it('GitHub 风格：小写、去标点、空格→连字符，中文保留', () => {
    expect(headingSlug('决策一：本地索引')).toBe('决策一本地索引');
    expect(headingSlug('Getting Started!')).toBe('getting-started');
    expect(headingSlug('  Data Flow (v2)  ')).toBe('data-flow-v2');
  });
});

describe('claim-support（事实句支撑率）', () => {
  it('支撑率 <50% 且事实句 ≥5 → warn 并附样本；高支撑率不触发', () => {
    const weak = [
      '# 页',
      '',
      '`fooBar` 负责扫描。',     // 无锚点
      '`bazQux` 处理索引。',     // 无锚点
      '`quuxCorge` 渲染输出。',  // 无锚点
      '`graultGarply` 很重要。', // 无锚点
      '`waldoFred` 亦然。',      // 无锚点
    ].join('\n');
    const r = validatePageContent(weak, baseOpts);
    expect(r.claimSupport).toEqual(expect.objectContaining({ factual: 5, supported: 0 }));
    expect(r.issues).toContainEqual(expect.objectContaining({ rule: 'claim-support', severity: 'warn' }));

    const strong = [
      '# 页',
      '',
      '`fooBar` 负责扫描（src/index.ts:1）。',
      '`bazQux` 处理索引（src/index.ts:2）。',
      '`quuxCorge` 渲染输出（src/index.ts:3）。',
      '`graultGarply` 很重要（src/index.ts:4）。',
      '机制描述标注「推断」：`waldoFred` 亦然。',
    ].join('\n');
    const ok = validatePageContent(strong, baseOpts);
    expect(ok.claimSupport.supported).toBe(5);
    expect(ok.issues.some(i => i.rule === 'claim-support')).toBe(false);
  });

  it('无标识符的普通行与标题不计入事实句；表格行按行计', () => {
    const content = [
      '# 页',
      '',
      '这是普通叙述句，没有反引号。',
      '',
      '| 符号 | 锚点 |',
      '|---|---|',
      '| `fooBar` | src/index.ts:1 |',
      '| `bazQux` | - |',
    ].join('\n');
    const r = validatePageContent(content, baseOpts);
    expect(r.claimSupport.factual).toBe(2);
    expect(r.claimSupport.supported).toBe(1);
  });
});
