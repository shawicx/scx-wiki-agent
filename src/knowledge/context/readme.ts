import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PAGE_REGISTRY, pageRelPath, isTopicPage, TOPIC_DIR, TOPIC_ANSWER, CHAPTER_DIR, CHAPTER_ANSWER, parseChapterPage } from '../page-registry.js';
import type { ReadmeContext } from '../types.js';
import type { ContextDeps } from './shared.js';

/**
 * README.md 数据源：文档索引（来自 PAGE_REGISTRY）+ 项目元数据（package.json）。
 * README 是 wiki 总入口，索引表必须覆盖全部文档。
 */
export function buildReadmeContext(deps: ContextDeps, plannedPages?: string[]): ReadmeContext {
  let projectName = '';
  let version = '';
  let license = '';
  let description = '';
  let runtime = '';

  try {
    const pkgPath = join(deps.scanResult.rootDir, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      projectName = pkg.name ?? '';
      version = pkg.version ?? '';
      license = pkg.license ?? '';
      description = pkg.description ?? '';
      runtime = pkg.type === 'module' ? 'ESM' : 'CJS';
    }
  } catch { /* ignore */ }

  const planned = plannedPages ?? PAGE_REGISTRY.map(p => p.name);
  const docIndex = PAGE_REGISTRY
    .filter(p => planned.includes(p.name) && p.name !== 'readme')
    .map(p => ({
      file: pageRelPath(p.name),
      dir: p.dir,
      tier: p.tier,
      answer: p.answer,
    }));

  // 主题页动态纳入索引（08-topics 组）
  for (const name of planned) {
    if (!isTopicPage(name)) continue;
    docIndex.push({ file: pageRelPath(name), dir: TOPIC_DIR, tier: 'structure', answer: TOPIC_ANSWER });
  }

  // 章节页动态纳入索引（09-chapters/<章> 组，answer 用页标题）
  for (const name of planned) {
    const ref = parseChapterPage(name);
    if (!ref) continue;
    const chapter = deps.outlineChapters.find(c => c.id === ref.chapter);
    const pg = chapter?.pages.find(p => p.id === ref.page);
    docIndex.push({
      file: pageRelPath(name),
      dir: `${CHAPTER_DIR}/${ref.chapter}`,
      tier: 'structure',
      answer: pg?.title ?? CHAPTER_ANSWER,
    });
  }

  // 仓库既有文档（根 README/AGENTS.md + docs/**.md）：标题取首个 # 行
  const relatedDocs: Array<{ path: string; title: string }> = [];
  for (const rel of ['README.md', 'AGENTS.md']) {
    if (deps.scanResult.productionFiles.some(f => f.relativePath === rel)) {
      relatedDocs.push({ path: rel, title: docTitleOf(deps, rel) ?? rel });
    }
  }
  for (const rel of deps.scanResult.productionFiles
    .map(f => f.relativePath)
    .filter(p => p.startsWith('docs/') && p.endsWith('.md'))
    .slice(0, 15 - relatedDocs.length)) {
    relatedDocs.push({ path: rel, title: docTitleOf(deps, rel) ?? rel });
  }

  return {
    projectName, version, license, description, runtime, docIndex,
    relatedDocs,
  };
}

/** 读 markdown 文件首个 # 标题（前 50 行内；失败返回 null） */
function docTitleOf(deps: ContextDeps, relPath: string): string | null {
  try {
    const content = readFileSync(join(deps.scanResult.rootDir, relPath), 'utf-8');
    for (const line of content.split('\n').slice(0, 50)) {
      const m = line.match(/^#\s+(.{1,80})/);
      if (m) return m[1].trim();
    }
    return null;
  } catch {
    return null;
  }
}
