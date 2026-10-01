import { describe, it, expect } from 'vitest';
import {
  rankEvidenceFiles,
  extractCitedFiles,
  evidenceCoverage,
  parseEvidenceBlockFiles,
  buildEvidenceBlock,
  injectEvidenceBlock,
} from '../../src/knowledge/wiki-evidence.js';

const known = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'vite.config.ts',
  'src/index.ts',
  'src/core/scanner.ts',
  'src/services/wiki-service.ts',
  'src/knowledge/types.ts',
  'docs/guide.md',
]);

describe('rankEvidenceFiles 分层排序', () => {
  it('配置/文档兜底层不再挤占核心源码（T2/T4 优先于 T5）', () => {
    const ctx = {
      configPath: 'vite.config.ts',
      docsFiles: ['docs/guide.md'],
      packageJson: 'package.json',
      symbols: [
        { name: 'scan', file: 'src/core/scanner.ts' },
        { name: 'build', file: 'src/services/wiki-service.ts' },
      ],
      entryFiles: [{ name: 'index', path: 'src/index.ts' }],
    };
    const ranked = rankEvidenceFiles(ctx, '', known);
    expect(ranked).toEqual([
      'src/core/scanner.ts',
      'src/services/wiki-service.ts',
      'src/index.ts',
      'docs/guide.md',
      'package.json',
      'vite.config.ts',
    ]);
  });

  it('正文实际引用文件置顶（T1 反向校正）', () => {
    const ctx = {
      symbols: [{ name: 'scan', file: 'src/core/scanner.ts' }],
      docsFiles: ['docs/guide.md'],
    };
    const body = '核心见 `src/knowledge/types.ts:12` 与 [扫描器](src/index.ts)。';
    const ranked = rankEvidenceFiles(ctx, body, known);
    // T1 层内字典序：src/index.ts < src/knowledge/types.ts
    expect(ranked[0]).toBe('src/index.ts');
    expect(ranked[1]).toBe('src/knowledge/types.ts');
    expect(ranked[2]).toBe('src/core/scanner.ts');
    expect(ranked).not.toContain('pnpm-lock.yaml');
  });

  it('intent 子树内文件保持 T3（不被符号字段抢到 T2）', () => {
    const ctx = {
      intent: [{ kind: 'file-header', target: { file: 'docs/guide.md' }, text: 't', anchor: 'docs/guide.md:1' }],
      symbols: [{ name: 'scan', file: 'src/core/scanner.ts' }],
    };
    const ranked = rankEvidenceFiles(ctx, '', known);
    expect(ranked).toEqual(['src/core/scanner.ts', 'docs/guide.md']);
  });

  it('封顶 15 且层内字典序（确定性）', () => {
    const files = Array.from({ length: 20 }, (_, i) => `src/m${String(i).padStart(2, '0')}.ts`);
    const all = new Set([...files, ...known]);
    const ctx = { files: [...files] };
    const ranked = rankEvidenceFiles(ctx, '', all);
    expect(ranked).toHaveLength(15);
    expect(ranked).toEqual([...ranked].sort());
  });
});

describe('cited files 与覆盖度', () => {
  it('extractCitedFiles 识别锚点/链接/反引号路径（归一化到清单）', () => {
    const body = '锚点 `src/core/scanner.ts:42`，链接 [x](src/index.ts)，反引号 `docs/guide.md`，未知 `nope/ghost.ts`。';
    const cited = extractCitedFiles(body, known);
    expect([...cited].sort()).toEqual(['docs/guide.md', 'src/core/scanner.ts', 'src/index.ts']);
  });

  it('evidenceCoverage：正文引用被锚定块覆盖的比例（块内文件不计入引用）', () => {
    const block = buildEvidenceBlock(['src/index.ts', 'src/core/scanner.ts']);
    const content = injectEvidenceBlock('# 标题\n\n引用 `src/index.ts:1` 与 `src/knowledge/types.ts:9`。\n' + block, block)
      .replace('# 标题\n\n', '# 标题\n\n');
    const cov = evidenceCoverage(content, known);
    expect(cov.cited).toBe(2);
    expect(cov.covered).toBe(1);
    expect(cov.missing).toEqual(['src/knowledge/types.ts']);
  });

  it('parseEvidenceBlockFiles 解析块内文件清单', () => {
    const files = parseEvidenceBlockFiles('# t\n\n<details>\n<summary>Relevant source files</summary>\n\n- src/index.ts\n- src/core/scanner.ts\n</details>');
    expect([...files].sort()).toEqual(['src/core/scanner.ts', 'src/index.ts']);
  });
});

describe('evidence-coverage 闸门规则', () => {
  it('正文引用 ≥3 且覆盖不全 → warn；全覆盖不告警', async () => {
    const { validatePageContent } = await import('../../src/knowledge/wiki-quality-validator.js');
    const block = buildEvidenceBlock(['src/index.ts']);
    const body = [
      '# 页',
      '',
      block,
      '',
      '引用 `src/index.ts:1`、`src/core/scanner.ts:2`、`src/services/wiki-service.ts:3`。',
    ].join('\n');
    const report = validatePageContent(body, {
      page: 'overview', pagePath: '01-overview/overview.md',
      knownFiles: known, plannedPaths: new Set(['01-overview/overview.md']),
      tier: 'structure',
    });
    const rule = report.issues.find(i => i.rule === 'evidence-coverage');
    expect(rule?.severity).toBe('warn');
    expect(rule?.message).toContain('src/core/scanner.ts');
    expect(report.evidenceCoverage).toEqual({ cited: 3, covered: 1, missingSample: expect.arrayContaining(['src/core/scanner.ts']) });

    const full = validatePageContent(
      ['# 页', '', buildEvidenceBlock(['src/index.ts', 'src/core/scanner.ts', 'src/services/wiki-service.ts']), '', '引用 `src/index.ts:1`、`src/core/scanner.ts:2`、`src/services/wiki-service.ts:3`。'].join('\n'),
      { page: 'overview', pagePath: '01-overview/overview.md', knownFiles: known, plannedPaths: new Set(['01-overview/overview.md']) },
    );
    expect(full.issues.find(i => i.rule === 'evidence-coverage')).toBeUndefined();
  });
});
