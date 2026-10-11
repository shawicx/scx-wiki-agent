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

/** Markdown 行内链接 `[label](target)`，target 为相对路径（.md 与非 .md 都匹配） */
const ANY_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * 仓库文件链接归一化：LLM 正文可能把仓库根相对路径直接当链接目标
 * （如子目录页里写 [src/main.ts](src/main.ts)，页内解析必死链）。
 * 判定口径：目标不含 `../`/协议/锚点，且按页面相对解析不存在于 wiki 内、
 * 按仓库根解析真实存在 → 按页面深度重写前缀（`01-overview/x.md` → `../../x`）。
 * 返回 [改写后内容, 改写数]。纯函数：存在性由注入的 resolveRepoFile 提供。
 */
export function normalizeRepoFileLinks(
  content: string,
  relPath: string,
  resolveRepoFile: (target: string) => boolean,
): [string, number] {
  // 页面在 .wiki 内的目录深度 + 1（回仓库根需先穿出 .wiki）
  const depth = relPath.split('/').length;
  const prefix = '../'.repeat(depth);
  let fixed = 0;
  const out = content.replace(ANY_LINK_RE, (match, label: string, target: string) => {
    if (target.startsWith('../') || target.startsWith('#') || /^[a-z]+:\/\//i.test(target)) return match;
    if (target.endsWith('.md')) return match; // wiki 页链接由 stripUnplannedPageLinks 处理
    if (!resolveRepoFile(target)) return match;
    fixed++;
    return `[${label}](${prefix}${target})`;
  });
  return [out, fixed];
}
