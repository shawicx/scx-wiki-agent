/** 模块级预聚合：文件→模块分组 + per-file git 挖掘（timeline/churn）。 */

import { matchPackageForFile } from '../../shared/utils.js';
import type { FileChurnInfo, FileGitInfo, GitCommitRef, ModuleGitInfo } from './shared.js';
import { extractThemes } from './git.js';

/** 文件按包名（段精确匹配）分组 */
export function groupFilesByModule(codeFiles: string[], pkgNames: string[]): Map<string, string[]> {
  const byModule = new Map<string, string[]>();
  for (const rel of codeFiles) {
    const pkg = matchPackageForFile(rel, pkgNames);
    if (!pkg) continue;
    const list = byModule.get(pkg) ?? [];
    list.push(rel);
    byModule.set(pkg, list);
  }
  return byModule;
}

export interface ModuleGitMining {
  timeline: ModuleGitInfo[];
  churn: FileChurnInfo[];
}

/** per-file git 挖掘（gitFiles 封顶；git 不可用时整条通道静默为空） */
export function mineModuleGit(
  byModule: Map<string, string[]>,
  gitFiles: ReadonlySet<string>,
  gitForFile: (rel: string) => FileGitInfo | null,
): ModuleGitMining {
  const timeline: ModuleGitInfo[] = [];
  const churnAll: FileChurnInfo[] = [];
  for (const [module, files] of byModule) {
    const subjects: string[] = [];
    let count = 0;
    let first: GitCommitRef | null = null;
    let last: GitCommitRef | null = null;
    for (const rel of files) {
      if (!gitFiles.has(rel)) continue;
      const info = gitForFile(rel);
      if (!info) continue;
      count += info.count;
      subjects.push(...info.subjects);
      churnAll.push({ file: rel, commitCount: info.count, last: info.last });
      if (!first || (info.first && info.first.date < first.date)) first = info.first;
      if (!last || (info.last && info.last.date > last.date)) last = info.last;
    }
    if (count > 0) {
      timeline.push({ module, commitCount: count, first, last, themes: extractThemes(subjects) });
    }
  }
  timeline.sort((a, b) => b.commitCount - a.commitCount);
  const churn = churnAll.sort((a, b) => b.commitCount - a.commitCount).slice(0, 20);
  return { timeline, churn };
}
