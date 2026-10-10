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

/** 读取缓存；HEAD 不一致/不可读返回 null（fail-open，按无缓存继续）。
 *  head 参数：调用方已取定的 HEAD（竞态防护，见 provider 构造器）——传入则复用，不再自起子进程 */
export function loadIntentGitCache(
  agentDir: string | undefined,
  runGit: GitRunner,
  head?: string | null,
): GitCacheData | null {
  if (!agentDir) return null;
  try {
    const path = join(agentDir, 'cache', 'intent.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
      version?: number; head?: string; git?: Record<string, FileGitInfo>;
      repoSubjects?: GitCommitRef[]; rootCommit?: GitCommitRef | null;
    };
    if (raw.version !== 1 || typeof raw.head !== 'string') return null;
    const current = head ?? runGit(['rev-parse', 'HEAD']);
    if (current === null || current.trim() !== raw.head) return null;
    const gitByFile = new Map<string, FileGitInfo>();
    for (const [file, info] of Object.entries(raw.git ?? {})) {
      if (info && typeof info.count === 'number') gitByFile.set(file, info);
    }
    return { gitByFile, repoSubjects: raw.repoSubjects ?? [], rootCommit: raw.rootCommit };
  } catch {
    return null;
  }
}

/**
 * 写入缓存；失败静默（不影响构建）。
 * head 为**挖掘开始时**取定的 HEAD（调用方持有）——不在本函数内重取：
 * 构建期间的用户提交会使重取值晚于数据实际对应的 HEAD，导致下次构建
 * 整批复用错误的 commit 证据（竞态见 provider 构造器注释）。
 */
export function saveIntentGitCache(
  agentDir: string | undefined,
  head: string | null | undefined,
  gitByFile: ReadonlyMap<string, FileGitInfo | null>,
  repoSubjects: GitCommitRef[],
  rootCommit?: GitCommitRef | null,
): void {
  if (!agentDir) return;
  if (typeof head !== 'string' || head.trim().length === 0) return;
  try {
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
