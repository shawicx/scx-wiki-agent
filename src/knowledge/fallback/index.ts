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

export class WikiFallbackBuilder {
  /** 按页面名派发规则生成（供 PageRegistry 调用） */
  buildByName(page: string, ctx: any): string {
    if (isTopicPage(page)) return this.buildTopic(ctx);
    if (isChapterPage(page)) return this.buildChapterPage(ctx);
    switch (page) {
      case 'overview': return this.buildOverview(ctx);
      case 'architecture': return this.buildArchitecture(ctx);
      case 'data-flow': return this.buildDataFlow(ctx);
      case 'modules': return this.buildModules(ctx);
      case 'api': return this.buildApi(ctx);
      case 'onboarding': return this.buildOnboarding(ctx);
      case 'troubleshooting': return this.buildTroubleshooting(ctx);
      case 'glossary': return this.buildGlossary(ctx);
      case 'calls': return this.buildCalls(ctx);
      case 'classes': return this.buildClasses(ctx);
      case 'readme': return this.buildReadme(ctx);
      case 'environment': return this.buildEnvironment(ctx);
      case 'testing': return this.buildTesting(ctx);
      case 'conventions': return this.buildConventions(ctx);
      case 'constraints': return this.buildConstraints(ctx);
      case 'decisions': return this.buildDecisions(ctx);
      case 'cli': return this.buildCli(ctx);
      case 'tech-stack': return this.buildTechStack(ctx);
      case 'public-api': return this.buildPublicApi(ctx);
      case 'routes': return this.buildRoutes(ctx);
      case 'components': return this.buildComponents(ctx);
      case 'state': return this.buildState(ctx);
      case 'routing': return this.buildRouting(ctx);
      case 'workspaces': return this.buildWorkspaces(ctx);
      case 'package-boundaries': return this.buildPackageBoundaries(ctx);
      case 'db-schema': return this.buildDbSchema(ctx);
      default: return '';
    }
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
