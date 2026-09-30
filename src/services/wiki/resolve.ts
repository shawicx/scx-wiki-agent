/** --pages 参数解析与页名合法性校验。 */

import {
  PAGE_REGISTRY,
  ALL_PAGE_NAMES,
  tier2PagesFor,
  isTopicPage,
  isChapterPage,
} from '../../knowledge/page-registry.js';

export interface PageResolutionDeps {
  projectType: string;
}

/**
 * 解析 --pages 参数，校验页名合法性。
 *
 * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）
 *   + 按 projectType 激活的 surface 层（Tier2）。
 * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。
 */
export function resolvePages(
  deps: PageResolutionDeps,
  requested: string[] | undefined,
  topicPages: string[],
  chapterPages: string[],
): string[] {
  const basePages = PAGE_REGISTRY
    .filter(p => p.tier !== 'surface')
    .map(p => p.name);
  const tier2 = tier2PagesFor(deps.projectType);
  const allPages = [...basePages, ...tier2, ...topicPages, ...chapterPages];

  if (!requested || requested.length === 0) {
    return allPages;
  }
  // 校验：过滤非法页名并告警（注册表页名与已锁定的 topic:<id> / chapter:<c>/<p> 均合法）
  const valid: string[] = [];
  for (const name of requested) {
    const legal = ALL_PAGE_NAMES.includes(name)
      || (isTopicPage(name) && topicPages.includes(name))
      || (isChapterPage(name) && chapterPages.includes(name));
    if (legal) {
      valid.push(name);
    } else {
      console.warn(`[wiki] 未知页面 "${name}"，已跳过。可用页面: ${ALL_PAGE_NAMES.join(', ')}${topicPages.length > 0 ? `，${topicPages.join(', ')}` : ''}${chapterPages.length > 0 ? `，${chapterPages.join(', ')}` : ''}`);
    }
  }
  return valid.length > 0 ? valid : allPages;
}
