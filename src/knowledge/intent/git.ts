/** git 证据 helper：子进程执行器、log 解析、主题提取、提交锚点。 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import type { GitCommitRef, GitRunner } from './shared.js';
import { CHURN_LOG_LIMIT, GIT_TIMEOUT_MS } from './shared.js';

/** git 子进程默认执行器（fail-open：无 git/超时/非仓库 → null） */
export function defaultGitRunner(rootDir: string): GitRunner {
  return args => {
    if (!existsSync(rootDir)) return null;
    try {
      return execFileSync('git', ['-C', rootDir, ...args], {
        encoding: 'utf-8',
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      return null;
    }
  };
}

/** 提交主题规范化：剥离 conventional-commit 前缀与 issue 引用，小写化 */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(?:revert: )?(?:feat|fix|refactor|docs|doc|test|tests|chore|style|perf|build|ci|release|wip)(?:\([^)]*\))?!?:\s*/i, '')
    .replace(/\s*\(#[\w-]+\)\s*$/g, '')
    .replace(/\s*#[\w/-]+\s*$/g, '')
    .trim()
    .toLowerCase();
}

/** 高频主题提取（频次 ≥2，取前 3） */
export function extractThemes(subjects: string[], top = 3): string[] {
  const freq = new Map<string, number>();
  for (const s of subjects) {
    const norm = normalizeSubject(s);
    if (norm.length < 4) continue;
    freq.set(norm, (freq.get(norm) ?? 0) + 1);
  }
  return [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([t, n]) => `${t}（×${n}）`);
}

export function commitAnchor(c: GitCommitRef): string {
  return `commit:${c.hash.slice(0, 8)} (${c.date})`;
}

export function parseGitLog(raw: string): GitCommitRef[] {
  const commits: GitCommitRef[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const [hash, date, ...rest] = t.split('\t');
    if (!hash || !date) continue;
    const subject = rest.join('\t').trim();
    if (!subject) continue;
    commits.push({ hash, date, subject: subject.slice(0, 120) });
  }
  return commits;
}

/**
 * 全仓 churn 计数：一次 `git log --name-only --format=` 批量调用统计每文件提交次数。
 * 比逐文件 log 便宜，且能给全部文件排序（不只截断后的 GIT_FILE_CAP 个）。
 * fail-open：git 失败返回 null（调用方静默降级为空信号）。
 */
export function countFileChurn(runGit: GitRunner): Map<string, number> | null {
  const raw = runGit(['log', '--no-merges', '--name-only', '--format=', '-n', `${CHURN_LOG_LIMIT}`]);
  if (raw === null) return null;
  const counts = new Map<string, number>();
  for (const line of raw.split('\n')) {
    const p = line.trim().replace(/\\/g, '/');
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}

/** True root commit: rev-list --max-parents=0 (multiple roots in historical merge repos → sorted by date ascending).
 *  fail-open: git failure / empty returns null; shallow clone truncation point is not the true first (caller detects and downgrades) */
export function rootCommits(runGit: GitRunner): GitCommitRef[] | null {
  const hashes = runGit(['rev-list', '--max-parents=0', 'HEAD']);
  if (hashes === null) return null;
  const list = hashes.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 50);
  if (list.length === 0) return null;
  const raw = runGit(['show', '-s', '--format=%H%x09%as%x09%s', ...list]);
  if (raw === null) return null;
  return parseGitLog(raw).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** True first commit of a file (precise lookup for gitForFile truncated files): git log --reverse -n 1 */
export function firstCommitOfFile(runGit: GitRunner, rel: string): GitCommitRef | null {
  const raw = runGit(['log', '--reverse', '--format=%H%x09%as%x09%s', '-n', '1', '--', rel]);
  if (raw === null) return null;
  return parseGitLog(raw)[0] ?? null;
}

/** shallow clone detection (truncation points returned by rev-list are not the true root) */
export function isShallowClone(runGit: GitRunner): boolean {
  const out = runGit(['rev-parse', '--is-shallow-repository']);
  return out !== null && out.trim() === 'true';
}
