import { describe, it, expect } from 'vitest';
import {
  collectEvidenceFiles,
  buildEvidenceBlock,
  injectEvidenceBlock,
  EVIDENCE_SUMMARY,
} from '../../src/knowledge/wiki-evidence.js';

const knownFiles = new Set([
  'src/index.ts',
  'src/services/wiki-service.ts',
  'src/knowledge/page-registry.ts',
  'README.md',
]);

describe('collectEvidenceFiles', () => {
  it('递归提取嵌套对象中的已知文件', () => {
    const ctx = {
      commands: [{ filePath: 'src/index.ts', description: 'x' }],
      modules: [{ files: ['src/services/wiki-service.ts', 'src/knowledge/page-registry.ts'] }],
    };
    expect(collectEvidenceFiles(ctx, knownFiles)).toEqual([
      'src/index.ts',
      'src/knowledge/page-registry.ts',
      'src/services/wiki-service.ts',
    ]);
  });

  it('过滤不在扫描清单内的路径与普通文本', () => {
    const ctx = {
      ghost: 'src/ghost.ts',
      signature: 'bar(): void',
      command: 'node dist/bin.js build --no-llm',
      doc: 'README.md',
    };
    expect(collectEvidenceFiles(ctx, knownFiles)).toEqual(['README.md']);
  });

  it('绝对路径按 rootDir 归一化为仓库相对路径', () => {
    const ctx = { file: '/repo/src/index.ts' };
    expect(collectEvidenceFiles(ctx, knownFiles, '/repo')).toEqual(['src/index.ts']);
    // rootDir 外的绝对路径丢弃
    expect(collectEvidenceFiles({ file: '/etc/passwd.ts' }, knownFiles, '/repo')).toEqual([]);
  });

  it('去重并封顶 15 个', () => {
    const many = Array.from({ length: 20 }, (_, i) => `src/mod${i}/file${i}.ts`);
    const big = new Set([...knownFiles, ...many]);
    const ctx = { files: [...many, 'src/index.ts', 'src/index.ts'] };
    const result = collectEvidenceFiles(ctx, big);
    expect(result.length).toBe(15);
    expect(new Set(result).size).toBe(15);
  });
});

describe('buildEvidenceBlock', () => {
  it('生成 details 折叠块', () => {
    const block = buildEvidenceBlock(['src/a.ts', 'src/b.ts']);
    expect(block).toBe(
      '<details>\n' +
      `<summary>${EVIDENCE_SUMMARY}</summary>\n` +
      '\n' +
      '- src/a.ts\n' +
      '- src/b.ts\n' +
      '</details>',
    );
  });

  it('无文件时返回空串', () => {
    expect(buildEvidenceBlock([])).toBe('');
  });
});

describe('injectEvidenceBlock', () => {
  const block = buildEvidenceBlock(['src/a.ts']);

  it('注入到首个 # 标题之后', () => {
    const result = injectEvidenceBlock('# Overview\n\n正文段落。', block);
    const lines = result.split('\n');
    expect(lines[0]).toBe('# Overview');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('<details>');
    expect(result).toContain('正文段落。');
  });

  it('无标题时前置注入', () => {
    const result = injectEvidenceBlock('只有正文。', block);
    expect(result.startsWith('<details>')).toBe(true);
    expect(result.endsWith('只有正文。')).toBe(true);
  });

  it('空块或已存在锚定块时幂等', () => {
    const content = '# Overview\n\n正文。';
    expect(injectEvidenceBlock(content, '')).toBe(content);
    const once = injectEvidenceBlock(content, block);
    expect(injectEvidenceBlock(once, block)).toBe(once);
  });
});
