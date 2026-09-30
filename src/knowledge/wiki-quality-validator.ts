/**
 * 写盘前质量闸门（project-wiki 方法论「质量闸门」的代码化）。
 *
 * 规则与严重级：
 * - empty-shell    (error)：无正文空壳页。诚实标注"无数据"的页面（标题 +
 *   一句说明）不算空壳，只有完全没有非标题正文时才拦截。
 * - secret         (error)：疑似密钥/凭证值泄漏，拒绝写盘（LLM 路径降级规则生成）。
 * - dead-link      (warn) ：markdown 相对导航链接指向本次不产出的页面。
 * - broken-anchor  (warn) ：file:line 锚点无法在扫描文件清单中追溯到（R1 事后核验），
 *   含 `:0` 残缺锚点；注入 readFileLine 时 additionally 校验行号范围与锚点-符号
 *   关联（符号唯一解析但定义文件不含锚点文件时告警）；注入 readFile 时校验
 *   docs/foo.md#标题 文档锚点与页内 #fragment 链接的目标存在性。
 * - claim-support  (warn) ：正文事实句（含反引号标识符的行）中带证据锚点或
 *   「推断」标注的比例过低（<50% 且事实句 ≥5）。
 * - thin-evidence  (warn) ：structure 层页面证据锚定块内源文件数不足下限
 *   （readme 索引页与 operations 配置驱动页豁免）。
 * - mermaid-ghost  (warn) ：Mermaid 图中引用扫描清单外的文件路径（防幽灵节点）。
 * - diagram-misuse (warn) ：sequenceDiagram 出现在 calls 页之外（R2 边表优于时序图）。
 * - unanchored-rationale (warn)：动机/设计/演进类小节零证据锚点（R7 事后核验：
 *   file:line 与 commit 哈希+日期均无）。
 * - incomplete-page (warn/error)：疑似截断残页（未闭合代码块 / 末尾表格残行）。
 *   默认 warn；当生成期已知该页续写后仍截断（opts.truncated）时升级为 error，
 *   拒绝写盘并降级规则路径重建。
 * - unanchored-dependency (warn)：tech-stack 页核心/开发/测试依赖表格行缺
 *   import 点锚点（R3 事后核验：依赖"用途"须有 import 点佐证，不能只报名字）。
 *
 * error 拒绝写盘；warn 记入构建报告。纯函数，不做 I/O。
 */

import { posix } from 'node:path';
import { EVIDENCE_MIN_FILES, EVIDENCE_SUMMARY } from './wiki-evidence.js';
import { endsWithIncompleteTableRow, hasUnclosedFence } from './wiki-continuation.js';
import { isCommentLine } from './claim-verifier.js';

export type QualitySeverity = 'error' | 'warn';

export type QualityRule =
  | 'empty-shell'
  | 'secret'
  | 'dead-link'
  | 'broken-anchor'
  | 'thin-evidence'
  | 'mermaid-ghost'
  | 'diagram-misuse'
  | 'unanchored-rationale'
  | 'incomplete-page'
  | 'unanchored-dependency'
  | 'claim-support';

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
  /** 锚点核验统计（分类需注入 readFileLine，未注入时分类为 0） */
  anchors: { total: number; valid: number; outOfRange: number; comment: number; doc: number; usage: number };
  /** 证据锚定块内源文件数 */
  evidence: number;
  /** 事实句支撑率（claim-support 度量） */
  claimSupport: { factual: number; supported: number; unsupportedSample: string[] };
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
  /** 生成期事实：该页续写耗尽轮数后仍截断（incomplete-page 由 warn 升级为 error） */
  truncated?: boolean;
  /** 注入式源码行读取（保持纯函数契约）：返回 null = 不可读/行号超范围 */
  readFileLine?: (file: string, line: number) => string | null;
  /** 注入式整文件读取（文档锚点 heading 解析用）：返回 null = 不可读 */
  readFile?: (file: string) => string | null;
  /** 简名 → 定义文件集（getSymbolIndex 产物）：锚点-符号关联核验用 */
  symbolFiles?: ReadonlyMap<string, ReadonlySet<string>>;
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
  checkFragmentLinks(text, opts, issues);
  const evidence = checkThinEvidence(text, opts, issues);
  checkMermaid(text, opts, issues);
  checkUnanchoredRationale(text, issues);
  checkIncompletePage(text, opts, issues);
  checkUnanchoredDependency(text, opts, issues);
  const claimSupport = checkClaimSupport(text, issues);

  return {
    page: opts.page,
    passed: !issues.some(i => i.severity === 'error'),
    issues,
    anchors,
    evidence,
    claimSupport,
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
  const found = findSecretDetail(text);
  if (found) {
    issues.push({ rule: 'secret', severity: 'error', message: `${found.label}（第 ${found.line} 行，值不回显）` });
  }
}

/** 密钥探测（供确认层 replacement 复核复用）：返回类别与行号，无命中返回 null */
export function findSecretDetail(text: string): { label: string; line: number } | null {
  for (const { re, label } of SECRET_PATTERNS) {
    const m = text.match(re)?.[0];
    if (m === undefined) continue;
    const line = text.slice(0, text.indexOf(m)).split('\n').length;
    return { label, line };
  }
  return null;
}

/** R1 事后核验：file:line 锚点是否可追溯到扫描文件清单。
 *  LLM 常写短文件名（如 signing.rs）：basename 在扫描清单内唯一可解析时视为有效锚点
 *  （指向无歧义），仅多义/全无命中才告警。
 *  注入 readFileLine 时升级为「真锚点」核验：行号范围 + 锚点-符号关联 +
 *  分类统计（comment/doc/usage）；注入 readFile 时校验 docs/foo.md#标题 目标。 */
function checkAnchors(
  text: string,
  opts: ValidateOptions,
  issues: QualityIssue[],
): { total: number; valid: number; outOfRange: number; comment: number; doc: number; usage: number } {
  let total = 0;
  let valid = 0;
  let outOfRange = 0;
  let comment = 0;
  let doc = 0;
  let usage = 0;
  const zeroLine = new Set<string>();
  const unknown = new Set<string>();
  const outOfRangeSet = new Set<string>();
  const mismatched = new Set<string>();
  const docMissing = new Set<string>();
  const byBasename = new Map<string, number>();
  const byBasenamePath = new Map<string, string>();
  for (const f of opts.knownFiles) {
    const base = f.slice(f.lastIndexOf('/') + 1);
    byBasename.set(base, (byBasename.get(base) ?? 0) + 1);
    byBasenamePath.set(base, f);
  }
  const lineRe = new RegExp(ANCHOR_RE.source, 'g');
  const docRe = new RegExp(DOC_ANCHOR_RE.source, 'gi');

  let inFence = false;
  for (const rawLine of text.split('\n')) {
    if (/^\s*```/.test(rawLine)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const line = rawLine;

    // 行内反引号标识符（锚点-符号关联用）
    const tickNames = new Set<string>();
    for (const t of line.matchAll(/`([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)`/g)) {
      tickNames.add(t[1].split('.').pop()!);
    }

    for (const m of line.matchAll(lineRe)) {
      total++;
      const [path, lineNo] = [m[1], m[2]];
      if (lineNo === '0') {
        zeroLine.add(`${path}:0`);
        continue;
      }
      // 解析锚点文件（全路径 > 唯一 basename > 不可解析）
      let resolved: string | null = null;
      if (opts.knownFiles.has(path)) {
        resolved = path;
      } else if (!path.includes('/') && byBasename.get(path) === 1) {
        resolved = byBasenamePath.get(path) ?? null;
      }
      if (resolved === null) {
        unknown.add(path);
        continue;
      }
      valid++;

      if (opts.readFileLine) {
        const content = opts.readFileLine(resolved, Number(lineNo));
        if (content === null) {
          outOfRange++;
          outOfRangeSet.add(`${path}:${lineNo}`);
        } else if (isCommentLine(content, resolved)) {
          comment++; // 注释锚点：R7 允许，仅统计分布
        } else {
          usage++;
        }
        // 锚点-符号关联：行内标识符唯一解析到定义文件集、而锚点文件不在其中
        if (opts.symbolFiles) {
          for (const name of tickNames) {
            const defFiles = opts.symbolFiles.get(name);
            if (defFiles && defFiles.size > 0 && !defFiles.has(resolved!)) {
              mismatched.add(`${name} @ ${path}:${lineNo}（定义于 ${[...defFiles].slice(0, 2).join('、')}）`);
            }
          }
        }
      }
    }

    // 文档锚点 docs/foo.md#标题：目标文件可读时校验 heading slug 存在性
    if (opts.readFile) {
      for (const m of line.matchAll(docRe)) {
        const anchor = m[0];
        const hashIdx = anchor.indexOf('#');
        const docPath = anchor.slice(0, hashIdx);
        const frag = anchor.slice(hashIdx + 1);
        if (!opts.knownFiles.has(docPath)) continue;
        doc++;
        const docContent = opts.readFile(docPath);
        if (docContent === null) continue;
        const slugs = headingSlugs(docContent);
        if (!slugs.has(frag) && !slugs.has(decodeURIComponent(frag))) {
          docMissing.add(anchor);
        }
      }
    }
  }

  for (const z of zeroLine) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `残缺锚点（缺少行号）: ${z}` });
  }
  for (const u of unknown) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `锚点路径不在扫描文件清单中: ${u}` });
  }
  for (const o of outOfRangeSet) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `锚点行号超出文件范围: ${o}` });
  }
  for (const mm of [...mismatched].slice(0, 5)) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `锚点文件与符号定义文件不符: ${mm}` });
  }
  for (const d of [...docMissing].slice(0, 5)) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `文档锚点目标不存在: ${d}` });
  }
  return { total, valid, outOfRange, comment, doc, usage };
}

/**
 * GitHub 风格 heading slug（中文保留）：小写 ASCII、去标点（保留连字符/下划线/
 * 字母数字/中日韩文字）、空格→连字符。纯函数，供文档锚点与页内 fragment 校验。
 */
export function headingSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** 文档内容 → 全部 heading slug 集合 */
function headingSlugs(docContent: string): Set<string> {
  const slugs = new Set<string>();
  for (const line of docContent.split('\n')) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) slugs.add(headingSlug(m[1]));
  }
  return slugs;
}

/** 页内 fragment 链接（[文本](#锚点)）：目标 heading 必须存在于本页 */
function checkFragmentLinks(text: string, opts: ValidateOptions, issues: QualityIssue[]): void {
  const slugs = headingSlugs(text);
  const dead = new Set<string>();
  for (const m of text.matchAll(/\]\(#([^)]+)\)/g)) {
    const frag = m[1];
    if (!slugs.has(frag) && !slugs.has(decodeURIComponent(frag))) dead.add(frag);
  }
  for (const d of dead) {
    issues.push({ rule: 'broken-anchor', severity: 'warn', message: `页内锚链接目标不存在: #${d}` });
  }
}

/**
 * 事实句支撑率（claim-support，warn）：
 * 事实句 = 围栏外、非标题/表头分隔行、含 ≥1 个反引号标识符的行（表格行按行计，
 * 表格是声明密集区）；支撑 = 同行含 file:line / commit / 文档锚点，或诚实标注
 * 「推断」（R5 降级计为已处理）。事实句 ≥5 且支撑率 <50% 时告警。
 */
function checkClaimSupport(text: string, issues: QualityIssue[]): { factual: number; supported: number; unsupportedSample: string[] } {
  let factual = 0;
  let supported = 0;
  const unsupported: string[] = [];
  let inFence = false;
  for (const rawLine of text.split('\n')) {
    if (/^\s*```/.test(rawLine)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const line = rawLine.trim();
    if (line === '' || HEADING_RE.test(line)) continue;
    if (/^\|?[\s:|-]*\|?$/.test(line)) continue; // 表头分隔行/空表行
    if (!/`[A-Za-z_$][\w$.-]{2,}`/.test(line)) continue; // 无标识符声明，非事实句
    factual++;
    const anchored = ANCHOR_TEST_RE.test(line)
      || COMMIT_ANCHOR_RE.test(line)
      || DOC_ANCHOR_RE.test(line)
      || line.includes('推断');
    if (anchored) {
      supported++;
    } else {
      unsupported.push(line.slice(0, 60));
    }
  }
  if (factual >= 5 && supported * 2 < factual) {
    issues.push({
      rule: 'claim-support',
      severity: 'warn',
      message: `事实句支撑率 ${supported}/${factual}（<50%）：${unsupported.slice(0, 3).map(s => `「${s}」`).join('')}${unsupported.length > 3 ? ' 等' : ''}`,
    });
  }
  return { factual, supported, unsupportedSample: unsupported.slice(0, 5) };
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
    // 指向 wiki 目录外的仓库文件（如根 README 页链接 ../README.md、../docs/x.md）：
    // 剥离前导 ../ 后按仓库相对路径核对
    const repoRelative = resolved.replace(/^(?:\.\.\/)+/, '');
    if (repoRelative !== resolved && opts.knownFiles.has(repoRelative)) continue;
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

/** commit 证据锚点：`commit:abc12345 (2026-06-24)` / `\`abc12345\`（2026-06-24）` 等变体 */
const COMMIT_ANCHOR_RE = /commit[:：]?\s*[0-9a-f]{7,40}\b|\b[0-9a-f]{7,40}\b`?\s*[（(]\s*\d{4}-\d{2}-\d{2}/;

/** 文档小节证据锚点：`docs/design/adr.md#决策`（文件路径 + # 标题） */
const DOC_ANCHOR_RE = /[\w.@-]+(?:\/[\w.@-]+)*\.[a-z0-9]+#[^\s|，。)）]+/i;

/** 无 g 标志的锚点探测副本（test 不留 lastIndex 状态，避免跨小节误判） */
const ANCHOR_TEST_RE = new RegExp(ANCHOR_RE.source);

/** 动机类小节标题特征（R7 事后核验的作用域） */
const RATIONALE_SECTION_RE = /设计|动机|理由|缘由|演进|决策|依据|由来/;

/** R7 事后核验：动机/设计/演进类小节内须至少出现一个 file:line 或 commit 锚点。
 *  只对 LLM 页面有约束意义，但对规则页同样无害（规则页的意图证据表自带锚点）。 */
function checkUnanchoredRationale(text: string, issues: QualityIssue[]): void {
  const lines = text.split('\n');
  const sectionStarts: Array<{ title: string; from: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.{1,60})/);
    if (m) sectionStarts.push({ title: m[1].trim(), from: i });
  }
  for (let s = 0; s < sectionStarts.length; s++) {
    const { title, from } = sectionStarts[s];
    if (!RATIONALE_SECTION_RE.test(title)) continue;
    const end = s + 1 < sectionStarts.length ? sectionStarts[s + 1].from : lines.length;
    const body = lines.slice(from + 1, end).join('\n');
    if (body.trim() === '') continue;
    if (ANCHOR_TEST_RE.test(body) || COMMIT_ANCHOR_RE.test(body) || DOC_ANCHOR_RE.test(body)) continue;
    issues.push({
      rule: 'unanchored-rationale',
      severity: 'warn',
      message: `动机类小节「${title}」未引用任何 file:line 或 commit 证据（R7），叙述可能为无据推断`,
    });
  }
}

/**
 * 截断残页检测（结构性信号，与生成期事实无关、常开）：
 * - 未闭合代码块（围栏计数为奇数，后续内容会被吞进代码块）；
 * - 末尾表格残行（流死在表格行中间）。
 * 默认 warn（写入报告）；opts.truncated（续写耗尽后仍截断的生成期事实）时升级为
 * error —— 拒绝写盘，由上层降级规则路径确定性重建完整页面。
 * 悬空句子/缺失小节等启发式信号误报率高，不检测（诚实优于噪音）。
 */
function checkIncompletePage(text: string, opts: ValidateOptions, issues: QualityIssue[]): void {
  const lines = text.split('\n');
  const signals: string[] = [];
  if (hasUnclosedFence(lines)) signals.push('未闭合代码块');
  if (endsWithIncompleteTableRow(lines)) signals.push('末尾表格残行');
  if (signals.length === 0) return;
  issues.push({
    rule: 'incomplete-page',
    severity: opts.truncated ? 'error' : 'warn',
    message: `疑似截断残页（${signals.join('、')}）${opts.truncated ? '：续写耗尽后仍截断' : ''}`,
  });
}

/** 需要逐行 import 点锚点的依赖小节（R3：用途须有 import 点佐证；「声明未用」小节豁免） */
const DEPENDENCY_SECTIONS = ['核心依赖', '开发依赖', '测试专用依赖'];

/** 表格行内的 import 点锚点特征：源文件路径（扩展名 ≥2 字母，点前须含字母，排除版本号）或 file:line */
const IMPORT_ANCHOR_RE = /[\w.@-]*[A-Za-z][\w.@-]*\.[A-Za-z]{2,4}\b(?::\d+)?/;

/**
 * R3 事后核验（tech-stack 页专用）：核心/开发/测试依赖小节的表格行必须携带
 * import 点锚点（源文件路径或 file:line）。依赖"用途/选型"只有名字没有 import
 * 点佐证的，提示读者该行叙述可能缺实据。只影响 tech-stack 页，warn 不拦截。
 */
function checkUnanchoredDependency(text: string, opts: ValidateOptions, issues: QualityIssue[]): void {
  if (opts.page !== 'tech-stack') return;
  const lines = text.split('\n');
  const sectionStarts: Array<{ title: string; from: number; to: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.{1,40})/);
    if (m) sectionStarts.push({ title: m[1].trim(), from: i, to: lines.length });
  }
  for (let s = 0; s < sectionStarts.length; s++) {
    sectionStarts[s].to = s + 1 < sectionStarts.length ? sectionStarts[s + 1].from : lines.length;
  }
  const missing: string[] = [];
  for (const { title, from, to } of sectionStarts) {
    if (!DEPENDENCY_SECTIONS.some(t => title.includes(t))) continue;
    for (let i = from + 1; i < to; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      // 表头分隔行（|---|---|）与表头行（含「依赖」「版本」字样）跳过
      if (cells.length === 0 || cells.every(c => /^:?-{2,}:?$/.test(c))) continue;
      if (cells.some(c => c.includes('依赖') || c.includes('版本') || c.includes('import'))) continue;
      if (IMPORT_ANCHOR_RE.test(line)) continue;
      const depName = cells.find(c => c.length > 0 && !/^\d/.test(c)) ?? '';
      if (depName) missing.push(depName.slice(0, 30));
    }
  }
  if (missing.length > 0) {
    issues.push({
      rule: 'unanchored-dependency',
      severity: 'warn',
      message: `依赖表格行缺 import 点锚点（R3）：${missing.slice(0, 5).join('、')}${missing.length > 5 ? ` 等 ${missing.length} 行` : ''}`,
    });
  }
}
