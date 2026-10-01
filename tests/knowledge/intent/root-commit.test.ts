import { describe, it, expect } from 'vitest';
import type { GitCommitRef, GitRunner } from '../../../src/knowledge/intent/shared.js';
import { rootCommits, firstCommitOfFile, isShallowClone } from '../../../src/knowledge/intent/git.js';
import { IntentEvidenceProvider } from '../../../src/knowledge/intent-evidence.js';
import { GIT_LOG_LIMIT, REPO_LOG_LIMIT } from '../../../src/knowledge/intent/shared.js';
import type { ScanResult } from '../../../src/core/scanner.js';

const line = (hash: string, date: string, subject: string) => `${hash}\t${date}\t${subject}`;

function makeScanResult(): ScanResult {
  return {
    rootDir: '/fake-root', files: [], techStack: [], testTechStack: [],
    projectType: 'cli', hasTypeScript: true, sourceDirs: [],
    productionFiles: [], testFiles: [], fileCounts: { total: 0, production: 0, test: 0 },
  };
}

describe('rootCommits（真·root commit 查询）', () => {
  it('单 root：rev-list + show 解析', () => {
    const run: GitRunner = args => {
      if (args[0] === 'rev-list') return 'aaa1111\n';
      if (args[0] === 'show') return line('aaa1111', '2024-01-01', 'initial commit');
      return null;
    };
    const roots = rootCommits(run)!;
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ hash: 'aaa1111', date: '2024-01-01', subject: 'initial commit' });
  });

  it('多 root：取日期最旧', () => {
    const run: GitRunner = args => {
      if (args[0] === 'rev-list') return 'bbb2222\naaa1111\n';
      if (args[0] === 'show') return `${line('bbb2222', '2024-06-01', 'imported history')}\n${line('aaa1111', '2024-01-01', 'native root')}`;
      return null;
    };
    expect(rootCommits(run)![0].hash).toBe('aaa1111');
  });

  it('失败 fail-open 返回 null', () => {
    expect(rootCommits(() => null)).toBeNull();
    expect(rootCommits(args => (args[0] === 'rev-list' ? '' : null))).toBeNull();
  });

  it('isShallowClone / firstCommitOfFile', () => {
    expect(isShallowClone(args => (args[0] === 'rev-parse' ? 'true\n' : null))).toBe(true);
    expect(isShallowClone(args => (args[0] === 'rev-parse' ? 'false\n' : null))).toBe(false);
    expect(isShallowClone(() => null)).toBe(false);
    const first = firstCommitOfFile(args => {
      expect(args).toContain('--reverse');
      return line('fff0000', '2023-12-31', 'file born');
    }, 'src/a.ts');
    expect(first?.hash).toBe('fff0000');
    expect(firstCommitOfFile(() => null, 'src/a.ts')).toBeNull();
  });
});

describe('overviewIntent 首次提交口径（root / 降级）', () => {
  const subjects = [
    line('ddd4444', '2025-01-02', 'feat: add routes page'),
    line('ccc3333', '2025-01-01', 'feat: add routes page'),
    line('eee5555', '2025-01-03', 'chore: misc'),
  ];

  it('root 可用：输出「仓库首次提交」且锚点指向 root', () => {
    const run: GitRunner = args => {
      if (args[0] === 'rev-list') return 'aaa1111\n';
      if (args[0] === 'show') return line('aaa1111', '2024-01-01', 'initial commit');
      if (args[0] === 'rev-parse') return 'false\n';
      if (args[0] === 'log') return subjects.join('\n');
      return null;
    };
    const out = new IntentEvidenceProvider(makeScanResult(), { runGit: run }).overviewIntent([]);
    const first = out.find(e => e.text.startsWith('仓库首次提交'));
    expect(first?.text).toBe('仓库首次提交：initial commit');
    expect(first?.anchor).toBe('commit:aaa1111 (2024-01-01)');
    // 主题文案不再冒称全仓
    expect(out.some(e => e.text.startsWith(`近 ${REPO_LOG_LIMIT} 条提交高频主题`))).toBe(true);
    expect(out.some(e => e.text.startsWith('仓库高频提交主题'))).toBe(false);
  });

  it('shallow clone：降级为「近 400 条提交中最旧提交」，不冒称首次', () => {
    const run: GitRunner = args => {
      if (args[0] === 'rev-parse') return 'true\n';
      if (args[0] === 'log') return subjects.join('\n');
      return null;
    };
    const out = new IntentEvidenceProvider(makeScanResult(), { runGit: run }).overviewIntent([]);
    expect(out.some(e => e.text.startsWith('仓库首次提交'))).toBe(false);
    const degraded = out.find(e => e.text.startsWith(`近 ${REPO_LOG_LIMIT} 条提交中最旧提交`));
    expect(degraded?.text).toContain('feat: add routes page');
    expect(degraded?.anchor).toBe('commit:ccc3333 (2025-01-01)');
  });

  it('root 查询失败（rev-list 报错）：同样降级', () => {
    const run: GitRunner = args => {
      if (args[0] === 'rev-list') return null;
      if (args[0] === 'rev-parse') return 'false\n';
      if (args[0] === 'log') return subjects.join('\n');
      return null;
    };
    const out = new IntentEvidenceProvider(makeScanResult(), { runGit: run }).overviewIntent([]);
    expect(out.some(e => e.text.startsWith('仓库首次提交'))).toBe(false);
    expect(out.some(e => e.text.startsWith(`近 ${REPO_LOG_LIMIT} 条提交中最旧提交`))).toBe(true);
  });
});

describe('gitForFile 窗口截断修正', () => {
  const truncatedLog = Array.from({ length: GIT_LOG_LIMIT }, (_, i) =>
    line(`h${String(i).padStart(7, '0')}`, '2025-06-01', `commit ${i}`)).join('\n');

  it('截断且 --reverse 精查成功：first 为真首提交', () => {
    const run: GitRunner = args => {
      if (args[0] === 'log' && args.includes('--reverse')) return line('real000', '2023-01-01', 'file actually born');
      if (args[0] === 'log') return truncatedLog;
      return null;
    };
    const info = new IntentEvidenceProvider(makeScanResult(), { runGit: run }).gitForFile('src/a.ts')!;
    expect(info.count).toBe(GIT_LOG_LIMIT);
    expect(info.first?.hash).toBe('real000');
    expect(info.firstTruncated).toBeUndefined();
  });

  it('截断且精查失败：first=null + firstTruncated（窗口最旧绝不冒称首次）', () => {
    const run: GitRunner = args => {
      if (args[0] === 'log' && args.includes('--reverse')) return null;
      if (args[0] === 'log') return truncatedLog;
      return null;
    };
    const info = new IntentEvidenceProvider(makeScanResult(), { runGit: run }).gitForFile('src/a.ts')!;
    expect(info.first).toBeNull();
    expect(info.firstTruncated).toBe(true);
    // last（最近提交）不受影响
    expect(info.last?.hash).toBe('h0000000');
  });

  it('未截断（< 上限）：窗口最旧即真首次，不触发精查', () => {
    let reverseCalled = false;
    const run: GitRunner = args => {
      if (args[0] === 'log' && args.includes('--reverse')) { reverseCalled = true; return null; }
      if (args[0] === 'log') return `${line('new0001', '2025-06-01', 'new')}\n${line('old0001', '2024-01-01', 'old')}`;
      return null;
    };
    const info = new IntentEvidenceProvider(makeScanResult(), { runGit: run }).gitForFile('src/a.ts')!;
    expect(reverseCalled).toBe(false);
    expect(info.first?.hash).toBe('old0001');
    expect(info.firstTruncated).toBeUndefined();
  });
});

describe('磁盘缓存 rootCommit 兼容', () => {
  it('GitCacheData.rootCommit 类型往返（旧缓存缺字段 → undefined）', () => {
    const ref: GitCommitRef = { hash: 'aaa1111', date: '2024-01-01', subject: 'initial commit' };
    const round = JSON.parse(JSON.stringify({ rootCommit: ref })) as { rootCommit?: GitCommitRef };
    expect(round.rootCommit?.hash).toBe('aaa1111');
    const legacy = JSON.parse(JSON.stringify({})) as { rootCommit?: GitCommitRef };
    expect(legacy.rootCommit).toBeUndefined();
  });
});
