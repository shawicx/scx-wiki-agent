import { createOpenAI } from '@ai-sdk/openai';
import type {
  OverviewContext,
  ArchitectureContext,
  DataFlowContext,
  ModulesContext,
  ApiContext,
  GlossaryContext,
  OnboardingContext,
  TroubleshootingContext,
  TestingContext,
  ConstraintsContext,
  EnvironmentContext,
  TechStackContext,
  ConventionsContext,
  CliContext,
  TopicContext,
  ChapterPageContext,
  DecisionsContext,
} from '../types.js';
import { isTopicPage, isChapterPage } from '../page-registry.js';
import {
  generateWithContinuation,
  type GeneratorDeps,
  type GeneratorSettings,
  type PageGenNotice,
} from './shared.js';
import {
  generateArchitecture,
  generateModules,
  generateGlossary,
} from './structure.js';
import {
  generateOverview,
  generateDataFlow,
  generateApi,
  generateDecisions,
} from './data-pages.js';
import {
  generateOnboarding,
  generateTroubleshooting,
  generateTopic,
  generateChapterPage,
  generateTesting,
  generateConstraints,
  generateEnvironment,
  generateTechStack,
  generateConventions,
  generateCliPage,
} from './surface.js';

export type { GeneratorSettings, PageGenNotice } from './shared.js';

export class WikiPageGenerator {
  private deps: GeneratorDeps;

  constructor(
    modelName?: string,
    baseURL?: string,
    apiKey?: string,
    onNotice?: (notice: PageGenNotice) => void,
    settings?: GeneratorSettings,
  ) {
    let model: GeneratorDeps['model'] = null;
    if (modelName) {
      const options: Parameters<typeof createOpenAI>[0] = {};
      if (baseURL) {
        options.baseURL = baseURL;
      }
      if (apiKey) {
        options.apiKey = apiKey;
      } else if (baseURL) {
        options.apiKey = 'ollama';
      }
      const provider = createOpenAI(options);
      model = provider.chat(modelName);
    }
    this.deps = { model, settings, onNotice };
  }

  hasModel(): boolean {
    return this.deps.model !== null;
  }

  /** 规划类调用的原始文本（章节树 planner 复用模型与续写能力；不做 sanitize） */
  async plan(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.deps.model) return '';
    const r = await generateWithContinuation(this.deps, () => {}, { systemPrompt, userPrompt });
    return r.content;
  }

  /** 按页面名派发 LLM 生成（供 PageRegistry 调用） */
  async generateByName(page: string, ctx: any, onChunk: (text: string) => void): Promise<string> {
    if (isChapterPage(page)) return this.generateChapterPage(ctx, onChunk);
    if (isTopicPage(page)) return this.generateTopic(ctx, onChunk);
    switch (page) {
      case 'overview': return this.generateOverview(ctx, onChunk);
      case 'architecture': return this.generateArchitecture(ctx, onChunk);
      case 'data-flow': return this.generateDataFlow(ctx, onChunk);
      case 'modules': return this.generateModules(ctx, onChunk);
      case 'api': return this.generateApi(ctx, onChunk);
      case 'onboarding': return this.generateOnboarding(ctx, onChunk);
      case 'troubleshooting': return this.generateTroubleshooting(ctx, onChunk);
      case 'glossary': return this.generateGlossary(ctx, onChunk);
      case 'testing': return this.generateTesting(ctx, onChunk);
      case 'constraints': return this.generateConstraints(ctx, onChunk);
      case 'decisions': return this.generateDecisions(ctx, onChunk);
      case 'environment': return this.generateEnvironment(ctx, onChunk);
      case 'tech-stack': return this.generateTechStack(ctx, onChunk);
      case 'conventions': return this.generateConventions(ctx, onChunk);
      case 'cli': return this.generateCliPage(ctx, onChunk);
      default: return '';
    }
  }

  async generateOverview(ctx: OverviewContext, onChunk: (text: string) => void): Promise<string> {
    return generateOverview(this.deps, ctx, onChunk);
  }

  async generateArchitecture(ctx: ArchitectureContext, onChunk: (text: string) => void): Promise<string> {
    return generateArchitecture(this.deps, ctx, onChunk);
  }

  async generateDataFlow(ctx: DataFlowContext, onChunk: (text: string) => void): Promise<string> {
    return generateDataFlow(this.deps, ctx, onChunk);
  }

  async generateModules(ctx: ModulesContext, onChunk: (text: string) => void): Promise<string> {
    return generateModules(this.deps, ctx, onChunk);
  }

  async generateApi(ctx: ApiContext, onChunk: (text: string) => void): Promise<string> {
    return generateApi(this.deps, ctx, onChunk);
  }

  async generateOnboarding(ctx: OnboardingContext, onChunk: (text: string) => void): Promise<string> {
    return generateOnboarding(this.deps, ctx, onChunk);
  }

  async generateTroubleshooting(ctx: TroubleshootingContext, onChunk: (text: string) => void): Promise<string> {
    return generateTroubleshooting(this.deps, ctx, onChunk);
  }

  async generateGlossary(ctx: GlossaryContext, onChunk: (text: string) => void): Promise<string> {
    return generateGlossary(this.deps, ctx, onChunk);
  }

  async generateTopic(ctx: TopicContext, onChunk: (text: string) => void): Promise<string> {
    return generateTopic(this.deps, ctx, onChunk);
  }

  async generateChapterPage(ctx: ChapterPageContext, onChunk: (text: string) => void): Promise<string> {
    return generateChapterPage(this.deps, ctx, onChunk);
  }

  async generateTesting(ctx: TestingContext, onChunk: (text: string) => void): Promise<string> {
    return generateTesting(this.deps, ctx, onChunk);
  }

  async generateConstraints(ctx: ConstraintsContext, onChunk: (text: string) => void): Promise<string> {
    return generateConstraints(this.deps, ctx, onChunk);
  }

  async generateDecisions(ctx: DecisionsContext, onChunk: (text: string) => void): Promise<string> {
    return generateDecisions(this.deps, ctx, onChunk);
  }

  async generateEnvironment(ctx: EnvironmentContext, onChunk: (text: string) => void): Promise<string> {
    return generateEnvironment(this.deps, ctx, onChunk);
  }

  async generateTechStack(ctx: TechStackContext, onChunk: (text: string) => void): Promise<string> {
    return generateTechStack(this.deps, ctx, onChunk);
  }

  async generateConventions(ctx: ConventionsContext, onChunk: (text: string) => void): Promise<string> {
    return generateConventions(this.deps, ctx, onChunk);
  }

  async generateCliPage(ctx: CliContext, onChunk: (text: string) => void): Promise<string> {
    return generateCliPage(this.deps, ctx, onChunk);
  }
}
