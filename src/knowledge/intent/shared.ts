/**
 * 意图证据共享层：类型、预算常量、文本清洗 helper。
 * 所有通道 fail-open：无 git / 无注释 / 无 docs → 对应证据为空，绝不阻断构建。
 * 预算钳制防 prompt 膨胀：单条文本 ≤240 字符、模块 ≤6 条、页 ≤14 条。
 */

/** 证据种类（锚点形态决定核验方式） */
export type IntentEvidenceKind =
  | 'file-header'    // 文件头块注释 = 模块自述
  | 'symbol-comment' // 符号定义行上方紧邻注释
  | 'why-marker'     // TODO/FIXME/HACK/NOTE/WHY/SAFETY/PERF/GOTCHA 标记
  | 'const-comment'  // 限制常量的注释（constraints 页直接受益）
  | 'git-commit'     // 单条提交主题（首提交=诞生动机）
  | 'git-theme'      // 模块级高频提交主题（频次 ≥2）
  | 'doc-section'    // README/docs 的 heading 小节
  | 'test-spec'      // describe/it/test 用例名（行为承诺）
  | 'git-churn';     // 高频变更信号（维护风险）

export interface IntentEvidence {
  kind: IntentEvidenceKind;
  target: { file?: string; line?: number; symbol?: string; module?: string };
  text: string;
  /** 'src/x.ts:12' / 'commit:abc1234 (2026-06-24)' / 'docs/x.md#标题' */
  anchor: string;
}

export interface GitCommitRef {
  hash: string;
  date: string;
  subject: string;
}

/** 单文件 git 聚合（首行=最新，末行=最旧） */
export interface FileGitInfo {
  count: number;
  first: GitCommitRef | null;
  last: GitCommitRef | null;
  subjects: string[];
  /** The log window may be truncated (count reaches the limit) and the precise first-commit lookup also failed: first has been set to null, do not treat the window's oldest as the "first commit" */
  firstTruncated?: boolean;
}

/** 模块级演进聚合（decisions 页主体数据） */
export interface ModuleGitInfo {
  module: string;
  commitCount: number;
  first: GitCommitRef | null;
  last: GitCommitRef | null;
  themes: string[];
}

export interface FileChurnInfo {
  file: string;
  commitCount: number;
  last: GitCommitRef | null;
}

/** git 子进程执行器（依赖注入便于测试）；失败返回 null */
export type GitRunner = (args: string[]) => string | null;

export const TEXT_CAP = 240;
export const MODULE_INTENT_CAP = 6;
export const PAGE_INTENT_CAP = 14;
export const GIT_FILE_CAP = 30;
export const GIT_LOG_LIMIT = 200;
export const GIT_TIMEOUT_MS = 15_000;
export const SYMBOL_COMMENTS_PER_FILE = 3;
export const WHY_MARKERS_PER_FILE = 5;
export const DOC_FILE_CAP = 12;
export const DOC_TOTAL_CAP = 16;
export const TITLES_PER_TEST_FILE = 10;
export const REPO_LOG_LIMIT = 400;
/** 全仓 churn 排名用 log 上限（--name-only 批量一次；只取相对频次，无需全历史） */
export const CHURN_LOG_LIMIT = 2000;

/** 意图候选文件统计（构建报告观测用：排序信号生效情况可回溯） */
export interface IntentCandidateStats {
  total: number;
  /** 进入 git 挖掘的前 GIT_FILE_CAP 个文件 */
  gitTop: string[];
  gitTopEntryCount: number;
  gitTopTestedCount: number;
}

export const WHY_MARKER_RE = /\b(TODO|FIXME|HACK|NOTE|WHY|SAFETY|PERF|GOTCHA|XXX)\b\s*[:：]?\s*(.*)/;

/** 限制常量定义行（与 ConfigDetector.detectConstraints 同口径，扩展 Rust const） */
export const CONST_DEF_RE =
  /(?:export\s+const|pub\s+const|const|let|var)\s+([A-Z0-9_]*(?:MAX|MIN|LIMIT|TIMEOUT|DEPTH|SIZE|COUNT|THRESHOLD|RETRY|CACHE)[A-Z0-9_]*)\s*(?::[^=]+)?=/;

/** 测试用例名提取（describe/it/test 的首参字符串） */
export const TEST_TITLE_RE = /(?:describe|it|test)\(\s*['"`]([^'"`\n]+)['"`]/;

export const ALL_KINDS = new Set<string>([
  'file-header', 'symbol-comment', 'why-marker', 'const-comment',
  'git-commit', 'git-theme', 'doc-section', 'test-spec', 'git-churn',
]);

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 清理注释标记（/** * \/、//、行首 #），压缩空白 */
export function cleanCommentText(raw: string): string {
  return raw
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/$/, '')
    .replace(/^\s*\/\/+/g, '')
    .replace(/^\s*\*? ?/g, '')
    .replace(/^\s*#+ ?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 证据文本截断 + 长令牌脱敏（防把密钥带进 prompt/页面） */
export function sanitizeText(raw: string): string {
  return raw
    .replace(/[A-Za-z0-9+/=_-]{40,}/g, '[REDACTED]')
    .slice(0, TEXT_CAP)
    .trimEnd();
}

export function commentContent(line: string): string | null {
  const t = line.trim();
  if (t.startsWith('//')) return t.slice(2);
  if (t.startsWith('/*')) return t.replace(/^\/\*\*?/, '').replace(/\*\/$/, '');
  if (t.startsWith('*')) return t.replace(/^\* ?/, '').replace(/\*\/$/, '');
  return null;
}

/** TS/JS 顶层定义行（symbol-comment 只锚定顶层，控制噪音与提取成本） */
export const TS_TOPLEVEL_DEF_RE =
  /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(function|class|const|let|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
export const RUST_TOPLEVEL_DEF_RE = /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(fn|struct|enum|trait|impl|const)\s+([A-Za-z_]\w*)/;

export function topLevelDef(line: string, domain: string | null): { name: string } | null {
  if (!domain) return null;
  const re = domain === 'rust' ? RUST_TOPLEVEL_DEF_RE : TS_TOPLEVEL_DEF_RE;
  const m = line.match(re);
  return m ? { name: m[2] } : null;
}

export function dedupeByAnchor(items: IntentEvidence[]): IntentEvidence[] {
  const seen = new Set<string>();
  return items.filter(e => {
    const key = `${e.kind}@${e.anchor}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 递归统计页面 Context 内的意图证据种类计数（构建报告「意图证据覆盖」用） */
export function countIntentEvidence(ctx: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  const visit = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (typeof obj.kind === 'string' && ALL_KINDS.has(obj.kind)
        && typeof obj.text === 'string' && typeof obj.anchor === 'string') {
        counts[obj.kind] = (counts[obj.kind] ?? 0) + 1;
      }
      for (const value of Object.values(obj)) visit(value);
    }
  };
  visit(ctx);
  return counts;
}
