import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { writeProducedPages } from '../../../src/services/wiki/write-phase.js';
import type { ProducedEntry } from '../../../src/services/wiki/types.js';
import type { VerificationHub } from '../../../src/services/wiki/verification.js';

const fakeVerify = {
  readSourceLine: () => null,
  readSourceFile: () => null,
  getSymbolIndex: () => ({ names: new Set<string>(), qualified: new Set<string>(), files: new Map<string, Set<string>>() }),
} as unknown as VerificationHub;

const body = (t: string) => `# ${t}\n\n正文内容足够长，不是空壳页面，包含一些说明文字。\n`;

describe('writeProducedPages 两遍写盘：Related 只链接终稿写出的页面', () => {
  let wikiDir: string;
  beforeEach(() => {
    wikiDir = join(mkdtempSync(join(tmpdir(), 'wiki-wp-')), '.wiki');
  });
  afterEach(() => {
    rmSync(dirname(wikiDir), { recursive: true, force: true });
  });

  it('闸门淘汰的页面不出现在兄弟页的 Related 同目录里', () => {
    const entries: ProducedEntry[] = [
      { page: 'api', relPath: '03-interface/api.md', source: 'fallback', content: body('API'), evidenceFiles: [] },
      // state 页带密钥 → secret 规则 error → 闸门淘汰
      { page: 'state', relPath: '03-interface/state.md', source: 'fallback', content: body('State') + '\nkey = "sk-abcdefghijklmnopqrstuvwxyz012345"\n', evidenceFiles: [] },
    ];
    const plannedPaths = new Set(entries.map(e => e.relPath));
    const result = writeProducedPages(wikiDir, 'full', entries, plannedPaths, new Set(), new Set(), fakeVerify);
    expect(result.writtenPages.map(p => p.page)).toEqual(['api']);
    expect(result.skippedPages).toHaveLength(1);
    const apiMd = readFileSync(join(wikiDir, '03-interface/api.md'), 'utf-8');
    expect(apiMd).not.toContain('state.md');
    expect(existsSync(join(wikiDir, '03-interface/state.md'))).toBe(false);
  });

  it('终稿集合内的兄弟页正常互链；仓库文件链接被归一化', () => {
    const entries: ProducedEntry[] = [
      { page: 'api', relPath: '03-interface/api.md', source: 'fallback', content: body('API') + '\n入口见 [src/main.ts](src/main.ts)。\n', evidenceFiles: [] },
      { page: 'state', relPath: '03-interface/state.md', source: 'fallback', content: body('State'), evidenceFiles: [] },
    ];
    // 预置仓库根文件，供归一化存在性检查
    mkdirSync(join(dirname(wikiDir), 'src'), { recursive: true });
    writeFileSync(join(dirname(wikiDir), 'src', 'main.ts'), 'export {}');
    const plannedPaths = new Set(entries.map(e => e.relPath));
    writeProducedPages(wikiDir, 'full', entries, plannedPaths, new Set(), new Set(), fakeVerify);
    const apiMd = readFileSync(join(wikiDir, '03-interface/api.md'), 'utf-8');
    expect(apiMd).toContain('state.md');
    expect(apiMd).toContain('[src/main.ts](../../src/main.ts)');
  });
});
