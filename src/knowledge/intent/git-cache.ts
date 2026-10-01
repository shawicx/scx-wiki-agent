/** git 证据磁盘缓存（intent.json，HEAD 一致时整批复用；HEAD 变化重挖）。 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { FileGitInfo, GitCommitRef, GitRunner } from './shared.js';

export interface GitCacheData {
  gitByFile: Map<string, FileGitInfo>;
  repoSubjects: GitCommitRef[];
  /** 真·root commit（rev-list --max-parents=0）；旧缓存无此字段 → undefined 触发一次查询并回写 */
  rootCommit?: GitCommitRef | null;
}

/** 读取缓存；HEAD 不一致/不可读返回 null（fail-open，按无缓存继续） */
export function loadIntentGitCache(
  agentDir: string | undefined,
  runGit: GitRunner,
): GitCacheData | null {
  if (!agentDir) return null;
  try {
    const path = join(agentDir, 'cache', 'intent.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
      version?: number; head?: string; git?: Record<string, FileGitInfo>;
      repoSubjects?: GitCommitRef[]; rootCommit?: GitCommitRef | null;
    };
    if (raw.version !== 1 || typeof raw.head !== 'string') return null;
    const head = runGit(['rev-parse', 'HEAD']);
    if (head === null || head.trim() !== raw.head) return null;
    const gitByFile = new Map<string, FileGitInfo>();
    for (const [file, info] of Object.entries(raw.git ?? {})) {
      if (info && typeof info.count === 'number') gitByFile.set(file, info);
    }
    return { gitByFile, repoSubjects: raw.repoSubjects ?? [], rootCommit: raw.rootCommit };
  } catch {
    return null;
  }
}

/** 写入缓存；失败静默（不影响构建） */
export function saveIntentGitCache(
  agentDir: string | undefined,
  runGit: GitRunner,
  gitByFile: ReadonlyMap<string, FileGitInfo | null>,
  repoSubjects: GitCommitRef[],
  rootCommit?: GitCommitRef | null,
): void {
  if (!agentDir) return;
  try {
    const head = runGit(['rev-parse', 'HEAD']);
    if (head === null) return;
    const git: Record<string, FileGitInfo> = {};
    for (const [file, info] of gitByFile) {
      if (info) git[file] = info;
    }
    mkdirSync(join(agentDir, 'cache'), { recursive: true });
    writeFileSync(join(agentDir, 'cache', 'intent.json'), JSON.stringify({
      version: 1,
      head: head.trim(),
      git,
      repoSubjects,
      ...(rootCommit !== undefined ? { rootCommit } : {}),
    }), 'utf-8');
  } catch {
    // 写缓存失败不影响构建
  }
}
