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

  it('子目录页面内的相对链接按所在目录解析', () => {
    const content = '# Guide\n\n参见 [overview](../overview.md)。';
    const r = validatePageContent(content, { ...baseOpts, pagePath: '05-guides/onboarding.md' });
    expect(r.issues.some(i => i.rule === 'dead-link')).toBe(false);
  });
});
