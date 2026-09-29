import { describe, it, expect } from 'vitest';
import { extractClaims, verifyAndAnnotateClaims, collectContextKeys } from '../../src/knowledge/claim-verifier.js';
import type { ClaimVerifyContext } from '../../src/knowledge/claim-verifier.js';
import { WIKI_MAX_GREP_PROBES } from '../../src/shared/constants.js';

function makeCtx(overrides?: Partial<ClaimVerifyContext> & { grep?: (p: string) => number }): ClaimVerifyContext & { probeLog: string[] } {
  const probeLog: string[] = [];
  return {
    symbols: overrides?.symbols ?? new Set<string>(),
    knownFiles: overrides?.knownFiles ?? new Set<string>(),
    confirmed: overrides?.confirmed,
    grepCount: (p: string) => {
      probeLog.push(p);
      return overrides?.grep ? overrides.grep(p) : 0;
    },
    probeLog,
  };
}

describe('extractClaims', () => {
  it('收集 inline 标识符：调用式剥括号、点链取末段，raw 保留原 span', () => {
    const md = '调用 `buildWiki()` 与 `client.queryGraph`，还有 `outline`。';
    const claims = extractClaims(md);
    const byRaw = new Map(claims.map(c => [c.raw, c.name]));
    expect(byRaw.get('buildWiki()')).toBe('buildWiki');
    expect(byRaw.get('client.queryGraph')).toBe('queryGraph');
    expect(byRaw.get('outline')).toBe('outline');
    expect(claims).toHaveLength(3);
  });

  it('跳过 fenced 代码块、路径、短语、短词与 JS 字面量', () => {
    const md = [
      '正文 `goodThing` 与 `src/a.ts`、`two words`、`ab`、`true`。',
      '```ts',
      '`fencedClaim` 不算',
      '```',
      '中文 `说明` 不算，`bar()` 算。',
    ].join('\n');
    const claims = extractClaims(md);
    expect(claims.map(c => c.raw)).toEqual(['goodThing', 'bar()']);
  });
});

describe('verifyAndAnnotateClaims', () => {
  it('三级核验：图谱符号/文件名干免探测，词法兜底，查无实据标注待确认', () => {
    const ctx = makeCtx({
      symbols: new Set(['buildWiki']),
      knownFiles: new Set(['src/knowledge/outline.ts']),
      grep: p => (p === 'streamText' ? 2 : 0),
    });
    const md = '核心是 `buildWiki()`、`outline` 与 `streamText`；`ghostThing` 不存在。';
    const { content, stats } = verifyAndAnnotateClaims(md, ctx);

    expect(content).toContain('`ghostThing`（待确认）');
    expect(content).not.toContain('buildWiki`（待确认）');
    expect(content).not.toContain('outline`（待确认）');
    expect(content).not.toContain('streamText`（待确认）');
    expect(stats).toEqual({ total: 4, verified: 3, unverified: 1, skipped: 0 });
    // 仅词法兜底通道的名字才探测（streamText/ghostThing 两次）
    expect(ctx.probeLog).toEqual(['streamText', 'ghostThing']);
  });

  it('同名声明共享判定：`foo` 与 `foo()` 只探测一次、一并标注', () => {
    const ctx = makeCtx();
    const { content, stats } = verifyAndAnnotateClaims('见 `foo` 与 `foo()`。', ctx);
    expect(ctx.probeLog).toEqual(['foo']);
    expect(content).toContain('`foo`（待确认）');
    expect(content).toContain('`foo()`（待确认）');
    expect(stats.unverified).toBe(2);
  });

  it('探测上限：超限名字不探测不标注，计入 skipped', () => {
    const ctx = makeCtx();
    const names = Array.from({ length: WIKI_MAX_GREP_PROBES + 3 }, (_, i) => `name${i}`);
    const md = names.map(n => `\`${n}\``).join(' ');
    const { stats } = verifyAndAnnotateClaims(md, ctx);

    expect(ctx.probeLog).toHaveLength(WIKI_MAX_GREP_PROBES);
    expect(stats.skipped).toBe(3);
    expect(stats.unverified).toBe(WIKI_MAX_GREP_PROBES);
  });

  it('探测抛错按有实据处理（宁漏勿误）', () => {
    const ctx = makeCtx({ grep: () => { throw new Error('mcp down'); } });
    const { content, stats } = verifyAndAnnotateClaims('`anything`', ctx);
    expect(content).toBe('`anything`');
    expect(stats.unverified).toBe(0);
  });

  it('confirmed 白名单：命中即免标、不占探测额度、不计 skipped', () => {
    const ctx = makeCtx({
      confirmed: new Set(['ghostThing']),
      grep: () => 0,
    });
    const { content, stats } = verifyAndAnnotateClaims(
      '白名单 `ghostThing` 与未知 `otherGhost`。', ctx,
    );
    expect(content).toContain('`ghostThing`');
    expect(content).not.toContain('`ghostThing`（待确认）');
    expect(content).toContain('`otherGhost`（待确认）');
    expect(ctx.probeLog).toEqual(['otherGhost']); // 白名单项不探测
    expect(stats).toEqual({ total: 2, verified: 1, unverified: 1, skipped: 0 });
  });
});

describe('collectContextKeys', () => {
  it('递归收集 context 数据字段名（深度≤3，数组采样首元素）', () => {
    const keys = collectContextKeys({
      projectType: 'cli',
      nodeVersion: '',
      depUsage: [{ name: 'x', importFiles: ['a.ts'], importCount: 1, usageKind: 'import' }],
      groups: [{ entry: 'main', entryFile: 'src/main.ts', edges: [{ caller: 'main' }] }],
      deep: { level2: { level3: { level4: 'too deep' } } },
    });

    expect(keys.has('projectType')).toBe(true);
    expect(keys.has('nodeVersion')).toBe(true);
    expect(keys.has('depUsage')).toBe(true);
    expect(keys.has('importFiles')).toBe(true);
    expect(keys.has('usageKind')).toBe(true);
    expect(keys.has('entryFile')).toBe(true);
    // 深度 3 截断：level3 收集，level4 不收集
    expect(keys.has('level2')).toBe(true);
    expect(keys.has('level3')).toBe(true);
    expect(keys.has('level4')).toBe(false);
  });

  it('同时收集标识符形字符串值（如 .editorconfig 规则键），路径与短语不收集', () => {
    const keys = collectContextKeys({
      editorConfig: [
        { rule: 'insert_final_newline', value: 'true' },
        { rule: 'indent_style', value: 'space' },
      ],
      somePath: 'src/lib/a.ts',
      somePhrase: '高扇入热点锚定（非应用入口）',
    });

    expect(keys.has('insert_final_newline')).toBe(true);
    expect(keys.has('indent_style')).toBe(true);
    expect(keys.has('src/lib/a.ts')).toBe(false);
    expect(keys.has('高扇入热点锚定（非应用入口）')).toBe(false);
  });

  it('字段名并入 universe 后，LLM 引用的数据字段不再被标待确认', () => {
    const pageCtx = { projectType: 'frontend', packageManager: 'bun', nodeVersion: '' };
    const symbols = new Set<string>(['realSymbol']);
    for (const k of collectContextKeys(pageCtx)) symbols.add(k);
    const ctx = makeCtx({ symbols, grep: () => 0 });
    const { content } = verifyAndAnnotateClaims(
      '包管理器 `packageManager`，另有 `ghostThing`。', ctx,
    );
    expect(content).toContain('`ghostThing`（待确认）');
    expect(content).not.toContain('`packageManager`（待确认）');
  });
});
