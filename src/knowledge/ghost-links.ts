/**
 * 幽灵链接剥离：LLM 正文可能链接到「注册表里有名但本次未规划」的页面
 * （如无 vue-router 的项目里 routing 页被跳过，正文仍写 [routing](routing.md)）。
 *
 * dead-link 质量规则只 warn 不拦截——本模块在写盘前做确定性剥离：
 * 相对 `.md` 链接的目标名命中 PAGE_REGISTRY 页名（或 topic/章节页文件名）
 * 且不在本次 plannedPaths 中时，链接降格为纯文本（保留标签，去掉死链）。
 * 指向仓库真实文件的 `../` 链接与外链不受影响。
 */

import { PAGE_REGISTRY } from './page-registry.js';

/** Markdown 行内链接 `[label](target)`，target 为相对 .md 路径 */
const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+\.md)\)/g;

/** 计算剥离用的候选名集合（注册页名 + 主题/章节页文件名形态） */
function candidateNames(plannedPaths: ReadonlySet<string>): Set<string> {
  const names = new Set<string>();
  for (const p of PAGE_REGISTRY) names.add(`${p.name}.md`);
  // 主题页/章节页的文件名形态由 pageRelPath 决定；已规划的不在候选内
  for (const rel of plannedPaths) names.delete(rel.split('/').pop()!);
  return names;
}

/**
 * 剥离指向「已注册但未规划」页面的死链。返回 [改写后内容, 剥离数]。
 * 只处理同目录/子目录相对链接（不含 `../`、`http`、`#` 开头）。
 */
export function stripUnplannedPageLinks(
  content: string,
  plannedPaths: ReadonlySet<string>,
): [string, number] {
  const candidates = candidateNames(plannedPaths);
  if (candidates.size === 0) return [content, 0];
  let stripped = 0;
  const out = content.replace(MD_LINK_RE, (match, label: string, target: string) => {
    if (target.startsWith('../') || /^[a-z]+:\/\//i.test(target)) return match;
    const base = target.split('/').pop()!;
    if (!candidates.has(base)) return match;
    stripped++;
    return label;
  });
  return [out, stripped];
}
