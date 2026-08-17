import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ScanResult } from '../core/scanner.js';
import { WikiContextBuilder } from '../knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../knowledge/wiki-fallback-builder.js';
import { WikiPageGenerator } from '../knowledge/wiki-page-generator.js';
import { sanitizeWikiOutput } from '../knowledge/wiki-output-sanitizer.js';
import { validatePageContent } from '../knowledge/wiki-quality-validator.js';
import type { PageQualityReport } from '../knowledge/wiki-quality-validator.js';
import { ConfigDetector } from '../knowledge/config-detector.js';
import { PAGE_REGISTRY, ALL_PAGE_NAMES, tier2PagesFor } from '../knowledge/page-registry.js';
import type { WikiBuildOptions } from '../knowledge/types.js';

/** 单页产出结果：最终内容 + 走的生成路径 */
interface PageProduced {
  content: string;
  source: 'llm' | 'fallback';
}

export class WikiService {
  constructor(
    private client: CodebaseMemoryClient,
    private scanResult: ScanResult,
  ) {}

  async buildWiki(wikiDir: string, options?: WikiBuildOptions): Promise<string[]> {
    mkdirSync(wikiDir, { recursive: true });

    // 确保图谱已索引（替代旧的 index 阶段）
    this.client.ensureIndexed('moderate');

    // 决定生成哪些页面（校验页名合法性）
    const pages = this.resolvePages(options?.pages);

    // 检测式配置探测器：探测项目实际配置（package.json/lockfile/eslint/...），
    // 复用 scanResult 的源文件列表避免重复扫描
    const detector = new ConfigDetector(this.scanResult.rootDir);
    detector.setSourceFiles(this.scanResult.files.map(f => f.absolutePath));

    const contextBuilder = new WikiContextBuilder(this.client, this.scanResult, detector);
    const fallbackBuilder = new WikiFallbackBuilder();
    const pageGenerator = new WikiPageGenerator(options?.model, options?.baseURL, options?.apiKey);
    const noLlm = options?.noLlm ?? false;
    const onChunk = options?.onChunk ?? (() => {});

    // 质量闸门输入：本次计划写入的页面路径 + 仓库真实文件清单
    const plannedPaths = new Set(pages.map(p => `${p}.md`));
    const knownFiles = new Set(this.scanResult.files.map(f => f.relativePath));

    const filenames: string[] = [];
    const writtenPages: Array<{ page: string; source: string }> = [];
    const skippedPages: Array<{ page: string; reason: string }> = [];
    const qualityReports: PageQualityReport[] = [];

    for (const page of pages) {
      const filename = `${page}.md`;

      // LLM 输出在生成阶段过闸：error 级违规直接降级规则路径（闸门内已告警）
      const gate = (content: string): boolean =>
        validatePageContent(content, { page, pagePath: filename, knownFiles, plannedPaths }).passed;

      const produced = await this.generatePage(
        page, contextBuilder, fallbackBuilder, pageGenerator, noLlm, onChunk, gate,
      );
      if (produced === null) {
        skippedPages.push({ page, reason: '页面 context 未实现，跳过写盘' });
        continue;
      }

      // 写盘前质量闸门（LLM 与规则路径都过闸）
      const report = validatePageContent(
        produced.content, { page, pagePath: filename, knownFiles, plannedPaths },
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

      writeFileSync(join(wikiDir, filename), produced.content, 'utf-8');
      filenames.push(filename);
      writtenPages.push({ page, source: produced.source });
    }

    this.printBuildReport(writtenPages, skippedPages, qualityReports);
    return filenames;
  }

  /**
   * 解析 --pages 参数，校验页名合法性。
   *
   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）
   *   + 按 projectType 激活的 surface 层（Tier2）。
   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。
   */
  private resolvePages(requested?: string[]): string[] {
    const basePages = PAGE_REGISTRY
      .filter(p => p.tier !== 'surface')
      .map(p => p.name);
    const tier2 = tier2PagesFor(this.scanResult.projectType);
    const allPages = [...basePages, ...tier2];

    if (!requested || requested.length === 0) {
      return allPages;
    }
    // 校验：过滤非法页名并告警
    const valid: string[] = [];
    for (const name of requested) {
      if (ALL_PAGE_NAMES.includes(name)) {
        valid.push(name);
      } else {
        console.warn(`[wiki] 未知页面 "${name}"，已跳过。可用页面: ${ALL_PAGE_NAMES.join(', ')}`);
      }
    }
    return valid.length > 0 ? valid : allPages;
  }

  private async generatePage(
    page: string,
    ctx: WikiContextBuilder,
    fallback: WikiFallbackBuilder,
    generator: WikiPageGenerator,
    noLlm: boolean,
    onChunk: (filename: string, text: string) => void,
    gate?: (content: string) => boolean,
  ): Promise<PageProduced | null> {
    const pageContext = ctx.buildByName(page);
    if (pageContext === null) return null;

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
        }
      } catch {
        // Fall through to fallback
      }
    }
    return { content: fallback.buildByName(page, pageContext), source: 'fallback' };
  }

  /**
   * 构建报告（对应 project-wiki「完成后清单」）：
   * 已写页面（按生成路径统计）、跳过页面及原因、锚点核验统计、告警汇总。
   */
  private printBuildReport(
    written: Array<{ page: string; source: string }>,
    skipped: Array<{ page: string; reason: string }>,
    reports: PageQualityReport[],
  ): void {
    const lines: string[] = ['[wiki] 构建报告：'];

    const llmCount = written.filter(w => w.source === 'llm').length;
    lines.push(`  已写入 ${written.length} 页（LLM ${llmCount} / 规则 ${written.length - llmCount}）`);

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
