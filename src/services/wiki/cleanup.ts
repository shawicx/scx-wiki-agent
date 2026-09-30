/** .wiki 目录治理（update 模式路径；full 模式整目录重建跳过）。 */

import { existsSync, readdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import {
  pageRelPath,
  isTopicPage,
  isChapterPage,
  TOPIC_DIR,
  CHAPTER_DIR,
  RETIRED_WIKI_PATHS,
  ownedNumberedDirs,
} from '../../knowledge/page-registry.js';

/**
 * 清理旧版扁平输出（wiki 根下的 ${page}.md）。
 * 只删除本工具拥有的页面文件；编号目录接管后这些扁平文件成为陈旧残留。
 * readme 特例：旧 'readme.md' 让位于 'README.md'。
 * 用目录条目精确比对文件名：大小写不敏感文件系统上 existsSync('readme.md')
 * 会误命中 'README.md'，导致每次构建都误删并重写 README。
 */
export function cleanupLegacyFlatFiles(wikiDir: string, pages: string[]): string[] {
  const removed: string[] = [];
  let entries: Set<string> | null = null;
  for (const page of pages) {
    const flat = `${page}.md`;
    if (pageRelPath(page) === flat) continue;
    if (entries === null) {
      try {
        entries = new Set(readdirSync(wikiDir));
      } catch {
        return removed;
      }
    }
    if (!entries.has(flat)) continue;
    rmSync(join(wikiDir, flat));
    removed.push(flat);
  }
  return removed;
}

/** 清理已退休页面路径的残留文件（改名/下线登记于 RETIRED_WIKI_PATHS）；清空的宿主目录一并移除 */
export function cleanupRetiredPages(wikiDir: string): string[] {
  const removed: string[] = [];
  for (const rel of RETIRED_WIKI_PATHS) {
    const target = join(wikiDir, rel);
    if (existsSync(target)) {
      rmSync(target);
      removed.push(rel);
      const dir = dirname(target);
      try {
        if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
      } catch {
        // 目录不存在或不可读则忽略
      }
    }
  }
  return removed;
}

/** 清理 08-topics 下未列入本次计划的主题文件（目录为工具所有） */
export function cleanupStaleTopicPages(wikiDir: string, pages: string[]): string[] {
  const topicDir = join(wikiDir, TOPIC_DIR);
  if (!existsSync(topicDir)) return [];
  const planned = new Set(pages.filter(isTopicPage).map(pageRelPath));
  const removed: string[] = [];
  for (const entry of readdirSync(topicDir)) {
    if (!entry.endsWith('.md') || planned.has(`${TOPIC_DIR}/${entry}`)) continue;
    rmSync(join(topicDir, entry));
    removed.push(`${TOPIC_DIR}/${entry}`);
  }
  return removed;
}

/** 清理 09-chapters 下未列入本次计划的章节页残留；清空的章目录与章节根目录一并移除（目录为工具所有） */
export function cleanupStaleChapterPages(wikiDir: string, pages: string[]): string[] {
  const chapterRoot = join(wikiDir, CHAPTER_DIR);
  if (!existsSync(chapterRoot)) return [];
  const planned = new Set(pages.filter(isChapterPage).map(pageRelPath));
  const removed: string[] = [];
  for (const chapterEntry of readdirSync(chapterRoot)) {
    const chapterDir = join(chapterRoot, chapterEntry);
    let entries: string[];
    try {
      entries = readdirSync(chapterDir);
    } catch {
      continue; // 非目录（用户文件）不动
    }
    let kept = 0;
    for (const file of entries) {
      const rel = `${CHAPTER_DIR}/${chapterEntry}/${file}`;
      if (file.endsWith('.md') && !planned.has(rel)) {
        rmSync(join(chapterDir, file));
        removed.push(rel);
      } else {
        kept++;
      }
    }
    if (kept === 0) rmSync(chapterDir, { recursive: true });
  }
  try {
    if (readdirSync(chapterRoot).length === 0) rmSync(chapterRoot, { recursive: true });
  } catch {
    // 目录不可读则保留
  }
  return removed;
}

/** 清理后扫描：清空的工具编号目录一并移除（update 模式下页面全部停写/剔除后的残留空目录） */
export function removeEmptyOwnedDirs(wikiDir: string): string[] {
  const removed: string[] = [];
  for (const dir of ownedNumberedDirs()) {
    const dirPath = join(wikiDir, dir);
    try {
      if (readdirSync(dirPath).length === 0) {
        rmSync(dirPath, { recursive: true });
        removed.push(`${dir}/`);
      }
    } catch {
      // 不存在或非目录则跳过
    }
  }
  return removed;
}

/**
 * 编号目录治理（update 模式路径；.wiki 为工具独占目录，full 模式已整目录重建）：
 * - 工具所有的编号目录（PAGE_REGISTRY 声明 + 08/09，后两者由专属清理负责，此处跳过）：
 *   目录内文件名落在注册页名空间（ALL_PAGE_NAMES）但未列入本次计划的 .md 视为
 *   旧版产物残留（如旧版章节页 01-overview/architecture.md），清理；
 *   页名空间之外的文件一并清理（目录为工具独占）。
 * - 白名单之外的编号目录：旧版/其他工具残留，直接删除（工具独占目录，不告警）。
 */
export function cleanupStaleNumberedDirFiles(wikiDir: string, pages: string[]): void {
  const planned = new Set(pages.map(pageRelPath));
  const owned = new Set(ownedNumberedDirs());
  let topEntries: string[];
  try {
    topEntries = readdirSync(wikiDir);
  } catch {
    return;
  }
  for (const entry of topEntries) {
    if (!/^\d{2}-/.test(entry)) continue;
    const dirPath = join(wikiDir, entry);
    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch {
      continue; // 非目录不动
    }
    if (entry === TOPIC_DIR || entry === CHAPTER_DIR) continue; // 专属清理负责
    if (owned.has(entry)) {
      for (const file of entries) {
        const rel = `${entry}/${file}`;
        // 目录为工具独占：未列入计划的 .md 一律清理，不区分页名空间
        if (file.endsWith('.md') && !planned.has(rel)) {
          rmSync(join(dirPath, file));
        }
      }
    } else {
      rmSync(dirPath, { recursive: true });
    }
  }
}
