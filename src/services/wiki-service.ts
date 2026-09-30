import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, relative } from 'path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ScanResult } from '../core/scanner.js';
import { WikiContextBuilder } from '../knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../knowledge/wiki-fallback-builder.js';
import { WikiPageGenerator } from '../knowledge/wiki-page-generator.js';
import { sanitizeWikiOutput } from '../knowledge/wiki-output-sanitizer.js';
import { validatePageContent } from '../knowledge/wiki-quality-validator.js';
import type { PageQualityReport } from '../knowledge/wiki-quality-validator.js';
import { verifyAndAnnotateClaims, collectContextKeys } from '../knowledge/claim-verifier.js';
import type { ClaimStats } from '../knowledge/claim-verifier.js';
import {
  collectPendingConfirmations,
  applyConfirmations,
  loadConfirmedClaims,
  saveConfirmedClaims,
} from '../knowledge/confirmation.js';
import type { ConfirmationDecision } from '../knowledge/confirmation.js';
import { extractDefinedSymbolNames } from '../knowledge/source-fallback.js';
import { IntentEvidenceProvider, countIntentEvidence } from '../knowledge/intent-evidence.js';
import { collectEvidenceFiles, buildEvidenceBlock, injectEvidenceBlock } from '../knowledge/wiki-evidence.js';
import { ConfigDetector } from '../knowledge/config-detector.js';
import { TopicDiscovery, loadTopics, saveTopics } from '../knowledge/topic-discovery.js';
import type { TopicDefinition } from '../knowledge/topic-discovery.js';
import { loadOutline, saveOutline, validateOutline } from '../knowledge/outline.js';
import type { OutlineFileData, OutlineKnown, OutlineReport } from '../knowledge/outline.js';
import { OutlinePlanner } from '../knowledge/outline-planner.js';
import {
  PAGE_REGISTRY, ALL_PAGE_NAMES, tier2PagesFor,
  findPageDescriptor, pageRelPath, buildRelatedSection, RETIRED_WIKI_PATHS,
  isTopicPage, topicPageName, TOPIC_DIR,
  isChapterPage, chapterPageName, CHAPTER_DIR, ownedNumberedDirs,
} from '../knowledge/page-registry.js';
import type { WikiBuildOptions, DataFlowContext } from '../knowledge/types.js';

/** 单页产出结果：最终内容 + 走的生成路径 + LLM 路径放弃原因（仅降级时） */
interface PageProduced {
  content: string;
  source: 'llm' | 'fallback';
  llmDrop?: string;
}

/** 页面写盘结果状态 */
type PageStatus = 'created' | 'updated' | 'unchanged';

/** 两阶段构建的内存页产物（生成完成、写盘前，可能还要过人工裁决改写） */
interface ProducedEntry {
  page: string;
  relPath: string;
  source: 'llm' | 'fallback';
  /** 正文（已过断言校验标注，待裁决改写后注入锚定块写盘） */
  content: string;
  evidenceFiles: string[];
}

/** 人工裁决摘要（构建报告用；null = 本次未进入裁决阶段） */
interface ConfirmSummary {
  total: number;
  resolved: number;
  kept: number;
  persisted: number;
}

export class WikiService {
  constructor(
    private client: CodebaseMemoryClient,
    private scanResult: ScanResult,
  ) {}

  async buildWiki(wikiDir: string, options?: WikiBuildOptions): Promise<string[]> {
    // .wiki 为工具独占目录：full 模式在写盘前整目录重建（无陈旧残留、无外来目录，也不告警）。
    // wipe 安排在规划/预检之后：规划期异常直接中止时旧 .wiki 保持原样，不留下空目录。
    // update 模式保留存量以便内容一致时跳过重写，陈旧产物由逐路径清理负责。
    const mode = options?.mode ?? 'full';
    mkdirSync(wikiDir, { recursive: true });

    // 确保图谱已索引（替代旧的 index 阶段）
    this.client.ensureIndexed('moderate');

    // 主题页定义：topics.json 锁定（缺失或 --refresh-topics 时确定性探测）
    const agentDir = join(dirname(wikiDir), '.scx-wiki-agent');
    let topics = options?.refreshTopics ? null : loadTopics(agentDir);
    if (topics === null) {
      topics = new TopicDiscovery(this.client, this.scanResult).discover();
      saveTopics(agentDir, topics);
    }
    const topicPages = topics.map(t => topicPageName(t.id));

    // 页生成器（章树 planner 复用其模型能力）与通知统计，声明在前供 planner 触发
    const noLlm = options?.noLlm ?? false;
    const continuations: Array<{ page: string; rounds: number; truncated: boolean }> = [];
    const sectionedPages: Array<{ page: string; sections: number; continuedSections: number; truncated: boolean }> = [];
    const llmDropped: Array<{ page: string; reason: string }> = [];
    let currentPage = '';
    const pageGenerator = new WikiPageGenerator(
      options?.model, options?.baseURL, options?.apiKey,
      n => {
        if (n.kind === 'continuation') {
          continuations.push({ page: currentPage, rounds: n.rounds, truncated: n.truncated });
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
      outlineReport = validateOutline(outlineRaw, this.outlineKnown(knownFiles, outlineRaw));
      chapterPages = outlineReport.chapters.flatMap(c => c.pages.map(p => chapterPageName(c.id, p.id)));
    }

    // 决定生成哪些页面（校验页名合法性）
    let pages = this.resolvePages(options?.pages, topicPages, chapterPages);

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

    const filenames: string[] = [];
    const writtenPages: Array<{ page: string; relPath: string; source: string; status: PageStatus }> = [];
    const skippedPages: Array<{ page: string; reason: string }> = [];
    const legacyRemoved: string[] = [];

    // data-flow 预检：无执行序列数据时整页剔除（诚实空壳页对读者无价值）。
    // 必须在 plannedPaths / README 索引 / 编号目录清理计算前完成，否则目录表与 Related
    // 会出现指向未产出页的死链。预检构建的 context 存入 prebuiltContexts 复用
    // （getArchitecture 无缓存，避免同一图谱查询跑两遍）。
    const prebuiltContexts = new Map<string, unknown>();
    if (pages.includes('data-flow')) {
      const dfContext = contextBuilder.buildByName('data-flow', pages) as DataFlowContext | null;
      if (dfContext && dfContext.sequences.length > 0) {
        prebuiltContexts.set('data-flow', dfContext);
      } else {
        pages = pages.filter(p => p !== 'data-flow');
        const oldRel = pageRelPath('data-flow');
        const oldPath = join(wikiDir, oldRel);
        if (existsSync(oldPath)) {
          rmSync(oldPath);
          legacyRemoved.push(oldRel);
        }
        skippedPages.push({ page: 'data-flow', reason: '无执行序列数据（可信 CALLS 边不足），跳过空壳页生成' });
      }
    }

    // decisions 预检：git 演进/文档决策证据全缺时整页剔除（复用 data-flow 同款模式，
    // 避免规划表与 Related 出现死链；预检 context 复用避免重复探测）
    if (pages.includes('decisions')) {
      const decContext = contextBuilder.buildByName('decisions', pages);
      if (decContext !== null && decContext !== undefined) {
        prebuiltContexts.set('decisions', decContext);
      } else {
        pages = pages.filter(p => p !== 'decisions');
        const oldRel = pageRelPath('decisions');
        const oldPath = join(wikiDir, oldRel);
        if (existsSync(oldPath)) {
          rmSync(oldPath);
          legacyRemoved.push(oldRel);
        }
        skippedPages.push({ page: 'decisions', reason: '无决策证据（git 历史/设计文档均不可用），跳过空壳页生成' });
      }
    }

    // 接管式清理（update 模式路径；full 模式写盘前整目录重建，跳过）：
    // 旧版扁平产物 + 已退休页面路径 + 未列入计划的主题页/章节页/编号目录残留 + 空目录
    if (mode !== 'full') {
      this.cleanupStaleNumberedDirFiles(wikiDir, pages);
      legacyRemoved.push(
        ...this.cleanupLegacyFlatFiles(wikiDir, pages),
        ...this.cleanupRetiredPages(wikiDir),
        ...this.cleanupStaleTopicPages(wikiDir, pages),
        ...this.cleanupStaleChapterPages(wikiDir, pages),
        ...this.removeEmptyOwnedDirs(wikiDir),
      );
    }

    // 质量闸门输入：本次计划写入的页面路径 + 仓库真实文件清单
    const plannedPaths = new Set(pages.map(p => pageRelPath(p)));

    const qualityReports: PageQualityReport[] = [];
    const claimStats: Array<{ page: string } & ClaimStats> = [];
    const intentCoverage: Array<{ page: string; counts: Record<string, number> }> = [];

    // 持久化确认白名单（confirmations.json）：上次构建确认过的 claim 本次直接免标
    const persistedConfirmed = loadConfirmedClaims(agentDir);

    // full 模式：写盘前整目录重建（此刻规划已全部成功，后续任意页失败也有逐页降级兑底）
    if (mode === 'full') {
      rmSync(wikiDir, { recursive: true, force: true });
      mkdirSync(wikiDir, { recursive: true });
    }

    // ---- 阶段一：全部页面内存生成 + 断言校验（不写盘） ----
    // 两阶段的目的：待确认项是生成与校验的产物，只能在生成后收集；而交互裁决
    // 必须发生在写盘前——确认结果在内存改写最终内容，统一过闸写盘，update 模式
    // 的内容比较也因此基于裁决后的终稿。
    const producedEntries: ProducedEntry[] = [];

    for (const page of pages) {
      const relPath = pageRelPath(page);
      currentPage = page;

      const pageContext = prebuiltContexts.get(page) ?? contextBuilder.buildByName(page, pages);
      if (pageContext === null || pageContext === undefined) {
        skippedPages.push({ page, reason: '页面 context 未实现，跳过写盘' });
        continue;
      }

      // 意图证据覆盖统计（构建报告「为什么」含量度量）
      const intentCounts = countIntentEvidence(pageContext);
      if (Object.keys(intentCounts).length > 0) {
        intentCoverage.push({ page, counts: intentCounts });
      }

      // LLM 输出在生成阶段过闸：error 级违规直接降级规则路径
      const pageKnownFiles = page === 'testing' ? knownFiles : productionKnownFiles;
      const gate = (content: string): boolean =>
        validatePageContent(content, { page, pagePath: relPath, knownFiles: pageKnownFiles, plannedPaths }).passed;

      const produced = await this.generatePage(
        page, pageContext, fallbackBuilder, pageGenerator, noLlm, onChunk, gate,
      );
      if (produced.llmDrop) {
        llmDropped.push({ page, reason: produced.llmDrop });
      }

      // 正文断言校验（仅 LLM 页）：三级核验后，查无实据的标识符标注「待确认」。
      // universe 并入：源码回落符号 + 声明依赖名 + 本页 context 数据字段名
      // （前两者防真实符号/依赖被误杀，后者防工具自家数据契约字段被误杀）；
      // confirmed 为人工确认白名单（confirmations.json），命中即免标。
      let bodyContent = produced.content;
      if (produced.source === 'llm') {
        const universe = new Set(this.getSymbolUniverse(
          contextBuilder.getFallbackSymbolNames(),
          page === 'testing' ? 'all' : 'production',
        ));
        for (const dep of contextBuilder.getDepNames()) universe.add(dep);
        for (const key of collectContextKeys(pageContext)) universe.add(key);
        const verified = verifyAndAnnotateClaims(bodyContent, {
          symbols: universe,
          knownFiles: pageKnownFiles,
          grepCount: pattern => {
            const result = this.client.searchCode(pattern, 20);
            return result.files.some(file => pageKnownFiles.has(file))
              ? result.totalGrepMatches
              : 0;
          },
          confirmed: persistedConfirmed,
        });
        bodyContent = verified.content;
        claimStats.push({ page, ...verified.stats });
      }

      producedEntries.push({
        page,
        relPath,
        source: produced.source,
        content: bodyContent,
        evidenceFiles: collectEvidenceFiles(pageContext, pageKnownFiles, this.scanResult.rootDir),
      });
    }

    // ---- 阶段二：待确认项人工裁决（生成后、写盘前，单次会话跨页去重） ----
    let confirmSummary: ConfirmSummary | null = null;
    if (options?.confirmSession) {
      const items = collectPendingConfirmations(
        producedEntries.map(e => ({ page: e.page, content: e.content })),
      );
      if (items.length > 0) {
        const decisions = await options.confirmSession(items);
        const byKey = new Map<string, ConfirmationDecision>(decisions.map(d => [d.key, d]));
        for (const entry of producedEntries) {
          entry.content = applyConfirmations(entry.content, byKey);
        }
        // 确认的 claim 持久化：后续构建经白名单自动免标，不再重复打扰
        const resolvedClaims = decisions
          .filter(d => d.action === 'resolve' && d.kind === 'claim')
          .map(d => d.key.slice('claim\n'.length));
        const persisted = resolvedClaims.length > 0
          ? saveConfirmedClaims(agentDir, resolvedClaims)
          : 0;
        confirmSummary = {
          total: items.length,
          resolved: decisions.filter(d => d.action === 'resolve').length,
          kept: items.length - decisions.filter(d => d.action === 'resolve').length,
          persisted,
        };
      }
    }

    // ---- 阶段三：注入锚定块 + 写盘前闸门 + 写盘（update 模式在终稿上比较） ----
    for (const entry of producedEntries) {
      const { page, relPath, source } = entry;

      // 页首证据锚定块（确定性注入，LLM 无法伪造）+ 页底 Related 区块
      const content =
        injectEvidenceBlock(entry.content, buildEvidenceBlock(entry.evidenceFiles)) +
        buildRelatedSection(page, pages);

      // 写盘前质量闸门（LLM 与规则路径都过闸）
      const report = validatePageContent(
        content, {
          page, pagePath: relPath,
          knownFiles: entry.page === 'testing' ? knownFiles : productionKnownFiles,
          plannedPaths,
          tier: findPageDescriptor(page)?.tier,
        },
      );
      qualityReports.push(report);
      if (!report.passed) {
        const errors = report.issues
          .filter(i => i.severity === 'error')
          .map(i => i.message)
          .join('; ');
        skippedPages.push({ page, reason: `质量闸门拦截：${errors}` });
        continue;
      }

      const targetPath = join(wikiDir, relPath);
      const existed = existsSync(targetPath);

      // update 模式：内容与现有文件一致时跳过重写（project-wiki「只改过时部分」）
      if (mode === 'update' && existed && readFileSync(targetPath, 'utf-8') === content) {
        filenames.push(relPath);
        writtenPages.push({ page, relPath, source, status: 'unchanged' });
        continue;
      }

      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, content, 'utf-8');
      filenames.push(relPath);
      writtenPages.push({ page, relPath, source, status: existed ? 'updated' : 'created' });
    }

    this.printBuildReport(writtenPages, skippedPages, qualityReports, legacyRemoved, continuations, sectionedPages, llmDropped, outlineReport, claimStats, intentCoverage, confirmSummary);
    return filenames;
  }

  /**
   * 解析 --pages 参数，校验页名合法性。
   *
   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）
   *   + 按 projectType 激活的 surface 层（Tier2）。
   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。
   */
  private resolvePages(requested: string[] | undefined, topicPages: string[], chapterPages: string[]): string[] {
    const basePages = PAGE_REGISTRY
      .filter(p => p.tier !== 'surface')
      .map(p => p.name);
    const tier2 = tier2PagesFor(this.scanResult.projectType);
    const allPages = [...basePages, ...tier2, ...topicPages, ...chapterPages];

    if (!requested || requested.length === 0) {
      return allPages;
    }
    // 校验：过滤非法页名并告警（注册表页名与已锁定的 topic:<id> / chapter:<c>/<p> 均合法）
    const valid: string[] = [];
    for (const name of requested) {
      const legal = ALL_PAGE_NAMES.includes(name)
        || (isTopicPage(name) && topicPages.includes(name))
        || (isChapterPage(name) && chapterPages.includes(name));
      if (legal) {
        valid.push(name);
      } else {
        console.warn(`[wiki] 未知页面 "${name}"，已跳过。可用页面: ${ALL_PAGE_NAMES.join(', ')}${topicPages.length > 0 ? `，${topicPages.join(', ')}` : ''}${chapterPages.length > 0 ? `，${chapterPages.join(', ')}` : ''}`);
      }
    }
    return valid.length > 0 ? valid : allPages;
  }

  /** 图谱符号名全集（断言校验一级核验；按页面作用域缓存）。
   *  fallback 为源码回落/IPC 扫描找到的名字——必须并入，否则工具自己注入的
   *  证据会被断言校验反手标成「待确认」（自证矛盾）。production 作用域只采纳
   *  能定位到生产扫描文件的图谱符号，防止 is_test 标记失准的测试符号背书。 */
  private symbolUniverses = new Map<'all' | 'production', Set<string>>();
  private getSymbolUniverse(
    fallback?: ReadonlySet<string>,
    scope: 'all' | 'production' = 'all',
  ): Set<string> {
    let universe = this.symbolUniverses.get(scope);
    if (universe === undefined) {
      const q = this.client.queryGraph(
        'MATCH (n) WHERE n.is_test = false RETURN n.name AS name, n.file_path AS file LIMIT 5000',
        5000,
      );
      const productionPaths = new Set(this.scanResult.productionFiles.map(f => f.relativePath));
      universe = new Set();
      for (const row of q.rows) {
        const rawFile = String(row[1] ?? '');
        const file = isAbsolute(rawFile)
          ? relative(this.scanResult.rootDir, rawFile).replace(/\\/g, '/')
          : rawFile;
        if (scope === 'production' && !productionPaths.has(file)) continue;
        universe.add(String(row[0]));
      }
      this.symbolUniverses.set(scope, universe);
    }
    if (!fallback || fallback.size === 0) return universe;
    const merged = new Set(universe);
    for (const n of fallback) merged.add(n);
    return merged;
  }

  /**
   * 章节树规划：LLM 提议 → 校验器裁决；净树为空且存在剔除时，
   * 携剔除原因反馈重试一次（仍空则返回首轮产物，交由正常校验路径降级）。
   * 输出不可解析返回 null。
   */
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

    const preCheck = validateOutline(proposed, this.outlineKnown(knownFiles, proposed));
    if (preCheck.chapters.length === 0 && preCheck.drops.length > 0) {
      const feedback = preCheck.drops
        .map(d => `${d.page ? `${d.chapter}/${d.page}` : d.chapter}：${d.reasons.join('；')}`)
        .join('；');
      const retried = await planner.plan(generator, topics, feedback);
      if (retried !== null) {
        const recheck = validateOutline(retried, this.outlineKnown(knownFiles, retried));
        if (recheck.chapters.length > 0) return retried;
      }
    }
    return proposed;
  }

  /** 组装章节树校验参考集：模块来自架构包，符号来自 outline 引用文件
   *  （图谱有界查询 + 源码正则回落——图谱漏采的 brief 符号免于 W3「查无实据」误剔） */
  private outlineKnown(knownFiles: Set<string>, outlineRaw: unknown): OutlineKnown {    const arch = this.client.getArchitecture();
    const rawChapters = (outlineRaw as { chapters?: unknown })?.chapters;
    const refFiles = [...new Set(
      (Array.isArray(rawChapters) ? rawChapters : [])
        .flatMap((c: { pages?: unknown }) => (Array.isArray(c?.pages) ? c.pages : []))
        .flatMap((p: { files?: unknown }) => (Array.isArray(p?.files) ? p.files : []) as string[]),
    )].filter(f => knownFiles.has(f));

    const symbols = new Set<string>();
    if (refFiles.length > 0) {
      const fileList = refFiles.map(f => `"${f.replace(/"/g, '\\"')}"`).join(',');
      const q = this.client.queryGraph(
        `MATCH (n) WHERE n.file_path IN [${fileList}] AND n.is_test = false
         RETURN DISTINCT n.name AS name LIMIT 2000`,
      );
      for (const row of q.rows) symbols.add(row[0] as string);
      for (const name of extractDefinedSymbolNames(refFiles, this.scanResult, this.outlineSourceCache)) {
        symbols.add(name);
      }
    }
    return { files: knownFiles, modules: new Set(arch.packages.map(p => p.name)), symbols };
  }

  /** outlineKnown 源码回落专用缓存（绝对路径 → 内容） */
  private outlineSourceCache = new Map<string, string | null>();

  /**
   * 清理旧版扁平输出（wiki 根下的 ${page}.md）。
   * 只删除本工具拥有的页面文件；编号目录接管后这些扁平文件成为陈旧残留。
   * readme 特例：旧 'readme.md' 让位于 'README.md'。
   * 用目录条目精确比对文件名：大小写不敏感文件系统上 existsSync('readme.md')
   * 会误命中 'README.md'，导致每次构建都误删并重写 README。
   */
  private cleanupLegacyFlatFiles(wikiDir: string, pages: string[]): string[] {
    const removed: string[] = [];
    let entries: Set<string> | null = null;
    for (const page of pages) {
      const flat = `${page}.md`;
      if (pageRelPath(page) === flat) continue;
      if (entries === null) {
        try {
          entries = new Set(readdirSync(wikiDir));
        } catch {
          return removed;
        }
      }
      if (!entries.has(flat)) continue;
      rmSync(join(wikiDir, flat));
      removed.push(flat);
    }
    return removed;
  }

  /** 清理已退休页面路径的残留文件（改名/下线登记于 RETIRED_WIKI_PATHS）；清空的宿主目录一并移除 */
  private cleanupRetiredPages(wikiDir: string): string[] {
    const removed: string[] = [];
    for (const rel of RETIRED_WIKI_PATHS) {
      const target = join(wikiDir, rel);
      if (existsSync(target)) {
        rmSync(target);
        removed.push(rel);
        const dir = dirname(target);
        try {
          if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
        } catch {
          // 目录不存在或不可读则忽略
        }
      }
    }
    return removed;
  }

  /** 清理 08-topics 下未列入本次计划的主题文件（目录为工具所有） */
  private cleanupStaleTopicPages(wikiDir: string, pages: string[]): string[] {
    const topicDir = join(wikiDir, TOPIC_DIR);
    if (!existsSync(topicDir)) return [];
    const planned = new Set(pages.filter(isTopicPage).map(pageRelPath));
    const removed: string[] = [];
    for (const entry of readdirSync(topicDir)) {
      if (!entry.endsWith('.md') || planned.has(`${TOPIC_DIR}/${entry}`)) continue;
      rmSync(join(topicDir, entry));
      removed.push(`${TOPIC_DIR}/${entry}`);
    }
    return removed;
  }

  /** 清理 09-chapters 下未列入本次计划的章节页残留；清空的章目录与章节根目录一并移除（目录为工具所有） */
  private cleanupStaleChapterPages(wikiDir: string, pages: string[]): string[] {
    const chapterRoot = join(wikiDir, CHAPTER_DIR);
    if (!existsSync(chapterRoot)) return [];
    const planned = new Set(pages.filter(isChapterPage).map(pageRelPath));
    const removed: string[] = [];
    for (const chapterEntry of readdirSync(chapterRoot)) {
      const chapterDir = join(chapterRoot, chapterEntry);
      let entries: string[];
      try {
        entries = readdirSync(chapterDir);
      } catch {
        continue; // 非目录（用户文件）不动
      }
      let kept = 0;
      for (const file of entries) {
        const rel = `${CHAPTER_DIR}/${chapterEntry}/${file}`;
        if (file.endsWith('.md') && !planned.has(rel)) {
          rmSync(join(chapterDir, file));
          removed.push(rel);
        } else {
          kept++;
        }
      }
      if (kept === 0) rmSync(chapterDir, { recursive: true });
    }
    try {
      if (readdirSync(chapterRoot).length === 0) rmSync(chapterRoot, { recursive: true });
    } catch {
      // 目录不可读则保留
    }
    return removed;
  }

  /** 清理后扫描：清空的工具编号目录一并移除（update 模式下页面全部停写/剔除后的残留空目录） */
  private removeEmptyOwnedDirs(wikiDir: string): string[] {
    const removed: string[] = [];
    for (const dir of ownedNumberedDirs()) {
      const dirPath = join(wikiDir, dir);
      try {
        if (readdirSync(dirPath).length === 0) {
          rmSync(dirPath, { recursive: true });
          removed.push(`${dir}/`);
        }
      } catch {
        // 不存在或非目录则跳过
      }
    }
    return removed;
  }

  /**
   * 编号目录治理（update 模式路径；.wiki 为工具独占目录，full 模式已整目录重建）：
   * - 工具所有的编号目录（PAGE_REGISTRY 声明 + 08/09，后两者由专属清理负责，此处跳过）：
   *   目录内文件名落在注册页名空间（ALL_PAGE_NAMES）但未列入本次计划的 .md 视为
   *   旧版产物残留（如旧版章节页 01-overview/architecture.md），清理；
   *   页名空间之外的文件一并清理（目录为工具独占）。
   * - 白名单之外的编号目录：旧版/其他工具残留，直接删除（工具独占目录，不告警）。
   */
  private cleanupStaleNumberedDirFiles(wikiDir: string, pages: string[]): void {
    const planned = new Set(pages.map(pageRelPath));
    const owned = new Set(ownedNumberedDirs());
    let topEntries: string[];
    try {
      topEntries = readdirSync(wikiDir);
    } catch {
      return;
    }
    for (const entry of topEntries) {
      if (!/^\d{2}-/.test(entry)) continue;
      const dirPath = join(wikiDir, entry);
      let entries: string[];
      try {
        entries = readdirSync(dirPath);
      } catch {
        continue; // 非目录不动
      }
      if (entry === TOPIC_DIR || entry === CHAPTER_DIR) continue; // 专属清理负责
      if (owned.has(entry)) {
        for (const file of entries) {
          const rel = `${entry}/${file}`;
          // 目录为工具独占：未列入计划的 .md 一律清理，不区分页名空间
          if (file.endsWith('.md') && !planned.has(rel)) {
            rmSync(join(dirPath, file));
          }
        }
      } else {
        rmSync(dirPath, { recursive: true });
      }
    }
  }

  private async generatePage(
    page: string,
    pageContext: unknown,
    fallback: WikiFallbackBuilder,
    generator: WikiPageGenerator,
    noLlm: boolean,
    onChunk: (filename: string, text: string) => void,
    gate?: (content: string) => boolean,
  ): Promise<PageProduced> {
    let llmDrop: string | undefined;
    if (!noLlm && generator.hasModel()) {
      try {
        const content = await generator.generateByName(page, pageContext, (text) => onChunk(page, text));
        if (content.trim().length > 0) {
          // 清理 LLM 输出残骸（首行寒暄、markdown 围栏，R2 时序图告警）
          const cleaned = sanitizeWikiOutput(content, page);
          if (!gate || gate(cleaned)) {
            return { content: cleaned, source: 'llm' };
          }
          // LLM 输出未过质量闸门 → 降级规则路径
          llmDrop = '质量闸门未过';
        } else {
          llmDrop = 'LLM 输出为空';
        }
      } catch {
        llmDrop = 'LLM 生成异常';
      }
    }
    return { content: fallback.buildByName(page, pageContext), source: 'fallback', llmDrop };
  }

  /**
   * 构建报告（对应 project-wiki「完成后清单」）：
   * 已写页面（新增/更新分计 + 生成路径统计）、update 模式变更摘要、
   * 跳过页面及原因、锚点核验统计、告警汇总。
   */
  private printBuildReport(
    written: Array<{ page: string; relPath: string; source: string; status: PageStatus }>,
    skipped: Array<{ page: string; reason: string }>,
    reports: PageQualityReport[],
    legacyRemoved: string[],
    continuations: Array<{ page: string; rounds: number; truncated: boolean }>,
    sectionedPages: Array<{ page: string; sections: number; continuedSections: number; truncated: boolean }>,
    llmDropped: Array<{ page: string; reason: string }>,
    outline: OutlineReport | null,
    claimStats: Array<{ page: string } & ClaimStats>,
    intentCoverage: Array<{ page: string; counts: Record<string, number> }>,
    confirmSummary: ConfirmSummary | null,
  ): void {
    const lines: string[] = ['[wiki] 构建报告：'];

    const created = written.filter(w => w.status === 'created');
    const updated = written.filter(w => w.status === 'updated');
    const unchanged = written.filter(w => w.status === 'unchanged');
    const llmCount = written.filter(w => w.source === 'llm').length;
    const writtenCount = created.length + updated.length;
    lines.push(
      `  已写入 ${writtenCount} 页（新增 ${created.length} / 更新 ${updated.length}；LLM ${llmCount} / 规则 ${writtenCount - llmCount}）`,
    );

    if (unchanged.length > 0) {
      lines.push(`  未变 ${unchanged.length} 页（update 模式内容一致，跳过重写）`);
    }
    if (unchanged.length > 0 && writtenCount > 0) {
      lines.push(`  本次变更文件：${[...created, ...updated].map(w => w.relPath).join('、')}`);
    }

    if (outline) {
      if (outline.unparsable) {
        lines.push('  章节树：outline.json 结构不合规，已忽略（固定页面照常构建）');
      } else {
        const pageTotal = outline.chapters.reduce((n, c) => n + c.pages.length, 0);
        lines.push(`  章节树：${outline.chapters.length} 章 ${pageTotal} 页生效`);
        for (const d of outline.drops) {
          const at = d.page ? `${d.chapter}/${d.page}` : d.chapter;
          lines.push(`    - 剔除 ${at}（${d.title}）：${d.reasons.join('；')}`);
        }
        for (const w of outline.warnings) {
          lines.push(`    - [${w.code}] ${w.target}：${w.message}`);
        }
      }
    }

    if (continuations.length > 0) {
      const detail = continuations
        .map(c => `${c.page}（续 ${c.rounds} 轮${c.truncated ? '，末轮仍截断' : ''}）`)
        .join('、');
      lines.push(`  断流续写 ${continuations.length} 页：${detail}`);
    }

    if (sectionedPages.length > 0) {
      const detail = sectionedPages
        .map(s => `${s.page}（${s.sections} 节${s.continuedSections > 0 ? `·${s.continuedSections} 节续写` : ''}${s.truncated ? '·有节仍截断' : ''}）`)
        .join('、');
      lines.push(`  分节生成 ${sectionedPages.length} 页：${detail}`);
    }

    if (claimStats.length > 0) {
      const sum = claimStats.reduce(
        (acc, c) => ({ total: acc.total + c.total, unverified: acc.unverified + c.unverified, skipped: acc.skipped + c.skipped }),
        { total: 0, unverified: 0, skipped: 0 },
      );
      const flagged = claimStats
        .filter(c => c.unverified > 0)
        .map(c => `${c.page} ${c.unverified}`)
        .join('、');
      lines.push(
        `  断言校验 ${claimStats.length} 页：${sum.total - sum.unverified - sum.skipped}/${sum.total} 有实据，待确认 ${sum.unverified}${flagged ? `（${flagged}）` : ''}${sum.skipped > 0 ? `，未核验 ${sum.skipped}（超探测上限）` : ''}`,
      );
    }

    // 人工裁决摘要（两阶段构建的阶段二产物）
    if (confirmSummary) {
      lines.push(
        `  人工裁决：${confirmSummary.total} 项待确认（确认 ${confirmSummary.resolved} / 保持 ${confirmSummary.kept}），新增持久化确认 ${confirmSummary.persisted} 条（confirmations.json，后续构建免标）`,
      );
    }

    if (llmDropped.length > 0) {
      const detail = llmDropped.map(d => `${d.page}（${d.reason}）`).join('、');
      lines.push(`  LLM 降级规则 ${llmDropped.length} 页：${detail}`);
    }

    if (legacyRemoved.length > 0) {
      lines.push(`  清理陈旧产物 ${legacyRemoved.length} 个：${legacyRemoved.join(', ')}`);
    }

    if (skipped.length > 0) {
      lines.push(`  跳过 ${skipped.length} 页：`);
      for (const s of skipped) {
        lines.push(`    - ${s.page}: ${s.reason}`);
      }
    }

    const anchors = reports.reduce(
      (acc, r) => ({ total: acc.total + r.anchors.total, valid: acc.valid + r.anchors.valid }),
      { total: 0, valid: 0 },
    );
    if (anchors.total > 0) {
      lines.push(`  锚点核验：${anchors.valid}/${anchors.total} 可追溯到扫描文件清单`);
    }

    const evidenceCovered = reports.filter(r => r.evidence > 0).length;
    if (reports.length > 0) {
      lines.push(`  证据锚定：${evidenceCovered}/${reports.length} 页含源文件锚定块`);
    }

    // 意图证据覆盖（「为什么」含量度量：注释/git/文档/测试四通道）
    if (intentCoverage.length > 0) {
      const totals: Record<string, number> = {};
      for (const { counts } of intentCoverage) {
        for (const [kind, n] of Object.entries(counts)) totals[kind] = (totals[kind] ?? 0) + n;
      }
      const detail = Object.entries(totals).sort().map(([k, n]) => `${k} ${n}`).join(' / ');
      lines.push(`  意图证据：${intentCoverage.length} 页携带（${detail}）`);
    }

    const warns = reports.flatMap(r => r.issues.filter(i => i.severity === 'warn'));
    if (warns.length > 0) {
      lines.push(`  告警 ${warns.length} 条（不拦截写盘）：`);
      for (const w of warns.slice(0, 20)) {
        lines.push(`    - [${w.rule}] ${w.message}`);
      }
      if (warns.length > 20) {
        lines.push(`    - …另有 ${warns.length - 20} 条`);
      }
    }

    console.log(lines.join('\n'));
  }
}
