/** WikiService：build 编排（两阶段构建：内存生成 → 裁决 → 闸门写盘）。 */

import { existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import type { CodebaseMemoryClient } from '../../mcp/codebase-memory-client.js';
import type { ScanResult } from '../../core/scanner.js';
import { WikiContextBuilder } from '../../knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../../knowledge/wiki-fallback-builder.js';
import { WikiPageGenerator } from '../../knowledge/wiki-page-generator.js';
import type { ClaimStats } from '../../knowledge/claim-verifier.js';
import {
  loadConfirmedEntries,
  saveConfirmedEntries,
  evaluateConfirmedEntries,
  currentHead,
  hashFileContent,
} from '../../knowledge/confirmation.js';
import { IntentEvidenceProvider } from '../../knowledge/intent-evidence.js';
import { ConfigDetector } from '../../knowledge/config-detector.js';
import { TopicDiscovery, loadTopics, saveTopics, mergePinnedTopics } from '../../knowledge/topic-discovery.js';
import type { TopicDefinition } from '../../knowledge/topic-discovery.js';
import { loadOutline, saveOutline, validateOutline } from '../../knowledge/outline.js';
import type { OutlineFileData, OutlineReport } from '../../knowledge/outline.js';
import { OutlinePlanner } from '../../knowledge/outline-planner.js';
import {
  pageRelPath, isTopicPage, topicPageName,
  chapterPageName,
} from '../../knowledge/page-registry.js';
import type { WikiBuildOptions } from '../../knowledge/types.js';
import { runPagePrechecks } from './precheck.js';

export { dataFlowDropReason } from './precheck.js';
import { VerificationHub } from './verification.js';
import {
  cleanupLegacyFlatFiles,
  cleanupRetiredPages,
  cleanupStaleTopicPages,
  cleanupStaleChapterPages,
  removeEmptyOwnedDirs,
  cleanupStaleNumberedDirFiles,
} from './cleanup.js';
import { printBuildReport } from './report.js';
import { archiveWikiDir } from './archive.js';
import { runConfirmPhase } from './confirm-phase.js';
import { writeProducedPages } from './write-phase.js';
import { generateAllPages } from './generate-phase.js';
import { resolvePages } from './resolve.js';
import { crosspageReview } from '../../knowledge/crosspage/index.js';
import { applyCrossPageActions } from '../../knowledge/crosspage/actions.js';
import { stripUnplannedPageLinks } from '../../knowledge/ghost-links.js';
import { summarizeIpcConsistency } from '../../knowledge/ipc-consistency.js';
import { resetChannelStats, getChannelStats } from '../../knowledge/channels/stats.js';
import type { ProducedEntry } from './types.js';

export class WikiService {
  private readonly verify: VerificationHub;

  constructor(
    private client: CodebaseMemoryClient,
    private scanResult: ScanResult,
  ) {
    this.verify = new VerificationHub(client, scanResult);
  }

  async buildWiki(wikiDir: string, options?: WikiBuildOptions): Promise<string[]> {
    // 通道统计生命周期：构建开始清零，各通道采集时累计，报告统一打印（W6）
    resetChannelStats();
    // .wiki 为工具独占目录：full 模式在写盘前整目录重建（无陈旧残留、无外来目录，也不告警）。
    // wipe 安排在规划/预检之后：规划期异常直接中止时旧 .wiki 保持原样，不留下空目录。
    // update 模式保留存量以便内容一致时跳过重写，陈旧产物由逐路径清理负责。
    const mode = options?.mode ?? 'full';
    mkdirSync(wikiDir, { recursive: true });

    // 确保图谱已索引（替代旧的 index 阶段）
    this.client.ensureIndexed('moderate');

    // 主题页定义：topics.json 锁定（缺失或 --refresh-topics 时确定性探测）；
    // pinned 条目（手工置 pinned: true）在重探测后仍保留，高价值主题不会被换簇挤掉
    const agentDir = join(dirname(wikiDir), '.scx-wiki-agent');
    let topics = options?.refreshTopics ? null : loadTopics(agentDir);
    if (topics === null) {
      const locked = loadTopics(agentDir);
      const discovered = new TopicDiscovery(this.client, this.scanResult).discover();
      topics = mergePinnedTopics(
        discovered, locked,
        new Set(this.scanResult.productionFiles.map(f => f.relativePath)),
      );
      saveTopics(agentDir, topics);
    }
    const topicPages = topics.map(t => topicPageName(t.id));

    // 页生成器（章树 planner 复用其模型能力）与通知统计，声明在前供 planner 触发
    const noLlm = options?.noLlm ?? false;
    const continuations: Array<{ page: string; rounds: number; truncated: boolean }> = [];
    const sectionedPages: Array<{ page: string; sections: number; continuedSections: number; truncated: boolean }> = [];
    const thinkingOnly: Array<{ page: string; recovered: boolean }> = [];
    const llmDropped: Array<{ page: string; reason: string }> = [];
    let currentPage = '';
    const pageGenerator = new WikiPageGenerator(
      options?.model, options?.baseURL, options?.apiKey,
      n => {
        if (n.kind === 'continuation') {
          continuations.push({ page: currentPage, rounds: n.rounds, truncated: n.truncated });
        } else if (n.kind === 'thinking-only') {
          thinkingOnly.push({ page: currentPage, recovered: n.recovered });
        } else {
          sectionedPages.push({
            page: currentPage, sections: n.sections,
            continuedSections: n.continuedSections, truncated: n.truncated,
          });
        }
      },
      {
        timeoutMs: options?.timeoutSec ? options.timeoutSec * 1000 : undefined,
        maxOutputTokens: options?.maxOutputTokens,
      },
    );

    // 章节树：outline.json 锁定；缺失且 LLM 可用时 planner 首次自动提议（--refresh-outline 重建）；
    // 规划不可用/失败时回退现有锁定文件。坏配置经校验器降级，绝不失败构建。
    const knownFiles = new Set(this.scanResult.files.map(f => f.relativePath));
    const productionKnownFiles = new Set(this.scanResult.productionFiles.map(f => f.relativePath));
    let outlineRaw: unknown | null = options?.refreshOutline ? null : loadOutline(agentDir);
    if (outlineRaw === null && !noLlm && pageGenerator.hasModel()) {
      // LLM 故障（限流/欠费/断网）不阻断构建：规划失败按无章节页继续（fail-open）
      let proposed: OutlineFileData | null = null;
      try {
        proposed = await this.planOutline(pageGenerator, topics, knownFiles);
      } catch (err) {
        console.warn(`[wiki] 章节树规划异常（LLM 不可用，按无章节页继续）：${(err as Error).message}`);
      }
      if (proposed !== null) {
        saveOutline(agentDir, proposed);
        outlineRaw = proposed;
      }
    }
    if (outlineRaw === null && options?.refreshOutline) {
      outlineRaw = loadOutline(agentDir);
    }

    let outlineReport: OutlineReport | null = null;
    let chapterPages: string[] = [];
    if (outlineRaw !== null) {
      outlineReport = validateOutline(outlineRaw, this.verify.outlineKnown(knownFiles, outlineRaw));
      chapterPages = outlineReport.chapters.flatMap(c => c.pages.map(p => chapterPageName(c.id, p.id)));
    }

    // 决定生成哪些页面（校验页名合法性）
    let pages = resolvePages({ projectType: this.scanResult.projectType }, options?.pages, topicPages, chapterPages);

    // 检测式配置探测器：探测项目实际配置（package.json/lockfile/eslint/...），
    // 复用 scanResult 的源文件列表避免重复扫描
    const detector = new ConfigDetector(this.scanResult.rootDir);
    detector.setSourceClassification({
      production: this.scanResult.productionFiles.map(f => f.absolutePath),
      test: this.scanResult.testFiles.map(f => f.absolutePath),
    });

    // 意图证据层：「为什么」的确定性证据源（注释/git/文档/测试），
    // fail-open——无 git/无注释时各页 intent 字段缺省，绝不阻断构建
    const intentProvider = new IntentEvidenceProvider(this.scanResult, { agentDir });

    const contextBuilder = new WikiContextBuilder(this.client, this.scanResult, detector);
    contextBuilder.setTopics(topics);
    contextBuilder.setIntentProvider(intentProvider);
    if (outlineReport) contextBuilder.setOutlineChapters(outlineReport.chapters);
    const fallbackBuilder = new WikiFallbackBuilder();
    const onChunk = options?.onChunk ?? (() => {});

    const skippedPages: Array<{ page: string; reason: string }> = [];
    const legacyRemoved: string[] = [];

    // 归档标签：HEAD 短哈希（无 git 时时间戳）；repoHead 在此提前取定供下文复用
    const repoHead = currentHead(this.scanResult.rootDir);
    const archiveLabel = repoHead?.slice(0, 8)
      ?? new Date().toISOString().replace(/[^0-9TZ]/g, '');

    // data-flow / decisions 预检：证据不足时整页剔除（预检 context 复用避免重复
    // 图谱查询；被剔除的旧页面文件先归档留档，不再静默消失）
    const precheck = runPagePrechecks(contextBuilder, wikiDir, agentDir, archiveLabel, pages);
    pages = precheck.pages;
    const prebuiltContexts = precheck.prebuiltContexts;
    skippedPages.push(...precheck.skipped);
    legacyRemoved.push(...precheck.legacyRemoved);

    // 接管式清理（update 模式路径；full 模式写盘前整目录重建，跳过）：
    // 旧版扁平产物 + 已退休页面路径 + 未列入计划的主题页/章节页/编号目录残留 + 空目录
    if (mode !== 'full') {
      cleanupStaleNumberedDirFiles(wikiDir, pages);
      legacyRemoved.push(
        ...cleanupLegacyFlatFiles(wikiDir, pages),
        ...cleanupRetiredPages(wikiDir),
        ...cleanupStaleTopicPages(wikiDir, pages),
        ...cleanupStaleChapterPages(wikiDir, pages),
        ...removeEmptyOwnedDirs(wikiDir),
      );
    }

    // 质量闸门输入：本次计划写入的页面路径 + 仓库真实文件清单
    const plannedPaths = new Set(pages.map(p => pageRelPath(p)));

    const claimStats: Array<{ page: string } & ClaimStats> = [];
    const citationStats: Array<{ page: string; cited: number; invalid: number }> = [];
    const intentCoverage: Array<{ page: string; counts: Record<string, number> }> = [];

    // 持久化确认（confirmations.json v2 指纹条目）：指纹仍有效的 claim 本次免标；
    // 过期条目（HEAD 变且文件哈希失配 / 歧义名 HEAD-scoped 过期）重新进入待确认
    // 队列并从 store 剪除，计数进构建报告（不静默沿用）。
    const hashOf = hashFileContent(this.scanResult.rootDir);
    const storedEntries = loadConfirmedEntries(agentDir);
    const { validRaws: persistedConfirmed, stale: staleConfirmed } =
      evaluateConfirmedEntries(storedEntries, repoHead, hashOf);
    // store 内保留未过期条目（有效条目 + 尚未到期的），过期条目构建后统一剪除落盘
    const staleSet = new Set(staleConfirmed);
    let confirmedEntries = storedEntries.filter(e => !staleSet.has(e));

    // full 模式：写盘前整目录重建（此刻规划已全部成功，后续任意页失败也有逐页降级兑底）；
    // 清空前先归档旧产物（.scx-wiki-agent/archive/<head>/）——高价值历史内容
    // 一旦掉出判定窗口仍有档可查，归档 fail-open 绝不阻断构建
    if (mode === 'full') {
      const archived = archiveWikiDir(wikiDir, agentDir, archiveLabel);
      if (archived) {
        console.log(`[wiki] 旧产物已归档：${archived}`);
      }
      rmSync(wikiDir, { recursive: true, force: true });
      mkdirSync(wikiDir, { recursive: true });
    }

    // ---- 阶段一：全部页面内存生成 + 断言校验（不写盘） ----
    // 两阶段的目的：待确认项是生成与校验的产物，只能在生成后收集；而交互裁决
    // 必须发生在写盘前——确认结果在内存改写最终内容，统一过闸写盘，update 模式
    // 的内容比较也因此基于裁决后的终稿。
    const producedEntries = await generateAllPages(
      this.verify, this.scanResult.rootDir,
      pages, prebuiltContexts, contextBuilder, fallbackBuilder, pageGenerator,
      noLlm, onChunk, plannedPaths, knownFiles, productionKnownFiles,
      persistedConfirmed, continuations, sectionedPages, thinkingOnly, llmDropped,
      skippedPages,
      (p: string) => { currentPage = p; },
      claimStats, citationStats, intentCoverage,
    );

    // ---- 跨页审校（阶段一产物上的全局 pass：重复检测/确定性降级/Related 亲和度） ----
    // 时序：降级动作必须在阶段二（confirmation）之前——待确认项收集依赖改写后的正文。
    const contexts = new Map<string, unknown>(
      producedEntries.filter(e => e.context !== undefined).map(e => [e.page, e.context as unknown]),
    );
    const { report: crossReport, crossLinks } = crosspageReview({
      pages: producedEntries.map(e => ({ page: e.page, content: e.content, evidenceFiles: e.evidenceFiles })),
      contexts,
      plannedPages: pages,
    });
    for (const entry of producedEntries) {
      if (crossReport.actions.length === 0) break;
      entry.content = applyCrossPageActions(entry.content, entry.context, entry.page, crossReport.actions);
    }

    // ---- 幽灵链接剥离（写盘前的确定性清洗）----
    // LLM 正文可能链接到「注册表有名但本次未规划」的页面（如 routing 页被跳过），
    // dead-link 规则只 warn 不拦截——此处直接把死链降格为纯文本。
    let ghostStripped = 0;
    for (const entry of producedEntries) {
      const [cleaned, n] = stripUnplannedPageLinks(entry.content, plannedPaths);
      if (n > 0) {
        entry.content = cleaned;
        ghostStripped += n;
      }
    }

    // IPC 对账摘要（口径局限 vs 真孤儿，供人工核对页面断言与扫描盲区一致性）
    const ipcConsistency = summarizeIpcConsistency(contexts.values());

    // ---- 阶段二：待确认项人工裁决（生成后、写盘前，单次会话跨页去重） ----
    const confirmResult = await runConfirmPhase(
      options, producedEntries, repoHead, hashOf, confirmedEntries, staleConfirmed.length, this.verify,
    );
    confirmedEntries = confirmResult.entries;
    // 过期剪除/新增条目统一落盘（无会话或会话无待裁决项时也剪除过期条目）
    if (confirmResult.dirty) {
      saveConfirmedEntries(agentDir, confirmedEntries);
    }

    // ---- 阶段三：写盘（write-phase 模块负责闸门与 update 比较） ----
    const writeResult = writeProducedPages(
      wikiDir, mode, producedEntries, pages, plannedPaths, knownFiles, productionKnownFiles, this.verify,
      crossLinks,
    );

    printBuildReport(
      writeResult.writtenPages,
      [...skippedPages, ...writeResult.skippedPages],
      writeResult.qualityReports,
      legacyRemoved,
      continuations,
      sectionedPages,
      thinkingOnly,
      llmDropped,
      outlineReport,
      claimStats,
      citationStats,
      intentCoverage,
      confirmResult.summary,
      {
        valid: persistedConfirmed.size,
        staleRaws: staleConfirmed.map(e => e.raw),
      },
      { issues: crossReport.issues, actions: crossReport.actions },
      intentProvider.candidateStats(),
      this.safeGraphLanguages(),
      ipcConsistency,
      ghostStripped,
      getChannelStats(),
    );
    return writeResult.filenames;
  }

  /** 图谱语言覆盖（fail-open：查询失败返回 undefined 不占报告行） */
  private safeGraphLanguages(): Array<{ language: string; file_count: number }> | undefined {
    try {
      return this.client.getArchitecture().languages;
    } catch {
      return undefined;
    }
  }

  private async planOutline(
    generator: WikiPageGenerator,
    topics: TopicDefinition[],
    knownFiles: Set<string>,
  ): Promise<OutlineFileData | null> {
    const planner = new OutlinePlanner(this.client, this.scanResult);
    const proposed = await planner.plan(generator, topics);
    if (proposed === null) {
      console.warn('[wiki] 章节树规划失败（LLM 输出不可解析），本次跳过章节页；可用 --refresh-outline 重试');
      return null;
    }

    const preCheck = validateOutline(proposed, this.verify.outlineKnown(knownFiles, proposed));
    if (preCheck.chapters.length === 0 && preCheck.drops.length > 0) {
      const feedback = preCheck.drops
        .map(d => `${d.page ? `${d.chapter}/${d.page}` : d.chapter}：${d.reasons.join('；')}`)
        .join('；');
      const retried = await planner.plan(generator, topics, feedback);
      if (retried !== null) {
        const recheck = validateOutline(retried, this.verify.outlineKnown(knownFiles, retried));
        if (recheck.chapters.length > 0) return retried;
      }
    }
    return proposed;
  }
}
