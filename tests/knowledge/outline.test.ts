import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadOutline, saveOutline, validateOutline,
  MAX_CHAPTERS, MAX_PAGES_PER_CHAPTER, MAX_OUTLINE_PAGES,
  MIN_PAGE_FILES, MAX_PAGE_FILES,
} from '../../src/knowledge/outline.js';
import type { OutlineKnown } from '../../src/knowledge/outline.js';

const known: OutlineKnown = {
  files: new Set([
    'src/a/one.ts', 'src/a/two.ts', 'src/a/three.ts', 'src/a/four.ts', 'src/a/five.ts',
    'src/b/one.ts', 'src/b/two.ts', 'src/b/three.ts',
    'src/c/one.ts', 'src/c/two.ts', 'src/c/three.ts',
    'src/d/one.ts', 'src/d/two.ts', 'src/d/three.ts',
    'tests/fixtures/x.ts',
  ]),
  modules: new Set(['a', 'b', 'c', 'd']),
  symbols: new Set(['RealSymbol']),
};

const A = ['src/a/one.ts', 'src/a/two.ts', 'src/a/three.ts'];
const B = ['src/b/one.ts', 'src/b/two.ts', 'src/b/three.ts'];

function rawPage(id: string, files: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `页 ${id}`, brief: `${id} 的写作简报`, files, ...extra };
}

function rawChapter(id: string, pages: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `章 ${id}`, summary: `${id} 的职责`, pages, ...extra };
}

function outlineOf(chapters: unknown[]): unknown {
  return { version: 1, generator: 'test', generatedAt: '2026-09-22T00:00:00Z', chapters };
}

describe('validateOutline 正常路径', () => {
  it('合法树通过校验并做净化（clamp/剔除未知引用）', () => {
    const report = validateOutline(outlineOf([
      rawChapter('terminal-rendering', [
        rawPage('xterm', A, {
          title: 'x'.repeat(120),
          brief: 'b'.repeat(3000),
          modules: ['a', 'ghost-mod'],
          symbols: ['RealSymbol', 'GhostSym'],
        }),
        rawPage('theme', B),
      ]),
    ]), known);

    expect(report.unparsable).toBe(false);
    expect(report.chapters).toHaveLength(1);
    const page = report.chapters[0].pages[0];
    expect(page.title.length).toBe(80);
    expect(page.brief.length).toBe(2000);
    expect(page.modules).toEqual(['a']);
    expect(page.symbols).toEqual(['RealSymbol']);
    expect(report.warnings.some(w => w.code === 'W3' && w.target === 'terminal-rendering/xterm')).toBe(true);
  });
});

describe('validateOutline 剔除规则', () => {
  it('E1：非法章 id / 章内重复页 id（剔页留章）/ 重复章 id', () => {
    const report = validateOutline(outlineOf([
      rawChapter('Bad_Id', [rawPage('p1', A)]),
      rawChapter('good', [rawPage('p1', A), rawPage('p1', B)]),
      rawChapter('good', [rawPage('p2', A)]),
    ]), known);

    // 章 id 非法剔除；重复页 id 只剔页、章保留 1 页；第二个 good 因章 id 重复剔除
    expect(report.chapters).toHaveLength(1);
    expect(report.chapters[0].pages.map(p => p.id)).toEqual(['p1']);
    expect(report.drops.map(d => d.chapter)).toEqual(['Bad_Id', 'good', 'good']);
    expect(report.drops[1].page).toBe('p1');
  });

  it('E2：未知/测试路径文件被剔除，有效文件不足整页剔除', () => {
    const report = validateOutline(outlineOf([
      rawChapter('ch', [
        rawPage('thin', ['src/a/one.ts', 'nope.ts', 'tests/fixtures/x.ts']),
        rawPage('ok', B),
      ]),
    ]), known);

    expect(report.chapters).toHaveLength(1);
    expect(report.chapters[0].pages.map(p => p.id)).toEqual(['ok']);
    expect(report.drops[0].reasons.join()).toContain('不足');
  });

  it('E2：文件数超上限截断并告警', () => {
    const files = [...A, 'src/a/four.ts', 'src/a/five.ts',
      ...B, 'src/c/one.ts', 'src/c/two.ts', 'src/c/three.ts',
      'src/d/one.ts', 'src/d/two.ts', 'src/d/three.ts'];
    const report = validateOutline(outlineOf([
      rawChapter('ch', [rawPage('fat', files), rawPage('ok2', B)]),
    ]), known);

    expect(report.chapters[0].pages[0].files).toHaveLength(MAX_PAGE_FILES);
    expect(report.warnings.some(w => w.message.includes('截断'))).toBe(true);
  });

  it('E3：章数/章内页数/总页数上限', () => {
    const chapters = Array.from({ length: MAX_CHAPTERS + 1 }, (_, i) =>
      rawChapter(`ch-${i}`, [rawPage(`p1`, A), rawPage(`p2`, B)]));
    let report = validateOutline(outlineOf(chapters), known);
    expect(report.chapters).toHaveLength(MAX_CHAPTERS);
    expect(report.drops.some(d => d.reasons.some(r => r.includes('章数超过上限')))).toBe(true);

    const sevenPages = Array.from({ length: MAX_PAGES_PER_CHAPTER + 1 }, (_, i) => rawPage(`p${i}`, A));
    report = validateOutline(outlineOf([rawChapter('ch', sevenPages)]), known);
    expect(report.chapters[0].pages).toHaveLength(MAX_PAGES_PER_CHAPTER);
    expect(report.drops.some(d => d.page === `p${MAX_PAGES_PER_CHAPTER}`)).toBe(true);

    // 3 章 × 6 页 = 18 > 16：最后 2 页被总量预算剔除
    const bulk = Array.from({ length: 3 }, (_, c) =>
      rawChapter(`ch-${c}`, Array.from({ length: 6 }, (_, i) => rawPage(`p${c}${i}`, i % 2 === 0 ? A : B))));
    report = validateOutline(outlineOf(bulk), known);
    const kept = report.chapters.reduce((n, c) => n + c.pages.length, 0);
    expect(kept).toBe(MAX_OUTLINE_PAGES);
    expect(report.drops.some(d => d.reasons.some(r => r.includes('总量超过上限')))).toBe(true);
  });

  it('E4：空 brief 整页剔除', () => {
    const report = validateOutline(outlineOf([
      rawChapter('ch', [rawPage('nobrief', A, { brief: '   ' }), rawPage('ok', B)]),
    ]), known);

    expect(report.chapters[0].pages.map(p => p.id)).toEqual(['ok']);
    expect(report.drops[0].reasons.join()).toContain('brief');
  });

  it('降级链：全部页无效 → 空章剔除 → 净树为空但非 unparsable', () => {
    const report = validateOutline(outlineOf([
      rawChapter('ch', [rawPage('p', ['x.ts'])]),
    ]), known);

    expect(report.chapters).toHaveLength(0);
    expect(report.unparsable).toBe(false);
    expect(report.drops.some(d => d.page === 'p' && d.reasons.some(r => r.includes('不足')))).toBe(true);
    expect(report.drops.some(d => d.page === undefined && d.reasons.includes('无有效页'))).toBe(true);
  });

  it('结构不合规 → unparsable', () => {
    expect(validateOutline({ version: 2, chapters: [] }, known).unparsable).toBe(true);
    expect(validateOutline({ version: 1, chapters: 'x' }, known).unparsable).toBe(true);
    expect(validateOutline({ version: 1, chapters: [{ id: 'ch', pages: [{ id: 'p', files: 'no' }] }] }, known).unparsable).toBe(true);
    expect(validateOutline(null, known).unparsable).toBe(true);
  });
});

describe('validateOutline 告警规则', () => {
  it('W1：单页章告警但保留', () => {
    const report = validateOutline(outlineOf([rawChapter('solo', [rawPage('p', A)])]), known);
    expect(report.chapters).toHaveLength(1);
    expect(report.warnings.some(w => w.code === 'W1' && w.target === 'solo')).toBe(true);
  });

  it('W2：文件跨模块超过阈值告警', () => {
    const span = ['src/a/one.ts', 'src/b/one.ts', 'src/c/one.ts', 'src/d/one.ts'];
    const report = validateOutline(outlineOf([
      rawChapter('ch', [rawPage('wide', span), rawPage('narrow', A)]),
    ]), known);
    expect(report.warnings.some(w => w.code === 'W2' && w.target === 'ch/wide')).toBe(true);
  });

  it('W4：页间文件高重叠告警', () => {
    const report = validateOutline(outlineOf([
      rawChapter('ch', [rawPage('p1', A), rawPage('p2', [...A])]),
    ]), known);
    expect(report.warnings.some(w => w.code === 'W4')).toBe(true);
  });

  it('W5：跨章页标题重复告警', () => {
    const report = validateOutline(outlineOf([
      rawChapter('c1', [rawPage('p1', A)]),
      rawChapter('c2', [rawPage('p2', B, { title: '页 p1' })]),
    ]), known);
    expect(report.warnings.some(w => w.code === 'W5' && w.target === 'c2/p2')).toBe(true);
  });
});

describe('loadOutline / saveOutline', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'outline-test-'));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('缺失文件返回 null', () => {
    expect(loadOutline(tmp)).toBeNull();
  });

  it('坏 JSON 返回 null，好 JSON 往返', () => {
    writeFileSync(join(tmp, 'outline.json'), '{broken', 'utf-8');
    expect(loadOutline(tmp)).toBeNull();

    const data = {
      version: 1 as const,
      generator: 'manual',
      generatedAt: '2026-09-22T00:00:00Z',
      chapters: [{ id: 'ch', title: '章', summary: 's', pages: [{ id: 'p', title: '页', brief: 'b', files: A }] }],
    };
    saveOutline(tmp, data);
    expect(existsSync(join(tmp, 'outline.json'))).toBe(true);
    expect(loadOutline(tmp)).toEqual(data);
    expect(validateOutline(loadOutline(tmp), known).chapters).toHaveLength(1);
  });
});
