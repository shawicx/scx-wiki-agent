import { describe, it, expect } from 'vitest';
import { extractClaims, verifyAndAnnotateClaims, collectContextKeys, isCommentLine } from '../../src/knowledge/claim-verifier.js';
import type { ClaimVerifyContext, ProbeEvidenceKind } from '../../src/knowledge/claim-verifier.js';
import { WIKI_MAX_GREP_PROBES } from '../../src/shared/constants.js';

function makeCtx(overrides?: Partial<ClaimVerifyContext> & { grep?: (p: string) => number }): ClaimVerifyContext & { probeLog: string[] } {
  const probeLog: string[] = [];
  return {
    symbols: overrides?.symbols ?? new Set<string>(),
    qualifiedNames: overrides?.qualifiedNames,
    symbolFiles: overrides?.symbolFiles,
    knownFiles: overrides?.knownFiles ?? new Set<string>(),
    confirmed: overrides?.confirmed,
    probe: p => {
      probeLog.push(p);
      if (overrides?.probe) return overrides.probe(p);
      // 兼容旧 grep 语义：>0 命中 → usage；0 → null
      return overrides?.grep && overrides.grep(p) > 0 ? 'usage' : null;
    },
    probeLog,
  };
}

describe('extractClaims', () => {
  it('收集 inline 标识符：调用式剥括号、点链保留全串，raw 保留原 span', () => {
    const md = '调用 `buildWiki()` 与 `client.queryGraph`，还有 `outline`。';
    const claims = extractClaims(md);
    const byRaw = new Map(claims.map(c => [c.raw, c.chain]));
    expect(byRaw.get('buildWiki()')).toBe('buildWiki');
    expect(byRaw.get('client.queryGraph')).toBe('client.queryGraph');
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
    expect(stats).toEqual({ total: 4, verified: 3, unverified: 1, mentionOnly: 0, ambiguous: 0, skipped: 0 });
    // 仅词法兜底通道的名字才探测（streamText/ghostThing 两次）
    expect(ctx.probeLog).toEqual(['streamText', 'ghostThing']);
  });

  it('点链声明按 qualified_name 后缀匹配：全串/去首段命中即免探测', () => {
    const ctx = makeCtx({
      qualifiedNames: new Set(['proj.src.gen.WikiPageGenerator.generateOverview']),
    });
    const { content, stats } = verifyAndAnnotateClaims(
      '见 `WikiPageGenerator.generateOverview` 与 `client.queryGraph`。', ctx,
    );
    // WikiPageGenerator.generateOverview 是 qualified 的后缀 → 一级命中
    expect(content).not.toContain('generateOverview`（待确认）');
    // client.queryGraph 末段 queryGraph 无任何实据 → 探测后标注
    expect(ctx.probeLog).toEqual(['queryGraph']);
    expect(stats.verified).toBe(1);
  });

  it('仅注释/配置提及（mention）不算实据：标注待确认并计入 mentionOnly', () => {
    const ctx = makeCtx({ probe: () => 'mention' as ProbeEvidenceKind });
    const { content, stats } = verifyAndAnnotateClaims('`commentOnly` 只出现在注释里。', ctx);
    expect(content).toContain('`commentOnly`（待确认）');
    expect(stats.mentionOnly).toBe(1);
    expect(stats.unverified).toBe(1);
  });

  it('同名多文件符号计入 ambiguous（不拦截、不标注）', () => {
    const ctx = makeCtx({
      symbols: new Set(['dupName']),
      symbolFiles: new Map([['dupName', new Set(['src/a.ts', 'src/b.ts'])]]),
    });
    const { content, stats } = verifyAndAnnotateClaims('`dupName` 在两个文件里。', ctx);
    expect(content).not.toContain('待确认');
    expect(stats.ambiguous).toBe(1);
    expect(stats.verified).toBe(1);
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
    const ctx = makeCtx({ probe: () => { throw new Error('mcp down'); } });
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
    expect(stats).toEqual({ total: 2, verified: 1, unverified: 1, mentionOnly: 0, ambiguous: 0, skipped: 0 });
  });
});

describe('isCommentLine（证据分类）', () => {
  it('C 系注释前缀 / 空行算提及', () => {
    expect(isCommentLine('  // TODO: fix', 'src/a.ts')).toBe(true);
    expect(isCommentLine(' * doc line', 'src/a.ts')).toBe(true);
    expect(isCommentLine('/* block', 'src/a.ts')).toBe(true);
    expect(isCommentLine('', 'src/a.ts')).toBe(true);
  });
  it('# 注释语言仅对配置/脚本后缀生效', () => {
    expect(isCommentLine('# comment', 'conf/app.yaml')).toBe(true);
    expect(isCommentLine('#!/usr/bin/env bash', 'scripts/x.sh')).toBe(true);
    // ts 中的 #（私有字段）不算注释
    expect(isCommentLine('#privateField', 'src/a.ts')).toBe(false);
  });
  it('代码/调用/import 行不算提及（保守：其余一律实据）', () => {
    expect(isCommentLine('const x = importMeta;', 'src/a.ts')).toBe(false);
    expect(isCommentLine('import { foo } from "bar";', 'src/a.ts')).toBe(false);
    expect(isCommentLine('"name": "left-pad",', 'package.json')).toBe(false);
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
