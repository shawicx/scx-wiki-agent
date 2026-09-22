import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ScanResult } from '../core/scanner.js';
import { WikiContextBuilder } from '../knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../knowledge/wiki-fallback-builder.js';
import { WikiPageGenerator } from '../knowledge/wiki-page-generator.js';
import { sanitizeWikiOutput } from '../knowledge/wiki-output-sanitizer.js';
import { validatePageContent } from '../knowledge/wiki-quality-validator.js';
import type { PageQualityReport } from '../knowledge/wiki-quality-validator.js';
import { collectEvidenceFiles, buildEvidenceBlock, injectEvidenceBlock } from '../knowledge/wiki-evidence.js';
import { ConfigDetector } from '../knowledge/config-detector.js';
import { TopicDiscovery, loadTopics, saveTopics } from '../knowledge/topic-discovery.js';
import {
  PAGE_REGISTRY, ALL_PAGE_NAMES, tier2PagesFor,
  findPageDescriptor, pageRelPath, buildRelatedSection, RETIRED_WIKI_PATHS,
  isTopicPage, topicPageName, TOPIC_DIR,
} from '../knowledge/page-registry.js';
import type { WikiBuildOptions } from '../knowledge/types.js';

/** 单页产出结果：最终内容 + 走的生成路径 + LLM 路径放弃原因（仅降级时） */
interface PageProduced {
  content: string;
  source: 'llm' | 'fallback';
  llmDrop?: string;
}

/** 页面写盘结果状态 */
type PageStatus = 'created' | 'updated' | 'unchanged';

export class WikiService {
  constructor(
    private client: CodebaseMemoryClient,
    private scanResult: ScanResult,
  ) {}

  async buildWiki(wikiDir: string, options?: WikiBuildOptions): Promise<string[]> {
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

    // 决定生成哪些页面（校验页名合法性）
    const pages = this.resolvePages(options?.pages, topicPages);

    // 检测式配置探测器：探测项目实际配置（package.json/lockfile/eslint/...），
    // 复用 scanResult 的源文件列表避免重复扫描
    const detector = new ConfigDetector(this.scanResult.rootDir);
    detector.setSourceFiles(this.scanResult.files.map(f => f.absolutePath));

    const contextBuilder = new WikiContextBuilder(this.client, this.scanResult, detector);
    contextBuilder.setTopics(topics);
    const fallbackBuilder = new WikiFallbackBuilder();
    const noLlm = options?.noLlm ?? false;
    const onChunk = options?.onChunk ?? (() => {});

    // 接管式重建：清理旧版扁平产物 + 已退休页面路径 + 未列入计划的主题页残留
    const legacyRemoved = [
      ...this.cleanupLegacyFlatFiles(wikiDir, pages),
      ...this.cleanupRetiredPages(wikiDir),
      ...this.cleanupStaleTopicPages(wikiDir, pages),
    ];

    // 质量闸门输入：本次计划写入的页面路径 + 仓库真实文件清单
    const plannedPaths = new Set(pages.map(p => pageRelPath(p)));
    const knownFiles = new Set(this.scanResult.files.map(f => f.relativePath));

    const filenames: string[] = [];
    const writtenPages: Array<{ page: string; relPath: string; source: string; status: PageStatus }> = [];
    const skippedPages: Array<{ page: string; reason: string }> = [];
    const qualityReports: PageQualityReport[] = [];
    const continuations: Array<{ page: string; rounds: number; truncated: boolean }> = [];
    const llmDropped: Array<{ page: string; reason: string }> = [];
    const mode = options?.mode ?? 'full';

    let currentPage = '';
    const pageGenerator = new WikiPageGenerator(
      options?.model, options?.baseURL, options?.apiKey,
      n => continuations.push({ page: currentPage, rounds: n.rounds, truncated: n.truncated }),
    );

    for (const page of pages) {
      const relPath = pageRelPath(page);
      currentPage = page;

      const pageContext = contextBuilder.buildByName(page, pages);
      if (pageContext === null || pageContext === undefined) {
        skippedPages.push({ page, reason: '页面 context 未实现，跳过写盘' });
        continue;
      }

      // LLM 输出在生成阶段过闸：error 级违规直接降级规则路径
      const gate = (content: string): boolean =>
        validatePageContent(content, { page, pagePath: relPath, knownFiles, plannedPaths }).passed;

      const produced = await this.generatePage(
        page, pageContext, fallbackBuilder, pageGenerator, noLlm, onChunk, gate,
      );
      if (produced.llmDrop) {
        llmDropped.push({ page, reason: produced.llmDrop });
      }

      // 页首证据锚定块（确定性注入，LLM 无法伪造）+ 页底 Related 区块
      const evidenceFiles = collectEvidenceFiles(pageContext, knownFiles, this.scanResult.rootDir);
      const content =
        injectEvidenceBlock(produced.content, buildEvidenceBlock(evidenceFiles)) +
        buildRelatedSection(page, pages);

      // 写盘前质量闸门（LLM 与规则路径都过闸）
      const report = validatePageContent(
        content, {
          page, pagePath: relPath, knownFiles, plannedPaths,
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
        writtenPages.push({ page, relPath, source: produced.source, status: 'unchanged' });
        continue;
      }

      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, content, 'utf-8');
      filenames.push(relPath);
      writtenPages.push({ page, relPath, source: produced.source, status: existed ? 'updated' : 'created' });
    }

    this.printBuildReport(writtenPages, skippedPages, qualityReports, legacyRemoved, continuations, llmDropped);
    return filenames;
  }

  /**
   * 解析 --pages 参数，校验页名合法性。
   *
   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）
   *   + 按 projectType 激活的 surface 层（Tier2）。
   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。
   */
  private resolvePages(requested: string[] | undefined, topicPages: string[]): string[] {
    const basePages = PAGE_REGISTRY
      .filter(p => p.tier !== 'surface')
      .map(p => p.name);
    const tier2 = tier2PagesFor(this.scanResult.projectType);
    const allPages = [...basePages, ...tier2, ...topicPages];

    if (!requested || requested.length === 0) {
      return allPages;
    }
    // 校验：过滤非法页名并告警（注册表页名与已锁定的 topic:<id> 均合法）
    const valid: string[] = [];
    for (const name of requested) {
      if (ALL_PAGE_NAMES.includes(name) || (isTopicPage(name) && topicPages.includes(name))) {
        valid.push(name);
      } else {
        console.warn(`[wiki] 未知页面 "${name}"，已跳过。可用页面: ${ALL_PAGE_NAMES.join(', ')}${topicPages.length > 0 ? `，${topicPages.join(', ')}` : ''}`);
      }
    }
    return valid.length > 0 ? valid : allPages;
  }

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

  /** 清理已退休页面路径的残留文件（改名/下线登记于 RETIRED_WIKI_PATHS） */
  private cleanupRetiredPages(wikiDir: string): string[] {
    const removed: string[] = [];
    for (const rel of RETIRED_WIKI_PATHS) {
      const target = join(wikiDir, rel);
      if (existsSync(target)) {
        rmSync(target);
        removed.push(rel);
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
    llmDropped: Array<{ page: string; reason: string }>,
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

    if (continuations.length > 0) {
      const detail = continuations
        .map(c => `${c.page}（续 ${c.rounds} 轮${c.truncated ? '，末轮仍截断' : ''}）`)
        .join('、');
      lines.push(`  断流续写 ${continuations.length} 页：${detail}`);
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
