import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ScanResult } from '../core/scanner.js';
import { WikiContextBuilder } from '../knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../knowledge/wiki-fallback-builder.js';
import { WikiPageGenerator } from '../knowledge/wiki-page-generator.js';
import { sanitizeWikiOutput } from '../knowledge/wiki-output-sanitizer.js';
import { PAGE_REGISTRY, ALL_PAGE_NAMES } from '../knowledge/page-registry.js';
import type { WikiBuildOptions } from '../knowledge/types.js';

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

    const contextBuilder = new WikiContextBuilder(this.client, this.scanResult);
    const fallbackBuilder = new WikiFallbackBuilder();
    const pageGenerator = new WikiPageGenerator(options?.model, options?.baseURL, options?.apiKey);
    const noLlm = options?.noLlm ?? false;
    const onChunk = options?.onChunk ?? (() => {});

    const filenames: string[] = [];

    for (const page of pages) {
      const filename = `${page}.md`;
      const content = await this.generatePage(
        page, contextBuilder, fallbackBuilder, pageGenerator, noLlm, onChunk,
      );
      writeFileSync(join(wikiDir, filename), content, 'utf-8');
      filenames.push(filename);
    }

    return filenames;
  }

  /** 解析 --pages 参数，校验页名合法性 */
  private resolvePages(requested?: string[]): string[] {
    if (!requested || requested.length === 0) {
      return ALL_PAGE_NAMES;
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
    return valid.length > 0 ? valid : ALL_PAGE_NAMES;
  }

  private async generatePage(
    page: string,
    ctx: WikiContextBuilder,
    fallback: WikiFallbackBuilder,
    generator: WikiPageGenerator,
    noLlm: boolean,
    onChunk: (filename: string, text: string) => void,
  ): Promise<string> {
    const pageContext = ctx.buildByName(page);
    if (pageContext === null) return '';

    if (noLlm || !generator.hasModel()) {
      return fallback.buildByName(page, pageContext);
    }
    try {
      const content = await generator.generateByName(page, pageContext, (text) => onChunk(page, text));
      if (content.trim().length > 0) {
        // 清理 LLM 输出残骸（首行寒暄、markdown 围栏，R2 时序图告警）
        return sanitizeWikiOutput(content, page);
      }
    } catch {
      // Fall through to fallback
    }
    return fallback.buildByName(page, pageContext);
  }
}
