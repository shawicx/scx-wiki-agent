/**
 * 写盘前质量闸门（project-wiki 方法论「质量闸门」的代码化）。
 *
 * 规则与严重级：
 * - empty-shell    (error)：无正文空壳页。诚实标注"无数据"的页面（标题 +
 *   一句说明）不算空壳，只有完全没有非标题正文时才拦截。
 * - secret         (error)：疑似密钥/凭证值泄漏，拒绝写盘（LLM 路径降级规则生成）。
 * - dead-link      (warn) ：markdown 相对导航链接指向本次不产出的页面。
 * - broken-anchor  (warn) ：file:line 锚点无法在扫描文件清单中追溯到（R1 事后核验），
 *   含 `:0` 残缺锚点。
 * - thin-evidence  (warn) ：structure 层页面证据锚定块内源文件数不足下限
 *   （readme 索引页与 operations 配置驱动页豁免）。
 * - mermaid-ghost  (warn) ：Mermaid 图中引用扫描清单外的文件路径（防幽灵节点）。
 * - diagram-misuse (warn) ：sequenceDiagram 出现在 calls 页之外（R2 边表优于时序图）。
 *
 * error 拒绝写盘；warn 记入构建报告。纯函数，不做 I/O。
 */

import { posix } from 'node:path';
import { EVIDENCE_MIN_FILES, EVIDENCE_SUMMARY } from './wiki-evidence.js';

export type QualitySeverity = 'error' | 'warn';

export type QualityRule =
  | 'empty-shell'
  | 'secret'
  | 'dead-link'
  | 'broken-anchor'
  | 'thin-evidence'
  | 'mermaid-ghost'
  | 'diagram-misuse';

export interface QualityIssue {
  rule: QualityRule;
  severity: QualitySeverity;
  message: string;
}

/** 单页质量报告 */
export interface PageQualityReport {
  page: string;
  /** 无 error 级违规时为 true（warn 不拦截写盘） */
  passed: boolean;
  issues: QualityIssue[];
  /** 锚点核验统计 */
  anchors: { total: number; valid: number };
  /** 证据锚定块内源文件数 */
  evidence: number;
}

export interface ValidateOptions {
  page: string;
  /** 本页在 wiki 内的相对路径（用于解析页内相对链接），如 'readme.md' */
  pagePath: string;
  /** 仓库内真实文件相对路径集合（scanner 结果） */
  knownFiles: ReadonlySet<string>;
  /** 本次构建将写入的 wiki 相对路径集合（如 'overview.md'） */
  plannedPaths: ReadonlySet<string>;
  /** 页面层级（structure/operations/surface），thin-evidence 仅对 structure 生效 */
  tier?: string;
}

/** 密钥值特征（只报类别与行号，值不回显） */
const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bsk-[A-Za-z0-9_-]{20,}/g, label: 'OpenAI API Key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, label: 'GitHub Token' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS Access Key' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, label: 'Slack Token' },
  { re: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9+/=_-]{32,}['"]/gi, label: '疑似密钥赋值' },
];

/** file:line 锚点（源文件相对路径 + 行号） */
const ANCHOR_RE =
  /`?((?:[\w.@-]+\/)*[\w.@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|cts|mts|py|go|java|rs|rb|php|cs|swift|kt|sql)):(\d+)`?/g;

/** markdown 链接目标（尾随 #锚点 剥离） */
const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+?)(?:#[^)]*)?\)/g;

const HEADING_RE = /^#{1,6}\s/;

export function validatePageContent(content: string, opts: ValidateOptions): PageQualityReport {
  const issues: QualityIssue[] = [];
  const text = content.trim();

  checkEmptyShell(text, issues);
  checkSecrets(text, issues);
  const anchors = checkAnchors(text, opts, issues);
  checkDeadLinks(text, opts, issues);
  const evidence = checkThinEvidence(text, opts, issues);
  checkMermaid(text, opts, issues);

  return {
    page: opts.page,
    passed: !issues.some(i => i.severity === 'error'),
    issues,
    anchors,
    evidence,
  };
}

/** 空壳检测：无内容 / 无标题结构 / 仅有标题无正文 */
function checkEmptyShell(text: string, issues: QualityIssue[]): void {
  const nonEmpty = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (nonEmpty.length === 0) {
    issues.push({ rule: 'empty-shell', severity: 'error', message: '内容为空' });
    return;
  }
  const body = nonEmpty.filter(l => !HEADING_RE.test(l));
  if (body.length === nonEmpty.length) {
    issues.push({ rule: 'empty-shell', severity: 'error', message: '缺少 Markdown 标题结构' });
  } else if (body.length === 0) {
    issues.push({ rule: 'empty-shell', severity: 'error', message: '仅有标题无正文，判定为空壳页' });
  }
}

function checkSecrets(text: string, issues: QualityIssue[]): void {
  for (const { re, label } of SECRET_PATTERNS) {
    const m = text.match(re)?.[0];
    if (m === undefined) continue;
    const line = text.slice(0, text.indexOf(m)).split('\n').length;
    issues.push({ rule: 'secret', severity: 'error', message: `${label}（第 ${line} 行，值不回显）` });
  }
}

/** R1 事后核验：file:line 锚点是否可追溯到扫描文件清单 */
function checkAnchors(
  text: string,
  opts: ValidateOptions,
  issues: QualityIssue[],
): { total: number; valid: number } {
  let total = 0;
  let valid = 0;
  const zeroLine = new Set<string>();
  const unknown = new Set<string>();

  for (const m of text.matchAll(ANCHOR_RE)) {
    total++;
    const [path, line] = [m[1], m[2]];
    if (line === '0') {
      zeroLine.add(`${path}:0`);
    } else if (opts.knownFiles.has(path)) {
      valid++;
    } else {
      unknown.add(path);
    }
  }

  for (const z of zeroLine) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `残缺锚点（缺少行号）: ${z}` });
  }
  for (const u of unknown) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `锚点路径不在扫描文件清单中: ${u}` });
  }
  return { total, valid };
}

/** 相对导航链接完整性：.md 目标必须是本次产出页面或仓库真实文件 */
function checkDeadLinks(text: string, opts: ValidateOptions, issues: QualityIssue[]): void {
  const dead = new Set<string>();
  for (const m of text.matchAll(MD_LINK_RE)) {
    const target = m[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(target)) continue; // 外链 / 协议相对 / 页内锚点
    if (!target.endsWith('.md')) continue; // 只校验 markdown 导航链接
    const resolved = posix.normalize(posix.join(posix.dirname(opts.pagePath), target));
    if (opts.plannedPaths.has(resolved)) continue;
    if (opts.knownFiles.has(resolved) || opts.knownFiles.has(target)) continue;
    dead.add(target);
  }
  for (const d of dead) {
    issues.push({ rule: 'dead-link', severity: 'warn', message: `相对链接目标本次未产出: ${d}` });
  }
}

/** 锚定块（页首 <details>）内文件计数；structure 层低于下限时告警 */
const EVIDENCE_BLOCK_RE = new RegExp(
  `<summary>${EVIDENCE_SUMMARY}</summary>\\s*\\n([\\s\\S]*?)</details>`,
);

function checkThinEvidence(text: string, opts: ValidateOptions, issues: QualityIssue[]): number {
  const m = text.match(EVIDENCE_BLOCK_RE);
  const count = m ? (m[1].match(/^- /gm) ?? []).length : 0;
  const exempt = opts.tier !== 'structure' || opts.page === 'readme';
  if (!exempt && count < EVIDENCE_MIN_FILES) {
    issues.push({
      rule: 'thin-evidence',
      severity: 'warn',
      message: `证据锚定块仅 ${count} 个源文件（< ${EVIDENCE_MIN_FILES}），页面叙述依据可能不足`,
    });
  }
  return count;
}

/** Mermaid 图质量：幽灵文件节点 + sequenceDiagram 误用（R2） */
const MERMAID_BLOCK_RE = /```mermaid\s*\n([\s\S]*?)```/g;
const MERMAID_FILE_RE =
  /\b(?:[\w.@-]+\/)*[\w.@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|cts|mts|py|go|java|rs|rb|php|cs|swift|kt|sql)\b/g;

function checkMermaid(text: string, opts: ValidateOptions, issues: QualityIssue[]): void {
  for (const block of text.matchAll(MERMAID_BLOCK_RE)) {
    const body = block[1];
    if (/^\s*sequenceDiagram/m.test(body) && opts.page !== 'calls') {
      issues.push({
        rule: 'diagram-misuse',
        severity: 'warn',
        message: 'sequenceDiagram 仅允许出现在 calls 页（R2 边表优于时序图）',
      });
    }
    for (const f of body.matchAll(MERMAID_FILE_RE)) {
      if (!opts.knownFiles.has(f[0])) {
        issues.push({ rule: 'mermaid-ghost', severity: 'warn', message: `Mermaid 图引用未知文件: ${f[0]}` });
      }
    }
  }
}
