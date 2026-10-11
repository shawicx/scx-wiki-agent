import { isTopicPage, isChapterPage } from '../page-registry.js';
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
  CallsContext,
  ClassesContext,
  ReadmeContext,
  EnvironmentContext,
  TestingContext,
  ConventionsContext,
  ConstraintsContext,
  CliContext,
  TechStackContext,
  TopicContext,
  ChapterPageContext,
  DecisionsContext,
} from '../types.js';
import { buildDataFlow } from './data-flow.js';
import {
  buildOverview,
  buildArchitecture,
  buildModules,
} from './structure.js';
import { buildCalls, buildClasses } from './reference.js';
import {
  buildApi,
  buildGlossary,
  buildOnboarding,
  buildTroubleshooting,
  buildReadme,
} from './surface.js';
import {
  buildEnvironment,
  buildTesting,
  buildConventions,
  buildConstraints,
} from './meta.js';
import { buildDecisions, buildCli, buildTechStack } from './meta-ops.js';
import { buildTopic, buildChapterPage } from './topic.js';
import {
  buildPublicApi, buildRoutes, buildComponents, buildState,
  buildRouting, buildWorkspaces, buildPackageBoundaries, buildDbSchema,
} from './tier2.js';


/**
 * 页面名 → 规则生成函数的注册表映射（buildByName 的唯一事实源）。
 * 键集与 PAGE_REGISTRY 完全一致，由 page-dispatch-consistency.test.ts
 * 静态校验——漏注册在 CI 即失败，不再静默产出空页。
 */
export const FALLBACK_PAGES: Record<string, (ctx: any) => string> = {
  overview: buildOverview,
  architecture: buildArchitecture,
  'data-flow': buildDataFlow,
  modules: buildModules,
  api: buildApi,
  onboarding: buildOnboarding,
  troubleshooting: buildTroubleshooting,
  glossary: buildGlossary,
  calls: buildCalls,
  classes: buildClasses,
  readme: buildReadme,
  environment: buildEnvironment,
  testing: buildTesting,
  conventions: buildConventions,
  constraints: buildConstraints,
  decisions: buildDecisions,
  cli: buildCli,
  'tech-stack': buildTechStack,
  'public-api': buildPublicApi,
  routes: buildRoutes,
  components: buildComponents,
  state: buildState,
  routing: buildRouting,
  workspaces: buildWorkspaces,
  'package-boundaries': buildPackageBoundaries,
  'db-schema': buildDbSchema,
};

export class WikiFallbackBuilder {
  /** 按页面名派发规则生成（供 PageRegistry 调用）；未注册页返回空串（上游 null-context 已拦截） */
  buildByName(page: string, ctx: any): string {
    if (isTopicPage(page)) return this.buildTopic(ctx);
    if (isChapterPage(page)) return this.buildChapterPage(ctx);
    return FALLBACK_PAGES[page]?.(ctx) ?? '';
  }

  buildOverview(ctx: OverviewContext): string {
    return buildOverview(ctx);
  }

  buildArchitecture(ctx: ArchitectureContext): string {
    return buildArchitecture(ctx);
  }

  buildDataFlow(ctx: DataFlowContext): string {
    return buildDataFlow(ctx);
  }

  buildModules(ctx: ModulesContext): string {
    return buildModules(ctx);
  }

  buildApi(ctx: ApiContext): string {
    return buildApi(ctx);
  }

  buildGlossary(ctx: GlossaryContext): string {
    return buildGlossary(ctx);
  }

  buildOnboarding(ctx: OnboardingContext): string {
    return buildOnboarding(ctx);
  }

  buildTroubleshooting(ctx: TroubleshootingContext): string {
    return buildTroubleshooting(ctx);
  }

  buildCalls(ctx: CallsContext): string {
    return buildCalls(ctx);
  }

  buildClasses(ctx: ClassesContext): string {
    return buildClasses(ctx);
  }

  buildReadme(ctx: ReadmeContext): string {
    return buildReadme(ctx);
  }

  buildEnvironment(ctx: EnvironmentContext): string {
    return buildEnvironment(ctx);
  }

  buildTesting(ctx: TestingContext): string {
    return buildTesting(ctx);
  }

  buildConventions(ctx: ConventionsContext): string {
    return buildConventions(ctx);
  }

  buildConstraints(ctx: ConstraintsContext): string {
    return buildConstraints(ctx);
  }

  buildDecisions(ctx: DecisionsContext): string {
    return buildDecisions(ctx);
  }

  buildCli(ctx: CliContext): string {
    return buildCli(ctx);
  }

  buildTechStack(ctx: TechStackContext): string {
    return buildTechStack(ctx);
  }

  buildPublicApi(ctx: PublicApiContext): string {
    return buildPublicApi(ctx);
  }

  buildRoutes(ctx: RoutesContext): string {
    return buildRoutes(ctx);
  }

  buildComponents(ctx: ComponentsContext): string {
    return buildComponents(ctx);
  }

  buildState(ctx: StateContext): string {
    return buildState(ctx);
  }

  buildRouting(ctx: RoutingContext): string {
    return buildRouting(ctx);
  }

  buildWorkspaces(ctx: WorkspacesContext): string {
    return buildWorkspaces(ctx);
  }

  buildPackageBoundaries(ctx: PackageBoundariesContext): string {
    return buildPackageBoundaries(ctx);
  }

  buildDbSchema(ctx: DbSchemaContext): string {
    return buildDbSchema(ctx);
  }

  buildTopic(ctx: TopicContext): string {
    return buildTopic(ctx);
  }

  buildChapterPage(ctx: ChapterPageContext): string {
    return buildChapterPage(ctx);
  }
}
