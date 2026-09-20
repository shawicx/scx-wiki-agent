/**
 * 页首证据锚定块（DeepWiki grounding 机制的确定性实现）。
 *
 * 从页面 Context 递归提取真实源文件路径（过滤到扫描清单），
 * 生成 <details> 折叠块注入页首。LLM 与规则路径统一由工具注入，
 * LLM 无法伪造锚定块内容。
 */

import { isAbsolute, relative } from 'node:path';

export const EVIDENCE_SUMMARY = 'Relevant source files';
/** 锚定块内文件数上限 */
export const EVIDENCE_MAX_FILES = 15;
/** structure 层页面证据下限（低于此值闸门告警 thin-evidence） */
export const EVIDENCE_MIN_FILES = 3;

/** 形如源文件路径的字符串（整体匹配，避免命中命令/签名等普通文本） */
const FILE_PATH_RE =
  /[\w.@-]+(?:\/[\w.@-]+)*\.(?:ts|tsx|js|jsx|mjs|cjs|cts|mts|py|go|java|rs|rb|php|cs|swift|kt|sql|md|json|ya?ml|toml)$/;

/** 归一化为扫描清单内的仓库相对路径；不在清单内返回 null */
export function toKnownRelativePath(
  value: string,
  knownFiles: ReadonlySet<string>,
  rootDir?: string,
): string | null {
  const s = value.trim();
  if (!FILE_PATH_RE.test(s)) return null;
  if (knownFiles.has(s)) return s;
  const stripped = s.replace(/^\.\//, '');
  if (knownFiles.has(stripped)) return stripped;
  if (rootDir && isAbsolute(s)) {
    const rel = relative(rootDir, s);
    if (knownFiles.has(rel)) return rel;
  }
  return null;
}

/** 递归提取 Context 内所有可追溯源文件（去重、排序、封顶） */
export function collectEvidenceFiles(
  ctx: unknown,
  knownFiles: ReadonlySet<string>,
  rootDir?: string,
): string[] {
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      const rel = toKnownRelativePath(node, knownFiles, rootDir);
      if (rel) found.add(rel);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node as Record<string, unknown>)) visit(value);
    }
  };
  visit(ctx);
  return [...found].sort().slice(0, EVIDENCE_MAX_FILES);
}

/** 生成页首锚定块；无证据文件时返回空串（不注入） */
export function buildEvidenceBlock(files: readonly string[]): string {
  if (files.length === 0) return '';
  return [
    '<details>',
    `<summary>${EVIDENCE_SUMMARY}</summary>`,
    '',
    ...files.map(f => `- ${f}`),
    '</details>',
  ].join('\n');
}

/** 注入到首个 # 标题之后；已存在锚定块时幂等返回原文 */
export function injectEvidenceBlock(content: string, block: string): string {
  if (!block || content.includes(`<summary>${EVIDENCE_SUMMARY}</summary>`)) return content;
  const lines = content.split('\n');
  const h1Idx = lines.findIndex(l => /^#\s/.test(l));
  if (h1Idx === -1) return `${block}\n\n${content}`;
  return [...lines.slice(0, h1Idx + 1), '', block, ...lines.slice(h1Idx + 1)].join('\n');
}
