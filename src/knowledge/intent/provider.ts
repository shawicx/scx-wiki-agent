/**
 * IntentEvidenceProvider：四类意图证据的编排层（缓存 + git 通道 + 模块预聚合）。
 * 图谱数据只回答「是什么」，动机/设计依据/演进脉络由本层以正则级提取采集，
 * 全部携带锚点，LLM 只负责综合引用。
 */

import { readFileSync } from 'fs';
import type { ScanResult } from '../../core/scanner.js';
import { isTestPath, languageDomainOf } from '../../shared/utils.js';
import type {
  FileChurnInfo, FileGitInfo, GitCommitRef, GitRunner,
  IntentEvidence, ModuleGitInfo,
} from './shared.js';
import {
  dedupeByAnchor, DOC_FILE_CAP, DOC_TOTAL_CAP, escapeRe, GIT_FILE_CAP,
  GIT_LOG_LIMIT, MODULE_INTENT_CAP, PAGE_INTENT_CAP, REPO_LOG_LIMIT,
} from './shared.js';
import type { IntentCandidateStats } from './shared.js';
import {
  commitAnchor, countFileChurn, defaultGitRunner, extractThemes,
  firstCommitOfFile, isShallowClone, parseGitLog, rootCommits,
} from './git.js';
import { loadIntentGitCache, saveIntentGitCache } from './git-cache.js';
import { groupFilesByModule, mineModuleGit } from './modules.js';
import { collectCommentEvidence } from './comments.js';
import { collectTestSpecs, docSections } from './docs-tests.js';

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
  private churnCountsCache: Map<string, number> | null = null;
  private candidateStatsValue: IntentCandidateStats | null = null;
  private rootCommitRef: GitCommitRef | null = null;
  private rootCommitQueried = false;

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
    const evidence = src === null ? [] : collectCommentEvidence(rel, src, domain);
    this.commentsByFile.set(rel, evidence);
    return evidence;
  }

  // --- git 证据 ---

  /** 单文件 git 聚合（缓存）。窗口截断时先 --reverse 精查真首提交，失败则
   *  first=null + firstTruncated（绝不把窗口最旧冒称「首次提交」）。 */
  gitForFile(rel: string): FileGitInfo | null {
    if (!this.gitAvailable) return null;
    if (this.gitByFile.has(rel)) return this.gitByFile.get(rel) ?? null;
    const raw = this.runGit(['log', '--no-merges', `--format=%H%x09%as%x09%s`, `-n`, `${GIT_LOG_LIMIT}`, '--', rel]);
    if (raw === null) {
      this.gitAvailable = false;
      return null;
    }
    const commits = parseGitLog(raw);
    const truncated = commits.length >= GIT_LOG_LIMIT;
    // 窗口截断时窗口最旧≠真首次：--reverse 精查；失败则 first=null（不冒称首次）
    const trueFirst = truncated ? firstCommitOfFile(this.runGit, rel) : null;
    const info: FileGitInfo | null = commits.length === 0 ? null : {
      count: commits.length,
      first: truncated ? trueFirst : commits[commits.length - 1],
      last: commits[0],
      subjects: commits.map(c => c.subject),
      ...(truncated && trueFirst === null ? { firstTruncated: true } : {}),
    };
    this.gitByFile.set(rel, info);
    return info;
  }

  /** 真·仓库首提交（rev-list --max-parents=0；shallow 返回 null 走降级口径） */
  rootCommit(): GitCommitRef | null {
    if (this.rootCommitQueried) return this.rootCommitRef;
    this.rootCommitQueried = true;
    if (this.gitAvailable && !isShallowClone(this.runGit)) {
      const roots = rootCommits(this.runGit);
      this.rootCommitRef = roots !== null && roots.length > 0 ? roots[0] : null;
    }
    return this.rootCommitRef;
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
        out.push({ kind: 'git-commit', target: { symbol: dep }, text: `依赖 ${dep} 相关提交：${c.subject}`, anchor: commitAnchor(c) });
      }
    }
    return out.slice(0, 8);
  }

  /** 高频变更信号（troubleshooting 维护风险 / decisions 热点） */
  churnEvidence(limit: number): IntentEvidence[] {
    return this.churn.slice(0, limit).map(c => ({
      kind: 'git-churn' as const, target: { file: c.file },
      text: c.last ? `高频变更：${c.commitCount} 次提交，最近「${c.last.subject}」` : `高频变更：${c.commitCount} 次提交`,
      anchor: c.last ? commitAnchor(c.last) : c.file,
    }));
  }

  /** 全仓 churn 计数（--name-only 批量一次，构建内缓存；fail-open 空 Map）。
   *  供意图候选排序：比逐文件 log 便宜，且能排序全部文件而非截断后的 30 个。 */
  fileChurnCounts(): Map<string, number> {
    if (this.gitAvailable && this.churnCountsCache === null) {
      const counts = countFileChurn(this.runGit);
      if (counts === null) this.gitAvailable = false;
      this.churnCountsCache = counts ?? new Map();
    }
    return this.churnCountsCache ?? new Map();
  }

  /** 候选统计登记/读取（context 层排序后写入；构建报告观测「小核心文件被排除」类回归） */
  noteCandidateStats(stats: IntentCandidateStats): void {
    this.candidateStatsValue = stats;
  }

  candidateStats(): IntentCandidateStats | null {
    return this.candidateStatsValue;
  }

  /**
   * 预聚合模块级证据（一次性）：注释 + git 主题 + 测试行为。
   * candidateFiles 由调用方按重要性多信号评分排序（fan-in/入口/boundary/测试配对/
   * docs 提及/churn，见 intent/ranking.ts），内部截 GIT_FILE_CAP 控住子进程成本。
   */
  prepareModules(pkgNames: string[], candidateFiles: string[]): void {
    if (this.modulesReady) return;
    this.modulesReady = true;

    const codeFiles = candidateFiles
      .filter(rel => languageDomainOf(rel) !== null && !isTestPath(rel));
    const byModule = groupFilesByModule(codeFiles, pkgNames);

    // git per-file 挖掘（文件数封顶；不可用时整条通道静默为空）
    const mined = mineModuleGit(byModule, new Set(codeFiles.slice(0, GIT_FILE_CAP)), rel => this.gitForFile(rel));
    this.timeline = mined.timeline;
    this.churn = mined.churn;

    for (const [module, files] of byModule) {
      const items: IntentEvidence[] = [];
      // 模块内文件头自述（最具代表性的「为什么」）
      for (const e of this.fileComments(files)) {
        if (e.kind === 'file-header') items.push(e);
      }
      // 首提交 = 模块诞生动机的最直接证据
      const tl = this.timeline.find(t => t.module === module);
      if (tl?.first) {
        items.push({ kind: 'git-commit', target: { module }, text: `首次提交：${tl.first.subject}`, anchor: commitAnchor(tl.first) });
      }
      if (tl && tl.themes.length > 0) {
        items.push({ kind: 'git-theme', target: { module }, text: `高频提交主题：${tl.themes.join('、')}`, anchor: tl.last ? commitAnchor(tl.last) : module });
      }
      // 测试用例名属于 testing 证据（锚点在测试文件），不混入生产模块主叙事；
      // 非 testing 页的质量闸门会把测试文件锚点判为作用域外证据。
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

  /** 主题文件集证据：注释 + 各文件首末提交（页预算封顶；测试行为留在 testing 证据域） */
  intentForFiles(files: string[]): IntentEvidence[] {
    const items: IntentEvidence[] = [...this.fileComments(files)];
    for (const rel of files.slice(0, 10)) {
      const info = this.gitForFile(rel);
      if (!info?.first) continue;
      items.push({ kind: 'git-commit', target: { file: rel }, text: `${rel} 首次提交：${info.first.subject}`, anchor: commitAnchor(info.first) });
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
      // 口径诚实：themes 只基于近 REPO_LOG_LIMIT 条，不冒称全仓
      items.push({ kind: 'git-theme', target: {}, text: `近 ${REPO_LOG_LIMIT} 条提交高频主题：${themes.join('、')}`, anchor: subjects.length > 0 ? commitAnchor(subjects[0]) : 'git-log' });
    }
    const root = this.rootCommit();
    if (root) {
      items.push({ kind: 'git-commit', target: {}, text: `仓库首次提交：${root.subject}`, anchor: commitAnchor(root) });
    } else {
      // root 不可用（shallow / 无 git / rev-list 失败）：降级为窗口口径，不冒称首次
      const oldest = [...subjects].sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      if (oldest) items.push({ kind: 'git-commit', target: {}, text: `近 ${REPO_LOG_LIMIT} 条提交中最旧提交：${oldest.subject}`, anchor: commitAnchor(oldest) });
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

  testSpecs(): IntentEvidence[] {
    if (this.testSpecCache) return this.testSpecCache;
    const codeFiles = this.scanResult.files
      .filter(f => !isTestPath(f.relativePath) && languageDomainOf(f.relativePath) !== null)
      .map(f => f.relativePath);
    this.testSpecCache = collectTestSpecs(
      codeFiles,
      this.scanResult.files.map(f => f.relativePath),
      rel => this.readSource(rel),
    );
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

  private loadGitCache(): void {
    if (!this.agentDir) return;
    const cached = loadIntentGitCache(this.agentDir, this.runGit);
    if (!cached) return;
    for (const [file, info] of cached.gitByFile) {
      this.gitByFile.set(file, info);
    }
    this.repoSubjects = cached.repoSubjects;
    if (cached.rootCommit !== undefined) {
      this.rootCommitRef = cached.rootCommit;
      this.rootCommitQueried = true;
    }
  }

  private saveGitCache(): void {
    if (!this.gitAvailable) return;
    saveIntentGitCache(this.agentDir, this.runGit, this.gitByFile, this.repoGitSubjects(), this.rootCommitQueried ? this.rootCommitRef : this.rootCommit());
  }
}
