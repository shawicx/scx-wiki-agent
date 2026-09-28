/**
 * 意图证据层（Intent Evidence）：为「为什么」类叙述提供确定性证据源。
 *
 * 图谱数据只回答「是什么」（谁调谁、复杂度、扇入），动机/设计依据/演进脉络
 * 必须来自仓库中真实存在的意图载体。本模块以正则级提取（ADR-001 先例：
 * 无 AST、无持久索引）采集四类证据，全部携带锚点，LLM 只负责综合引用：
 * - 注释：文件头（模块自述）、符号定义行上方紧邻注释、TODO/FIXME/HACK/WHY
 *   标记、限制常量的同行/上邻注释
 * - git 提交：单文件首末提交（诞生动机/最近意图）、模块级高频主题、
 *   依赖引入相关提交
 * - 文档小节：README 与 docs/**.md 按 heading 切节（标题+首段摘录）
 * - 测试意图：describe/it/test 用例名（模块对外的行为承诺）
 *
 * 所有通道 fail-open：无 git / 无注释 / 无 docs → 对应证据为空，绝不阻断构建。
 * 预算钳制防 prompt 膨胀：单条文本 ≤240 字符、模块 ≤6 条、页 ≤14 条。
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ScanResult } from '../core/scanner.js';
import { isTestPath, languageDomainOf, matchPackageForFile } from '../shared/utils.js';

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

const TEXT_CAP = 240;
const MODULE_INTENT_CAP = 6;
const PAGE_INTENT_CAP = 14;
const GIT_FILE_CAP = 30;
const GIT_LOG_LIMIT = 200;
const GIT_TIMEOUT_MS = 15_000;
const SYMBOL_COMMENTS_PER_FILE = 3;
const WHY_MARKERS_PER_FILE = 5;
const DOC_FILE_CAP = 12;
const DOC_TOTAL_CAP = 16;
const TITLES_PER_TEST_FILE = 10;
const REPO_LOG_LIMIT = 400;

const WHY_MARKER_RE = /\b(TODO|FIXME|HACK|NOTE|WHY|SAFETY|PERF|GOTCHA|XXX)\b\s*[:：]?\s*(.*)/;

/** 限制常量定义行（与 ConfigDetector.detectConstraints 同口径，扩展 Rust const） */
const CONST_DEF_RE =
  /(?:export\s+const|pub\s+const|const|let|var)\s+([A-Z0-9_]*(?:MAX|MIN|LIMIT|TIMEOUT|DEPTH|SIZE|COUNT|THRESHOLD|RETRY|CACHE)[A-Z0-9_]*)\s*(?::[^=]+)?=/;

/** 测试用例名提取（describe/it/test 的首参字符串） */
const TEST_TITLE_RE = /(?:describe|it|test)\(\s*['"`]([^'"`\n]+)['"`]/;

const ALL_KINDS = new Set<string>([
  'file-header', 'symbol-comment', 'why-marker', 'const-comment',
  'git-commit', 'git-theme', 'doc-section', 'test-spec', 'git-churn',
]);

/** git 子进程默认执行器（fail-open：无 git/超时/非仓库 → null） */
function defaultGitRunner(rootDir: string): GitRunner {
  return args => {
    if (!existsSync(rootDir)) return null;
    try {
      return execFileSync('git', ['-C', rootDir, ...args], {
        encoding: 'utf-8',
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      return null;
    }
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 清理注释标记（/** * \/、//、行首 #），压缩空白 */
function cleanCommentText(raw: string): string {
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
function sanitizeText(raw: string): string {
  return raw
    .replace(/[A-Za-z0-9+/=_-]{40,}/g, '[REDACTED]')
    .slice(0, TEXT_CAP)
    .trimEnd();
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('#');
}

function commentContent(line: string): string | null {
  const t = line.trim();
  if (t.startsWith('//')) return t.slice(2);
  if (t.startsWith('/*')) return t.replace(/^\/\*\*?/, '').replace(/\*\/$/, '');
  if (t.startsWith('*')) return t.replace(/^\* ?/, '').replace(/\*\/$/, '');
  return null;
}

/** TS/JS 顶层定义行（symbol-comment 只锚定顶层，控制噪音与提取成本） */
const TS_TOPLEVEL_DEF_RE =
  /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(function|class|const|let|type|interface|enum)\s+([A-Za-z_$][\w$]*)/;
const RUST_TOPLEVEL_DEF_RE = /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(fn|struct|enum|trait|impl|const)\s+([A-Za-z_]\w*)/;

function topLevelDef(line: string, domain: string | null): { name: string } | null {
  if (!domain) return null;
  const re = domain === 'rust' ? RUST_TOPLEVEL_DEF_RE : TS_TOPLEVEL_DEF_RE;
  const m = line.match(re);
  return m ? { name: m[2] } : null;
}

/** 提交主题规范化：剥离 conventional-commit 前缀与 issue 引用，小写化 */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(?:revert: )?(?:feat|fix|refactor|docs|doc|test|tests|chore|style|perf|build|ci|release|wip)(?:\([^)]*\))?!?:\s*/i, '')
    .replace(/\s*\(#[\w-]+\)\s*$/g, '')
    .replace(/\s*#[\w/-]+\s*$/g, '')
    .trim()
    .toLowerCase();
}

/** 高频主题提取（频次 ≥2，取前 3） */
function extractThemes(subjects: string[], top = 3): string[] {
  const freq = new Map<string, number>();
  for (const s of subjects) {
    const norm = normalizeSubject(s);
    if (norm.length < 4) continue;
    freq.set(norm, (freq.get(norm) ?? 0) + 1);
  }
  return [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([t, n]) => `${t}（×${n}）`);
}

function commitAnchor(c: GitCommitRef): string {
  return `commit:${c.hash.slice(0, 8)} (${c.date})`;
}

export interface IntentProviderOptions {
  runGit?: GitRunner;
  /** .scx-wiki-agent 目录（存在则启用 git 磁盘缓存 intent.json；HEAD 一致时整批复用） */
  agentDir?: string;
}

export class IntentEvidenceProvider {
  private readonly runGit: GitRunner;
  private readonly agentDir?: string;

  private sourceCache = new Map<string, string | null>();
  private commentsByFile = new Map<string, IntentEvidence[]>();
  private gitByFile = new Map<string, FileGitInfo | null>();
  private gitAvailable = true;
  private repoSubjects: GitCommitRef[] | null = null;
  private docCache: IntentEvidence[] | null = null;
  private testSpecCache: IntentEvidence[] | null = null;

  private modulesReady = false;
  private moduleIntents = new Map<string, IntentEvidence[]>();
  private timeline: ModuleGitInfo[] = [];
  private churn: FileChurnInfo[] = [];

  constructor(private scanResult: ScanResult, opts?: IntentProviderOptions) {
    this.runGit = opts?.runGit ?? defaultGitRunner(scanResult.rootDir);
    this.agentDir = opts?.agentDir;
    this.loadGitCache();
  }

  // --- 注释证据 ---

  /** 指定文件集的注释证据（file-header / symbol-comment / why-marker / const-comment） */
  fileComments(files: string[]): IntentEvidence[] {
    const out: IntentEvidence[] = [];
    for (const rel of files) {
      out.push(...this.commentsForFile(rel));
    }
    return dedupeByAnchor(out);
  }

  /** 限制常量注释（constraints 页：常量「防什么」的直接证据） */
  constComments(files: string[]): IntentEvidence[] {
    return this.fileComments(files).filter(e => e.kind === 'const-comment');
  }

  /** 仓库级 why-marker 采样（troubleshooting 页：真实风险信号） */
  whyMarkers(limit: number): IntentEvidence[] {
    const out: IntentEvidence[] = [];
    for (const f of this.scanResult.files) {
      if (out.length >= limit) break;
      if (isTestPath(f.relativePath) || languageDomainOf(f.relativePath) === null) continue;
      out.push(...this.commentsForFile(f.relativePath).filter(e => e.kind === 'why-marker'));
    }
    return dedupeByAnchor(out).slice(0, limit);
  }

  private commentsForFile(rel: string): IntentEvidence[] {
    const cached = this.commentsByFile.get(rel);
    if (cached) return cached;
    const file = this.scanResult.files.find(f => f.relativePath === rel);
    const domain = languageDomainOf(rel);
    if (!file || domain === null || isTestPath(rel)) {
      this.commentsByFile.set(rel, []);
      return [];
    }
    const src = this.readSource(rel);
    if (src === null) {
      this.commentsByFile.set(rel, []);
      return [];
    }

    const lines = src.split('\n');
    const evidence: IntentEvidence[] = [];

    // 文件头：首段连续注释（跳过 shebang 与版权行，剩余 ≥12 字符才算自述）
    let header: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t === '') { if (header.length > 0) break; continue; }
      if (t.startsWith('#!')) continue;
      if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
        const c = commentContent(line);
        if (c !== null && !/^(copyright|licensed|spdx|@license)/i.test(c.trim())) header.push(c);
        if (t.includes('*/') && t.startsWith('/*')) break;
        continue;
      }
      break;
    }
    const headerText = sanitizeText(cleanCommentText(header.join(' ')));
    // 头注释仅复述文件路径（如「// src/knowledge/types.ts」）时是噪音，不构成意图证据
    if (headerText.length >= 12 && headerText !== rel && !headerText.endsWith(rel.split('/').pop()!)) {
      evidence.push({
        kind: 'file-header',
        target: { file: rel, line: 1 },
        text: headerText,
        anchor: `${rel}:1`,
      });
    }

    // 符号注释：顶层定义行上方紧邻注释（≤3 行，遇空行停）
    let symbolFound = 0;
    for (let i = 0; i < lines.length && symbolFound < SYMBOL_COMMENTS_PER_FILE; i++) {
      const def = topLevelDef(lines[i], domain);
      if (!def) continue;
      const commentLines: string[] = [];
      for (let j = i - 1; j >= 0 && commentLines.length < 3 && i - j <= 4; j--) {
        const t = lines[j].trim();
        if (t === '') break;
        const c = commentContent(lines[j]);
        if (c === null) break;
        commentLines.unshift(c);
      }
      const text = sanitizeText(cleanCommentText(commentLines.join(' ')));
      if (text.length >= 8) {
        symbolFound++;
        evidence.push({
          kind: 'symbol-comment',
          target: { file: rel, line: i + 1, symbol: def.name },
          text,
          anchor: `${rel}:${i + 1}`,
        });
      }
    }

    // why-marker：注释行中的 TODO/FIXME/HACK/... 标记（≤5 条/文件）
    let markersFound = 0;
    for (let i = 0; i < lines.length && markersFound < WHY_MARKERS_PER_FILE; i++) {
      const c = commentContent(lines[i]);
      if (c === null) continue;
      const m = c.match(WHY_MARKER_RE);
      if (!m) continue;
      const text = sanitizeText(cleanCommentText(`${m[1]}: ${m[2]}`));
      if (text.length < 6) continue;
      markersFound++;
      evidence.push({
        kind: 'why-marker',
        target: { file: rel, line: i + 1 },
        text,
        anchor: `${rel}:${i + 1}`,
      });
    }

    // 常量注释：限制常量定义行的同行尾注释或上一行注释
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(CONST_DEF_RE);
      if (!m) continue;
      const name = m[1];
      const inline = lines[i].match(/\/\/\s*(.+)$/);
      const prevC = i > 0 ? commentContent(lines[i - 1]) : null;
      const raw = inline ? inline[1] : prevC;
      if (!raw) continue;
      const text = sanitizeText(cleanCommentText(raw));
      if (text.length < 4) continue;
      evidence.push({
        kind: 'const-comment',
        target: { file: rel, line: i + 1, symbol: name },
        text,
        anchor: `${rel}:${i + 1}`,
      });
    }

    this.commentsByFile.set(rel, evidence);
    return evidence;
  }

  // --- git 证据 ---

  /** 单文件 git 聚合（不可用/无提交返回 null；构建内缓存） */
  gitForFile(rel: string): FileGitInfo | null {
    if (!this.gitAvailable) return null;
    if (this.gitByFile.has(rel)) return this.gitByFile.get(rel) ?? null;
    const raw = this.runGit(['log', '--no-merges', `--format=%H%x09%as%x09%s`, `-n`, `${GIT_LOG_LIMIT}`, '--', rel]);
    if (raw === null) {
      this.gitAvailable = false;
      return null;
    }
    const commits = parseGitLog(raw);
    const info: FileGitInfo | null = commits.length === 0
      ? null
      : {
          count: commits.length,
          first: commits[commits.length - 1],
          last: commits[0],
          subjects: commits.map(c => c.subject),
        };
    this.gitByFile.set(rel, info);
    return info;
  }

  /** 仓库级近期提交（依赖引入决策的证据池） */
  private repoGitSubjects(): GitCommitRef[] {
    if (!this.gitAvailable) return [];
    if (this.repoSubjects !== null) return this.repoSubjects;
    const raw = this.runGit(['log', '--no-merges', `--format=%H%x09%as%x09%s`, `-n`, `${REPO_LOG_LIMIT}`]);
    if (raw === null) {
      this.gitAvailable = false;
      return [];
    }
    this.repoSubjects = parseGitLog(raw);
    return this.repoSubjects;
  }

  /** 依赖相关提交主题（tech-stack 选型理由 / decisions 依赖引入决策） */
  depCommitEvidence(deps: string[]): IntentEvidence[] {
    const subjects = this.repoGitSubjects();
    if (subjects.length === 0) return [];
    const out: IntentEvidence[] = [];
    for (const dep of deps.slice(0, 20)) {
      const re = new RegExp(`\\b${escapeRe(dep)}\\b`, 'i');
      const hits = subjects.filter(c => re.test(c.subject)).slice(0, 2);
      for (const c of hits) {
        out.push({
          kind: 'git-commit',
          target: { symbol: dep },
          text: `依赖 ${dep} 相关提交：${c.subject}`,
          anchor: commitAnchor(c),
        });
      }
    }
    return out.slice(0, 8);
  }

  /** 高频变更信号（troubleshooting 维护风险 / decisions 热点） */
  churnEvidence(limit: number): IntentEvidence[] {
    return this.churn.slice(0, limit).map(c => ({
      kind: 'git-churn' as const,
      target: { file: c.file },
      text: c.last
        ? `高频变更：${c.commitCount} 次提交，最近「${c.last.subject}」`
        : `高频变更：${c.commitCount} 次提交`,
      anchor: c.last ? commitAnchor(c.last) : c.file,
    }));
  }

  /**
   * 预聚合模块级证据（一次性）：注释 + git 主题 + 测试行为。
   * candidateFiles 由调用方按重要性排序（热点文件优先），内部截 GIT_FILE_CAP。
   */
  prepareModules(pkgNames: string[], candidateFiles: string[]): void {
    if (this.modulesReady) return;
    this.modulesReady = true;

    const codeFiles = candidateFiles
      .filter(rel => languageDomainOf(rel) !== null && !isTestPath(rel));
    const byModule = new Map<string, string[]>();
    for (const rel of codeFiles) {
      const pkg = matchPackageForFile(rel, pkgNames);
      if (!pkg) continue;
      const list = byModule.get(pkg) ?? [];
      list.push(rel);
      byModule.set(pkg, list);
    }

    // git per-file 挖掘（文件数封顶；不可用时整条通道静默为空）
    const gitFiles = new Set(codeFiles.slice(0, GIT_FILE_CAP));
    const subjectsByModule = new Map<string, string[]>();
    const churnAll: FileChurnInfo[] = [];
    for (const [module, files] of byModule) {
      const subjects: string[] = [];
      let count = 0;
      let first: GitCommitRef | null = null;
      let last: GitCommitRef | null = null;
      for (const rel of files) {
        if (!gitFiles.has(rel)) continue;
        const info = this.gitForFile(rel);
        if (!info) continue;
        count += info.count;
        subjects.push(...info.subjects);
        churnAll.push({ file: rel, commitCount: info.count, last: info.last });
        if (!first || (info.first && info.first.date < first.date)) first = info.first;
        if (!last || (info.last && info.last.date > last.date)) last = info.last;
      }
      subjectsByModule.set(module, subjects);
      if (count > 0) {
        this.timeline.push({ module, commitCount: count, first, last, themes: extractThemes(subjects) });
      }
    }
    this.timeline.sort((a, b) => b.commitCount - a.commitCount);
    this.churn = churnAll.sort((a, b) => b.commitCount - a.commitCount).slice(0, 20);

    for (const [module, files] of byModule) {
      const subjects = subjectsByModule.get(module) ?? [];
      const items: IntentEvidence[] = [];
      // 模块内文件头自述（最具代表性的「为什么」）
      for (const e of this.fileComments(files)) {
        if (e.kind === 'file-header') items.push(e);
      }
      // 首提交 = 模块诞生动机的最直接证据
      const tl = this.timeline.find(t => t.module === module);
      if (tl?.first) {
        items.push({
          kind: 'git-commit',
          target: { module },
          text: `首次提交：${tl.first.subject}`,
          anchor: commitAnchor(tl.first),
        });
      }
      if (tl && tl.themes.length > 0) {
        items.push({
          kind: 'git-theme',
          target: { module },
          text: `高频提交主题：${tl.themes.join('、')}`,
          anchor: tl.last ? commitAnchor(tl.last) : module,
        });
      }
      // 行为承诺：该模块源文件对应的测试用例名
      for (const e of this.testSpecs()) {
        const targetFile = e.target.file;
        if (targetFile && files.includes(targetFile)) items.push(e);
      }
      this.moduleIntents.set(module, dedupeByAnchor(items).slice(0, MODULE_INTENT_CAP));
    }

    this.saveGitCache();
  }

  moduleIntent(module: string): IntentEvidence[] | undefined {
    const items = this.moduleIntents.get(module);
    return items && items.length > 0 ? items : undefined;
  }

  gitTimeline(): ModuleGitInfo[] {
    return this.timeline;
  }

  hotFileChurn(limit: number): FileChurnInfo[] {
    return this.churn.slice(0, limit);
  }

  // --- 主题/章节页：文件集证据 ---

  /** 主题文件集证据：注释 + 各文件首末提交 + 相关测试行为（页预算封顶） */
  intentForFiles(files: string[]): IntentEvidence[] {
    const items: IntentEvidence[] = [...this.fileComments(files)];
    for (const rel of files.slice(0, 10)) {
      const info = this.gitForFile(rel);
      if (!info?.first) continue;
      items.push({
        kind: 'git-commit',
        target: { file: rel },
        text: `${rel} 首次提交：${info.first.subject}`,
        anchor: commitAnchor(info.first),
      });
    }
    const fileSet = new Set(files);
    for (const e of this.testSpecs()) {
      if (e.target.file && fileSet.has(e.target.file)) items.push(e);
    }
    return dedupeByAnchor(items).slice(0, PAGE_INTENT_CAP);
  }

  // --- overview：仓库级证据 ---

  overviewIntent(entryFiles: string[]): IntentEvidence[] {
    const items: IntentEvidence[] = [...this.docEvidence()];
    for (const e of this.fileComments(entryFiles)) {
      if (e.kind === 'file-header') items.push(e);
    }
    const subjects = this.repoGitSubjects();
    const themes = extractThemes(subjects.map(c => c.subject), 4);
    if (themes.length > 0) {
      items.push({
        kind: 'git-theme',
        target: {},
        text: `仓库高频提交主题：${themes.join('、')}`,
        anchor: subjects.length > 0 ? commitAnchor(subjects[0]) : 'git-log',
      });
    }
    const oldest = [...subjects].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (oldest) {
      items.push({
        kind: 'git-commit',
        target: {},
        text: `仓库首次提交：${oldest.subject}`,
        anchor: commitAnchor(oldest),
      });
    }
    return dedupeByAnchor(items).slice(0, PAGE_INTENT_CAP);
  }

  // --- 文档小节 ---

  docEvidence(): IntentEvidence[] {
    if (this.docCache) return this.docCache;
    const docs = this.scanResult.files
      .map(f => f.relativePath)
      .filter(p => (p === 'README.md' || (p.startsWith('docs/') && p.endsWith('.md'))) && !isTestPath(p))
      .slice(0, DOC_FILE_CAP);
    const out: IntentEvidence[] = [];
    for (const rel of docs) {
      const src = this.readSource(rel);
      if (src === null) continue;
      // 设计文档（adr/decision/design/spec）整篇切节；普通文档只取前 3 节
      const isDesignDoc = /adr|decision|design|spec|rfc|plan/i.test(rel);
      out.push(...docSections(rel, src).slice(0, isDesignDoc ? 8 : 3));
    }
    this.docCache = dedupeByAnchor(out).slice(0, DOC_TOTAL_CAP);
    return this.docCache;
  }

  // --- 测试意图 ---

  /** 测试用例名证据：target.file = 解析出的被测源文件（解析不出锚定测试文件自身） */
  testSpecs(): IntentEvidence[] {
    if (this.testSpecCache) return this.testSpecCache;
    const codeFilesByStem = new Map<string, string[]>();
    for (const f of this.scanResult.files) {
      if (isTestPath(f.relativePath) || languageDomainOf(f.relativePath) === null) continue;
      const stem = f.relativePath.split('/').pop()!.replace(/\.[^.]+$/, '');
      const list = codeFilesByStem.get(stem) ?? [];
      list.push(f.relativePath);
      codeFilesByStem.set(stem, list);
    }

    const out: IntentEvidence[] = [];
    for (const f of this.scanResult.files) {
      const rel = f.relativePath;
      if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel)) continue;
      const src = this.readSource(rel);
      if (src === null) continue;
      const lines = src.split('\n');
      const titles: string[] = [];
      let firstLine = 0;
      for (let i = 0; i < lines.length && titles.length < TITLES_PER_TEST_FILE; i++) {
        const m = lines[i].match(TEST_TITLE_RE);
        if (!m) continue;
        if (firstLine === 0) firstLine = i + 1;
        titles.push(m[1]);
      }
      if (titles.length === 0) continue;
      const stem = rel.split('/').pop()!.replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/, '');
      const candidates = codeFilesByStem.get(stem) ?? [];
      // 同名源文件唯一时锚定之；多个时取路径目录重合最多者（tests/knowledge/x → src/knowledge/x）
      let target: string;
      if (candidates.length === 1) {
        target = candidates[0];
      } else if (candidates.length > 1) {
        const testDirs = rel.split('/').slice(0, -1);
        target = candidates
          .map(c => ({ c, score: c.split('/').slice(0, -1).filter((d, idx) => testDirs[idx] === d).length }))
          .sort((a, b) => b.score - a.score)[0].c;
      } else {
        target = rel;
      }
      out.push({
        kind: 'test-spec',
        target: { file: target },
        text: `行为承诺（${rel}）：${titles.join('；')}`,
        anchor: `${rel}:${firstLine}`,
      });
    }
    this.testSpecCache = out;
    return this.testSpecCache;
  }

  // --- 内部 ---

  private readSource(rel: string): string | null {
    if (this.sourceCache.has(rel)) return this.sourceCache.get(rel) ?? null;
    const file = this.scanResult.files.find(f => f.relativePath === rel);
    let src: string | null = null;
    if (file) {
      try {
        src = readFileSync(file.absolutePath, 'utf-8');
      } catch {
        src = null;
      }
    }
    this.sourceCache.set(rel, src);
    return src;
  }

  // --- git 磁盘缓存（HEAD 一致时整批复用；HEAD 变化重挖） ---

  private get cachePath(): string | undefined {
    return this.agentDir ? join(this.agentDir, 'cache', 'intent.json') : undefined;
  }

  private loadGitCache(): void {
    const path = this.cachePath;
    if (!path) return;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as {
        version?: number; head?: string; git?: Record<string, FileGitInfo>;
        repoSubjects?: GitCommitRef[];
      };
      if (raw.version !== 1 || typeof raw.head !== 'string') return;
      const head = this.runGit(['rev-parse', 'HEAD']);
      if (head === null || head.trim() !== raw.head) return;
      for (const [file, info] of Object.entries(raw.git ?? {})) {
        if (info && typeof info.count === 'number') this.gitByFile.set(file, info);
      }
      this.repoSubjects = raw.repoSubjects ?? [];
    } catch {
      // 缓存不可读/无 git：按无缓存继续（fail-open）
    }
  }

  private saveGitCache(): void {
    const path = this.cachePath;
    if (!path || !this.gitAvailable) return;
    try {
      const head = this.runGit(['rev-parse', 'HEAD']);
      if (head === null) return;
      const git: Record<string, FileGitInfo> = {};
      for (const [file, info] of this.gitByFile) {
        if (info) git[file] = info;
      }
      mkdirSync(join(this.agentDir!, 'cache'), { recursive: true });
      writeFileSync(path, JSON.stringify({
        version: 1,
        head: head.trim(),
        git,
        repoSubjects: this.repoGitSubjects(),
      }), 'utf-8');
    } catch {
      // 写缓存失败不影响构建
    }
  }
}

/** markdown 文档切节：heading + 首段摘录 */
function docSections(rel: string, src: string): IntentEvidence[] {
  const lines = src.split('\n');
  const sections: IntentEvidence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,3})\s+(.{1,80})/);
    if (!m) continue;
    const level = m[1].length;
    const heading = m[2].trim();
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const headingUp = lines[j].match(/^(#{1,3})\s/);
      if (headingUp) {
        if (headingUp[1].length <= level) break;
        continue;
      }
      const t = lines[j].trim();
      if (t === '') { if (body.length > 0) break; continue; }
      body.push(t);
      if (body.join(' ').length > 220) break;
    }
    const excerpt = body.join(' ').slice(0, 200).trimEnd();
    if (excerpt.length < 10) continue;
    sections.push({
      kind: 'doc-section',
      target: { file: rel, line: i + 1 },
      text: `${heading}：${excerpt}`,
      anchor: `${rel}#${heading}`,
    });
  }
  return sections;
}

function parseGitLog(raw: string): GitCommitRef[] {
  const commits: GitCommitRef[] = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const [hash, date, ...rest] = t.split('\t');
    if (!hash || !date) continue;
    const subject = rest.join('\t').trim();
    if (!subject) continue;
    commits.push({ hash, date, subject: subject.slice(0, 120) });
  }
  return commits;
}

function dedupeByAnchor(items: IntentEvidence[]): IntentEvidence[] {
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
