/**
 * 页首证据锚定块（DeepWiki grounding 机制的确定性实现）。
 *
 * 从页面 Context 递归提取真实源文件路径（过滤到扫描清单），按分层相关性排序
 * （正文引用 > 符号定义 > 意图证据 > 入口/代表文件 > 配置/文档兜底），
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

/** 配置/文档扩展名（兜底层：相关性最低） */
const CONFIG_EXT_RE = /\.(?:md|json|ya?ml|toml)$/;

/** 符号定义类字段名（T2：页面核心符号所在文件） */
const SYMBOL_FILE_KEYS = new Set([
  'file', 'filePath', 'callerFile', 'calleeFile', 'callFile', 'fromFile', 'toFile', 'target',
]);
/** 入口/代表文件类字段名（T4） */
const REPRESENTATIVE_KEYS = new Set(['entryFiles', 'files', 'importFiles', 'representativeFiles', 'refFiles']);
/** 配置/文档类字段名（T5） */
const CONFIG_KEYS = new Set(['docFiles', 'docsFiles', 'configPath', 'linterConfig', 'editorConfig', 'agentsMd']);

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

/** 递归提取 Context 内所有可追溯源文件（去重、排序、封顶；字典序，兼容旧口径） */
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

/** 正文引用文件提取：file.ts:line 锚点、Markdown 链接目标、反引号路径（归一化到清单） */
export function extractCitedFiles(
  body: string,
  knownFiles: ReadonlySet<string>,
  rootDir?: string,
): Set<string> {
  const cited = new Set<string>();
  for (const m of body.matchAll(/[`(\[]([\w.@-]+(?:\/[\w.@-]+)*\.[a-z]+)(?::\d+)?[`):\]]/g)) {
    const rel = toKnownRelativePath(m[1], knownFiles, rootDir);
    if (rel) cited.add(rel);
  }
  return cited;
}

/** 字段名 → 层级提示（未命中按扩展名分级） */
function tierOfKey(key: string, isConfigExt: boolean): number {
  if (SYMBOL_FILE_KEYS.has(key)) return 2;
  if (key === 'intent') return 3;
  if (CONFIG_KEYS.has(key)) return 5;
  if (REPRESENTATIVE_KEYS.has(key)) return 4;
  return isConfigExt ? 5 : 4;
}

/**
 * 分层相关性排序的 evidence 候选：
 * T1 正文实际引用文件（反向校正：页面叙述到的一定进 block）
 * T2 符号定义文件（symbols/stages/edges 的 file 字段）
 * T3 意图证据文件（intent[].target.file）
 * T4 入口/代表文件与其余源码路径
 * T5 配置/文档兜底（package.json/lockfile 等不再挤占名额）
 * 层内字典序（确定性），封顶 EVIDENCE_MAX_FILES。
 */
export function rankEvidenceFiles(
  ctx: unknown,
  bodyContent: string,
  knownFiles: ReadonlySet<string>,
  rootDir?: string,
): string[] {
  const tiers = new Map<string, number>();
  const add = (file: string, tier: number): void => {
    const prev = tiers.get(file);
    if (prev === undefined || tier < prev) tiers.set(file, tier);
  };

  // T1：正文引用置顶
  for (const f of extractCitedFiles(bodyContent, knownFiles, rootDir)) add(f, 1);

  // T3：意图证据子树独立采集（其 target.file 不按 SYMBOL_FILE_KEYS 升到 T2）
  const intent = (ctx as { intent?: unknown } | null)?.intent;
  if (intent !== undefined && intent !== null) {
    const visitIntent = (node: unknown): void => {
      if (node === null || node === undefined) return;
      if (typeof node === 'string') {
        const rel = toKnownRelativePath(node, knownFiles, rootDir);
        if (rel) add(rel, 3);
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) visitIntent(item);
        return;
      }
      if (typeof node === 'object') {
        for (const value of Object.values(node as Record<string, unknown>)) visitIntent(value);
      }
    };
    visitIntent(intent);
  }

  const visit = (node: unknown, tierHint: number): void => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string') {
      const rel = toKnownRelativePath(node, knownFiles, rootDir);
      if (rel) add(rel, tierHint);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, tierHint);
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === 'intent') continue; // 已独立采集
        const nextTier = tierOfKey(key, typeof value === 'string' && CONFIG_EXT_RE.test(value));
        visit(value, nextTier);
      }
    }
  };
  visit(ctx, 4);

  return [...tiers.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, EVIDENCE_MAX_FILES)
    .map(([f]) => f);
}

/** 锚定块文件清单解析（从已注入正文的 <details> 块内提取） */
export function parseEvidenceBlockFiles(content: string): Set<string> {
  const m = content.match(/<details>\s*<summary>Relevant source files<\/summary>\s*\n([\s\S]*?)<\/details>/);
  const files = new Set<string>();
  if (!m) return files;
  for (const line of m[1].split('\n')) {
    const t = line.trim();
    if (t.startsWith('- ')) files.add(t.slice(2));
  }
  return files;
}

/** 覆盖度：正文引用文件被锚定块覆盖的比例（gate 与构建报告用） */
export function evidenceCoverage(
  content: string,
  knownFiles: ReadonlySet<string>,
  rootDir?: string,
): { cited: number; covered: number; missing: string[] } {
  const blockFiles = parseEvidenceBlockFiles(content);
  const blockRange = content.match(/<details>\s*<summary>Relevant source files<\/summary>[\s\S]*?<\/details>/);
  const body = blockRange ? content.replace(blockRange[0], '') : content;
  const cited = extractCitedFiles(body, knownFiles, rootDir);
  const missing: string[] = [];
  let covered = 0;
  for (const f of cited) {
    if (blockFiles.has(f)) covered++;
    else missing.push(f);
  }
  return { cited: cited.size, covered, missing };
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
