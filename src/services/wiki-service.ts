import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CodebaseMemoryClient } from '../mcp/codebase-memory-client.js';
import type { ScanResult } from '../core/scanner.js';
import { WikiContextBuilder } from '../knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../knowledge/wiki-fallback-builder.js';
import { WikiPageGenerator } from '../knowledge/wiki-page-generator.js';
import { sanitizeWikiOutput } from '../knowledge/wiki-output-sanitizer.js';
import type { WikiBuildOptions } from '../knowledge/types.js';

const ALL_PAGES = [
  'overview',
  'architecture',
  'data-flow',
  'modules',
  'api',
  'business',
  'design-decisions',
  'onboarding',
  'troubleshooting',
  'glossary',
] as const;

type PageName = typeof ALL_PAGES[number];

export class WikiService {
  private client: CodebaseMemoryClient;
  private scanResult: ScanResult;

  constructor(client: CodebaseMemoryClient, scanResult: ScanResult) {
    this.client = client;
    this.scanResult = scanResult;
  }

  async buildWiki(wikiDir: string, options?: WikiBuildOptions): Promise<string[]> {
    mkdirSync(wikiDir, { recursive: true });

    // 确保图谱已索引（替代旧的 index 阶段）
    this.client.ensureIndexed('moderate');

    const pages = options?.pages
      ? (options.pages as PageName[])
      : ALL_PAGES;

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

  private async generatePage(
    page: PageName,
    ctx: WikiContextBuilder,
    fallback: WikiFallbackBuilder,
    generator: WikiPageGenerator,
    noLlm: boolean,
    onChunk: (filename: string, text: string) => void,
  ): Promise<string> {
    if (noLlm || !generator.hasModel()) {
      return this.generateFallback(page, ctx, fallback);
    }
    try {
      const content = await this.generateWithLlm(page, ctx, generator, (text) => onChunk(page, text));
      if (content.trim().length > 0) {
        // 清理 LLM 输出残骸（首行寒暄、markdown 围栏）
        return sanitizeWikiOutput(content);
      }
    } catch {
      // Fall through to fallback
    }
    return this.generateFallback(page, ctx, fallback);
  }

  private generateFallback(
    page: PageName,
    ctx: WikiContextBuilder,
    fallback: WikiFallbackBuilder,
  ): string {
    switch (page) {
      case 'overview':
        return fallback.buildOverview(ctx.buildOverviewContext());
      case 'architecture':
        return fallback.buildArchitecture(ctx.buildArchitectureContext());
      case 'data-flow':
        return fallback.buildDataFlow(ctx.buildDataFlowContext());
      case 'modules':
        return fallback.buildModules(ctx.buildModulesContext());
      case 'api':
        return fallback.buildApi(ctx.buildApiContext());
      case 'business':
        return fallback.buildBusiness(ctx.buildBusinessContext());
      case 'design-decisions':
        return fallback.buildDesignDecisions(ctx.buildDesignDecisionsContext());
      case 'onboarding':
        return fallback.buildOnboarding(ctx.buildOnboardingContext());
      case 'troubleshooting':
        return fallback.buildTroubleshooting(ctx.buildTroubleshootingContext());
      case 'glossary':
        return fallback.buildGlossary(ctx.buildGlossaryContext());
      default:
        return '';
    }
  }

  private async generateWithLlm(
    page: PageName,
    ctx: WikiContextBuilder,
    generator: WikiPageGenerator,
    onChunk: (text: string) => void,
  ): Promise<string> {
    switch (page) {
      case 'overview':
        return generator.generateOverview(ctx.buildOverviewContext(), onChunk);
      case 'architecture':
        return generator.generateArchitecture(ctx.buildArchitectureContext(), onChunk);
      case 'data-flow':
        return generator.generateDataFlow(ctx.buildDataFlowContext(), onChunk);
      case 'modules':
        return generator.generateModules(ctx.buildModulesContext(), onChunk);
      case 'api':
        return generator.generateApi(ctx.buildApiContext(), onChunk);
      case 'business':
        return generator.generateBusiness(ctx.buildBusinessContext(), onChunk);
      case 'design-decisions':
        return generator.generateDesignDecisions(ctx.buildDesignDecisionsContext(), onChunk);
      case 'onboarding':
        return generator.generateOnboarding(ctx.buildOnboardingContext(), onChunk);
      case 'troubleshooting':
        return generator.generateTroubleshooting(ctx.buildTroubleshootingContext(), onChunk);
      case 'glossary':
        return generator.generateGlossary(ctx.buildGlossaryContext(), onChunk);
      default:
        return '';
    }
  }
}
