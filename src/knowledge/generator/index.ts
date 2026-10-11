import { createOpenAI } from '@ai-sdk/openai';
import type {
  PublicApiContext, RoutesContext, ComponentsContext, StateContext,
  RoutingContext, WorkspacesContext, PackageBoundariesContext, DbSchemaContext,
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
import {
  generatePublicApi, generateRoutes, generateComponents, generateStatePage,
  generateRouting, generateWorkspaces, generatePackageBoundaries, generateDbSchema,
} from './tier2.js';


/**
 * 页面名 → LLM 生成函数的注册表映射（generateByName 的唯一事实源）。
 * 键集与 PAGE_REGISTRY 的差集必须恰为 LLM_EXEMPT_PAGES（无 LLM 叙述页），
 * 由 page-dispatch-consistency.test.ts 静态校验——漏注册在 CI 即失败。
 */
export const GENERATOR_PAGES: Record<string, (deps: GeneratorDeps, ctx: any, onChunk: (text: string) => void) => Promise<string>> = {
  overview: generateOverview,
  architecture: generateArchitecture,
  'data-flow': generateDataFlow,
  modules: generateModules,
  api: generateApi,
  onboarding: generateOnboarding,
  troubleshooting: generateTroubleshooting,
  glossary: generateGlossary,
  testing: generateTesting,
  constraints: generateConstraints,
  decisions: generateDecisions,
  environment: generateEnvironment,
  'tech-stack': generateTechStack,
  conventions: generateConventions,
  cli: generateCliPage,
  'public-api': generatePublicApi,
  routes: generateRoutes,
  components: generateComponents,
  state: generateStatePage,
  routing: generateRouting,
  workspaces: generateWorkspaces,
  'package-boundaries': generatePackageBoundaries,
  'db-schema': generateDbSchema,
};

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

  /** 按页面名派发 LLM 生成（供 PageRegistry 调用）；未注册页返回空串走上层降级 */
  async generateByName(page: string, ctx: any, onChunk: (text: string) => void): Promise<string> {
    if (isChapterPage(page)) return this.generateChapterPage(ctx, onChunk);
    if (isTopicPage(page)) return this.generateTopic(ctx, onChunk);
    const gen = GENERATOR_PAGES[page];
    return gen ? gen(this.deps, ctx, onChunk) : '';
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

  async generatePublicApi(ctx: PublicApiContext, onChunk: (text: string) => void): Promise<string> {
    return generatePublicApi(this.deps, ctx, onChunk);
  }

  async generateRoutes(ctx: RoutesContext, onChunk: (text: string) => void): Promise<string> {
    return generateRoutes(this.deps, ctx, onChunk);
  }

  async generateComponents(ctx: ComponentsContext, onChunk: (text: string) => void): Promise<string> {
    return generateComponents(this.deps, ctx, onChunk);
  }

  async generateStatePage(ctx: StateContext, onChunk: (text: string) => void): Promise<string> {
    return generateStatePage(this.deps, ctx, onChunk);
  }

  async generateRouting(ctx: RoutingContext, onChunk: (text: string) => void): Promise<string> {
    return generateRouting(this.deps, ctx, onChunk);
  }

  async generateWorkspaces(ctx: WorkspacesContext, onChunk: (text: string) => void): Promise<string> {
    return generateWorkspaces(this.deps, ctx, onChunk);
  }

  async generatePackageBoundaries(ctx: PackageBoundariesContext, onChunk: (text: string) => void): Promise<string> {
    return generatePackageBoundaries(this.deps, ctx, onChunk);
  }

  async generateDbSchema(ctx: DbSchemaContext, onChunk: (text: string) => void): Promise<string> {
    return generateDbSchema(this.deps, ctx, onChunk);
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
