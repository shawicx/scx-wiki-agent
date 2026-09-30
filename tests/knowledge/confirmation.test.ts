import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  collectPendingConfirmations,
  applyConfirmations,
  validateReplacement,
  loadConfirmedClaims,
  saveConfirmedClaims,
  type ConfirmationDecision,
} from '../../src/knowledge/confirmation.js';
import { pendingMarker, stripPendingMarkers } from '../../src/knowledge/wiki-markers.js';

/** 工具标注的 claim 形态：可见文本 + pending marker */
const claimLine = (name: string) => `\`${name}\`（待确认）<!-- ${pendingMarker('claim', name)} -->`;

function decisionsOf(...list: Array<Partial<ConfirmationDecision> & { key: string }>): Map<string, ConfirmationDecision> {
  const defaults = { kind: 'claim' as const, action: 'resolve' as const };
  return new Map(list.map(d => {
    const full = { ...defaults, ...d } as ConfirmationDecision;
    return [full.key, full];
  }));
}

describe('collectPendingConfirmations', () => {
  it('识别四种形态：claim / note / cell / prose，跳过 fenced 代码块', () => {
    const content = [
      '# Page',
      '',
      `断言 ${claimLine('ghostThing')} 与 \`real\` 保持。`,
      '',
      '> ⚠️ **待确认**：本页为规则模板生成，未采集真实错误日志（证据不足，禁止猜测；请人工补充后移除本标记）',
      '',
      '| 变量 | 敏感 | 用途 |',
      '| --- | --- | --- |',
      '| API_KEY | 是 | ⚠️ 待确认 |',
      '',
      '具体端口号待确认（数据未提供）。',
      '',
      '```ts',
      `${claimLine('fencedClaim')} 与 ⚠️ 待确认 不算`,
      '```',
    ].join('\n');

    const items = collectPendingConfirmations([{ page: 'overview', content }]);
    const kinds = Object.fromEntries(items.map(i => [i.kind, i]));

    expect(kinds.claim.text).toBe('ghostThing');
    expect(kinds.claim.context).toContain('`ghostThing`（待确认）');
    expect(kinds.note.text).toBe('本页为规则模板生成，未采集真实错误日志');
    expect(kinds.cell.text).toBe('变量 | 敏感 | 用途 · API_KEY');
    expect(kinds.prose.text).toContain('具体端口号待确认');
    expect(items.find(i => i.text.includes('fencedClaim'))).toBeUndefined();
  });

  it('被引用的证据文本不进队列：无 marker 的 claim 形态原文 / 表格行内的待确认字样', () => {
    const content = [
      // docstring 摘录引用了 claim 标注格式说明原文（无 marker）——不是待裁决问题
      '| 待确认项四种形态：claim：断言校验标注的 `` `标识符`（待确认） `` ——确认=移除标记 | 文件头自述 | src/knowledge/confirmation.ts:1 |',
      // git commit subject 含「待确认」（表格行）——不是待裁决问题
      '| `c7f1817d`（2026-09-28）feat: 使用证据分级消除待确认噪音 | commit | - |',
      // CLI help 文本（表格行）
      '| `--confirm` | Interactive confirmation pass for 待确认 items |',
    ].join('\n');
    const items = collectPendingConfirmations([{ page: 'architecture', content }]);
    expect(items).toHaveLength(0);
  });

  it('<details> 证据块与表格行外的 prose 误报豁免：块内行不收集', () => {
    const content = [
      '<details>',
      '<summary>Relevant source files</summary>',
      '',
      '内部注释摘录含 待确认 字样',
      '</details>',
    ].join('\n');
    expect(collectPendingConfirmations([{ page: 'a', content }])).toHaveLength(0);
  });

  it('跨页聚合：同一名言合并 pages 与出现次数', () => {
    const a = `引用 ${claimLine('ghostThing')} 一次。`;
    const b = `又见 ${claimLine('ghostThing')} 。`;
    const items = collectPendingConfirmations([
      { page: 'overview', content: a },
      { page: 'modules', content: `${b}\n${b}` },
    ]);
    const claim = items.find(i => i.kind === 'claim')!;
    expect(claim.pages).toEqual(['overview', 'modules']);
    expect(claim.occurrences).toBe(3);
    expect(claim.key).toBe('claim\nghostThing');
  });

  it('claim 行优先：同行的 cell/prose 形态不再重复立项', () => {
    const content = `断言 ${claimLine('ghostThing')}，用途 ⚠️ 待确认。`;
    const items = collectPendingConfirmations([{ page: 'a', content }]);
    expect(items.map(i => i.kind)).toEqual(['claim']);
  });

  it('cell key 带表头上下文：跨表同首列不误聚合', () => {
    const content = [
      '| 变量 | 用途 |',
      '| --- | --- |',
      '| SIZE | ⚠️ 待确认 |',
      '',
      '| 常量 | 值 |',
      '| --- | --- |',
      '| SIZE | ⚠️ 待确认 |',
    ].join('\n');
    const items = collectPendingConfirmations([{ page: 'a', content }])
      .filter(i => i.kind === 'cell');
    expect(items).toHaveLength(2);
    expect(new Set(items.map(i => i.key)).size).toBe(2);
  });
});

describe('applyConfirmations', () => {
  it('claim resolve 移除标记与 marker，keep 与未裁决保留（marker 由写盘前统一剥离）', () => {
    const content = `${claimLine('good')} 与 ${claimLine('bad')}。`;
    const out = applyConfirmations(content, decisionsOf({ key: 'claim\ngood' }));
    expect(out).toContain('`good`');
    expect(out).not.toContain('`good`（待确认）');
    expect(out).toContain('`bad`（待确认）');
    // keep/未裁决项的可见标记保留，marker 剥离后仍是合法正文
    expect(stripPendingMarkers(out)).toBe('`good` 与 `bad`（待确认）。');
  });

  it('cell resolve 填入确认内容；note resolve 移除提示行（或替换为补充说明）', () => {
    const content = [
      '| 变量 | 用途 |',
      '| --- | --- |',
      '| API_KEY | ⚠️ 待确认 |',
      '',
      '> ⚠️ **待确认**：未采集真实错误日志（证据不足，禁止猜测）',
    ].join('\n');
    const out = applyConfirmations(content, decisionsOf(
      { key: 'cell\n变量 | 用途 · API_KEY', kind: 'cell', replacement: 'LLM provider 鉴权' },
      { key: 'note\n未采集真实错误日志', kind: 'note' },
    ));
    expect(out).toContain('LLM provider 鉴权');
    expect(out).not.toContain('⚠️ 待确认');
    expect(out).not.toContain('**待确认**');

    const withNote = applyConfirmations(content, decisionsOf(
      { key: 'note\n未采集真实错误日志', kind: 'note', replacement: '已接入告警平台' },
    ));
    expect(withNote).toContain('> ✅ 已接入告警平台');
  });

  it('无效 replacement 按 keep 处理：密钥/反引号不配对/HTML 注释注入', () => {
    const content = [
      '| 变量 | 用途 |',
      '| --- | --- |',
      '| API_KEY | ⚠️ 待确认 |',
      '',
      '端口待确认（数据未提供）。',
    ].join('\n');
    const out = applyConfirmations(content, decisionsOf(
      { key: 'cell\n变量 | 用途 · API_KEY', kind: 'cell', replacement: '`sk-abcdefghijklmnopqrstuvwx`' },
      { key: 'prose\n端口待确认（数据未提供）。', kind: 'prose', replacement: '值 `unclosed' },
    ));
    expect(out).toContain('⚠️ 待确认'); // cell 保持
    expect(out).toContain('端口待确认'); // prose 保持
  });

  it('prose resolve 整行替换（须有 replacement）；无 replacement 时保持', () => {
    const content = '| 阶段 | 说明 |\n| --- | --- |\n具体端口号待确认（数据未提供）。\n正常行。';
    const out = applyConfirmations(content, decisionsOf(
      { key: 'prose\n具体端口号待确认（数据未提供）。', kind: 'prose', replacement: '端口为 8080。' },
    ));
    expect(out).toContain('端口为 8080。');
    expect(out).not.toContain('具体端口号待确认');
    expect(out).toContain('正常行。');

    const kept = applyConfirmations(content, decisionsOf(
      { key: 'prose\n具体端口号待确认（数据未提供）。', kind: 'prose' },
    ));
    expect(kept).toContain('具体端口号待确认');
  });

  it('fenced 代码块内的标记不受改写影响', () => {
    const content = '```ts\n// x（待确认）`ghost`（待确认）\n```';
    const out = applyConfirmations(content, decisionsOf({ key: 'claim\nghost' }));
    expect(out).toContain('`ghost`（待确认）');
  });

  it('空裁决集原样返回', () => {
    const content = claimLine('x');
    expect(applyConfirmations(content, new Map())).toBe(content);
  });
});

describe('validateReplacement', () => {
  it('拒绝密钥、反引号不配对、HTML 注释与超长输入', () => {
    expect(validateReplacement('正常确认文本 `code`。')).toBeNull();
    expect(validateReplacement('key: sk-abcdefghijklmnopqrstuvwx')).toContain('密钥');
    expect(validateReplacement('值 `unclosed')).toContain('反引号');
    expect(validateReplacement('注入 <!-- wiki:pending:claim:eHg -->')).toContain('HTML 注释');
    expect(validateReplacement('x'.repeat(601))).toContain('过长');
  });
});

describe('confirmations.json 持久化', () => {
  let agentDir: string;

  beforeEach(() => { agentDir = mkdtempSync(join(tmpdir(), 'confirm-store-')); });
  afterEach(() => { rmSync(agentDir, { recursive: true, force: true }); });

  it('缺失/损坏文件返回空集（fail-open）', () => {
    expect(loadConfirmedClaims(agentDir).size).toBe(0);
    writeFileSync(join(agentDir, 'confirmations.json'), '{broken', 'utf-8');
    expect(loadConfirmedClaims(agentDir).size).toBe(0);
  });

  it('合并写入：新增才落盘，读取回放为白名单', () => {
    expect(saveConfirmedClaims(agentDir, ['ghostThing'])).toBe(1);
    expect(saveConfirmedClaims(agentDir, ['ghostThing'])).toBe(0); // 重复不写
    expect(saveConfirmedClaims(agentDir, ['anotherOne', ''])).toBe(1); // 空串忽略

    const loaded = loadConfirmedClaims(agentDir);
    expect(loaded.has('ghostThing')).toBe(true);
    expect(loaded.has('anotherOne')).toBe(true);
    expect(loaded.size).toBe(2);

    const raw = JSON.parse(readFileSync(join(agentDir, 'confirmations.json'), 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.confirmed).toEqual(['anotherOne', 'ghostThing']); // 排序稳定
  });

  it('agentDir 不存在时自动创建', () => {
    const nested = join(agentDir, 'a/b');
    saveConfirmedClaims(nested, ['x']);
    expect(loadConfirmedClaims(nested).has('x')).toBe(true);
    mkdirSync(nested, { recursive: true }); // 幂等：已存在不报错
  });
});
