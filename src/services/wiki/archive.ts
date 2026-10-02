/**
 * 构建产物归档：`.wiki` 是工具独占目录（full 构建整目录重建、预检跳页直接删除），
 * 高价值历史内容一旦掉出判定窗口就尸骨无存。本模块在被清除前把产物归档到
 * `.scx-wiki-agent/archive/<label>/`（label = HEAD 短哈希，无 git 时用时间戳），
 * 只保留最近 {@link KEEP_ARCHIVES} 份，绝不影响构建本身（fail-open）。
 */

import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'fs';
import { join } from 'path';

const KEEP_ARCHIVES = 5;

function archiveRoot(agentDir: string): string {
  return join(agentDir, 'archive');
}

function dirHasFiles(dir: string): boolean {
  if (!existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const name of readdirSync(cur)) {
      const p = join(cur, name);
      if (statSync(p).isFile()) return true;
      stack.push(p);
    }
  }
  return false;
}

/** 归档目录滚动清理：按名字（时间戳/哈希）倒序只保留最近 KEEP_ARCHIVES 份 */
function pruneArchives(root: string): void {
  if (!existsSync(root)) return;
  const entries = readdirSync(root)
    .filter(n => statSync(join(root, n)).isDirectory())
    .sort()
    .reverse();
  for (const name of entries.slice(KEEP_ARCHIVES)) {
    rmSync(join(root, name), { recursive: true, force: true });
  }
}

/**
 * full 模式整目录重建前归档现有 `.wiki`（空目录/不存在返回 null，不建空档）。
 * 任何 IO 异常都吞掉——归档绝不能阻断构建。
 */
export function archiveWikiDir(wikiDir: string, agentDir: string, label: string): string | null {
  try {
    if (!dirHasFiles(wikiDir)) return null;
    const dest = join(archiveRoot(agentDir), label, 'wiki');
    mkdirSync(join(dest, '..'), { recursive: true });
    cpSync(wikiDir, dest, { recursive: true });
    pruneArchives(archiveRoot(agentDir));
    return dest;
  } catch {
    return null;
  }
}

/**
 * 单页归档（预检跳页/主题淘汰时的“删除前留档”）：把旧页面文件移动到
 * `archive/<label>/dropped/` 下（保持相对路径）。失败返回 false（调用方回退直接删除）。
 */
export function archiveDroppedPage(
  wikiDir: string,
  relPath: string,
  agentDir: string,
  label: string,
): boolean {
  try {
    const src = join(wikiDir, relPath);
    if (!existsSync(src)) return false;
    const dest = join(archiveRoot(agentDir), label, 'dropped', relPath);
    mkdirSync(join(dest, '..'), { recursive: true });
    renameSync(src, dest);
    return true;
  } catch {
    return false;
  }
}
