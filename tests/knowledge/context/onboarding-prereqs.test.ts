import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readmePrereqSections } from '../../../src/knowledge/context/readme-prereqs.js';
import type { ContextDeps } from '../../../src/knowledge/context/shared.js';

describe('M6：README 前置小节提取（onboarding 证据通道）', () => {
  const depsOf = (root: string) => ({ scanResult: { rootDir: root } }) as never as ContextDeps;

  it('命中 前置/环境要求/安装 小节，携带 README.md#锚点与截断文本', () => {
    const dir = mkdtempSync(join(tmpdir(), 'readme-prereq-'));
    try {
      writeFileSync(join(dir, 'README.md'), [
        '# 项目',
        '',
        '## 功能',
        '无关小节。',
        '',
        '## 前置依赖',
        '',
        '- Node.js ≥ 18',
        '- pnpm ≥ 8',
        '',
        '## 安装',
        '',
        '```bash',
        'pnpm install',
        '```',
      ].join('\n'));
      const sections = readmePrereqSections(depsOf(dir));
      const titles = sections.map(s => s.title);
      expect(titles).toContain('前置依赖');
      expect(titles).toContain('安装');
      const prereq = sections.find(s => s.title === '前置依赖')!;
      expect(prereq.text).toContain('Node.js ≥ 18');
      expect(prereq.anchor).toBe('README.md#前置依赖');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('无命中/无 README → 空数组（fail-open，不诱发「数据未提供」填充行）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'readme-prereq-empty-'));
    try {
      writeFileSync(join(dir, 'README.md'), '# 项目\n\n只有功能介绍。\n');
      expect(readmePrereqSections(depsOf(dir))).toEqual([]);
      expect(readmePrereqSections(depsOf(dir + '-nope'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
