import type { ScanResult } from '../../../src/core/scanner.js';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

export const tmpBase = join(process.cwd(), '.test-wiki-tmp');

export function makeBackendScanResult(): ScanResult {
  const files = [
    {
      absolutePath: '/tmp/test-project/src/index.ts',
      relativePath: 'src/index.ts',
      language: 'typescript' as const,
      extension: '.ts',
      size: 100,
      scope: 'production' as const,
    },
  ];
  return {
    rootDir: '/tmp/test-project',
    files,
    techStack: ['express', 'typescript'],
    testTechStack: [],
    projectType: 'backend',
    hasTypeScript: true,
    sourceDirs: ['src'],
    productionFiles: files,
    testFiles: [],
    fileCounts: { total: 1, production: 1, test: 0 },
  };
}

/** CLI 项目类型（匹配本项目），用于验证 Tier2 类型感知激活 */
export function makeCliScanResult(): ScanResult {
  return {
    ...makeBackendScanResult(),
    techStack: ['commander', 'typescript'],
    projectType: 'cli',
  };
}

/** 章节页测试共用：3 文件扫描清单 */
export function makeOutlineScanResult(): ScanResult {
  const scan = makeBackendScanResult();
  scan.files = [
    'src/index.ts', 'src/a.ts', 'src/b.ts',
  ].map(f => ({
    absolutePath: `/tmp/test-project/${f}`, relativePath: f,
    language: 'typescript' as const, extension: '.ts', size: 100,
    scope: 'production' as const,
  }));
  scan.productionFiles = scan.files;
  scan.testFiles = [];
  scan.fileCounts = { total: scan.files.length, production: scan.files.length, test: 0 };
  return scan;
}

/** 章节页测试共用：锁定 outline.json + 陈旧章节文件 fixture */
export function setupOutlineFixture(wikiDir: string, agentDir: string): void {
  mkdirSync(join(wikiDir, '09-chapters', 'terminal'), { recursive: true });
  writeFileSync(join(wikiDir, '09-chapters', 'terminal', 'stale.md'), '# stale', 'utf-8');
  mkdirSync(join(wikiDir, '09-chapters', 'ghost'), { recursive: true });
  writeFileSync(join(wikiDir, '09-chapters', 'ghost', 'orphan.md'), '# orphan', 'utf-8');
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, 'outline.json'), JSON.stringify({
    version: 1,
    generator: 'manual',
    generatedAt: '2026-09-22T00:00:00Z',
    chapters: [{
      id: 'terminal',
      title: '终端渲染',
      summary: '终端渲染子系统',
      pages: [
        { id: 'xterm', title: 'xterm 集成', brief: '说明 xterm 集成方式与 resize 适配。', files: ['src/index.ts', 'src/a.ts', 'src/b.ts'] },
      ],
    }],
  }), 'utf-8');
}
