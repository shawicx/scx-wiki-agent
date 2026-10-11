import type { CodebaseMemoryClient } from '../../mcp/codebase-memory-client.js';
import type { ScanResult } from '../../core/scanner.js';
import { isTopicPage, topicIdFromPage, isChapterPage } from '../page-registry.js';
import { ConfigDetector } from '../config-detector.js';
import { IntentEvidenceProvider } from '../intent-evidence.js';
import type { TopicDefinition } from '../topic-discovery.js';
import type { OutlineChapter } from '../outline.js';
import type {
  OverviewContext,
  ArchitectureContext,
  DataFlowContext,
  ModulesContext,
  ApiContext,
  OnboardingContext,
  TroubleshootingContext,
  GlossaryContext,
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
import { buildOverviewContext } from './overview.js';
import { buildArchitectureContext } from './architecture.js';
import { buildDataFlowContext } from './data-flow.js';
import { buildCallsContext, buildClassesContext } from './calls.js';
import { buildModulesContext, buildApiContext } from './modules-api.js';
import {
  buildGlossaryContext,
  buildOnboardingContext,
  buildTroubleshootingContext,
  buildEnvironmentContext,
  buildTestingContext,
  buildConventionsContext,
  buildConstraintsContext,
  buildDecisionsContext,
} from './misc-pages.js';
import { buildTopicContext, buildChapterPageContext } from './topics.js';
import { buildReadmeContext } from './readme.js';
import { buildCliContext } from './cli.js';
import { buildTechStackContext } from './tech-stack.js';
import { buildPublicApiContext } from './public-api.js';
import { buildRoutesContext } from './routes.js';
import { buildComponentsContext, buildStateContext, buildRoutingContext } from './frontend.js';
import { buildWorkspacesContext, buildPackageBoundariesContext } from './workspaces.js';
import { buildDbSchemaContext } from './db-schema.js';
import {
  type ContextDeps,
  createDeps,
  enrichIfThinEvidence,
  getDepNames,
} from './shared.js';

export { buildPublicApiContext } from './public-api.js';
export { buildRoutesContext } from './routes.js';
export {
  buildComponentsContext, buildStateContext, buildRoutingContext,
} from './frontend.js';
export { buildWorkspacesContext, buildPackageBoundariesContext } from './workspaces.js';
export { buildDbSchemaContext } from './db-schema.js';

/**
 * 页面名 → context 构建函数的注册表映射（dispatch 的唯一事实源）。
 * 一致性测试（page-dispatch-consistency.test.ts）静态校验其键集与
 * PAGE_REGISTRY 完全一致——漏注册任何页面在 CI 即失败，不再依赖运行期
 * build report 才发现「页面被静默跳过」。
 */
export const CONTEXT_PAGES: Record<string, (deps: ContextDeps, plannedPages?: string[]) => unknown> = {
  overview: buildOverviewContext,
  architecture: buildArchitectureContext,
  'data-flow': buildDataFlowContext,
  modules: buildModulesContext,
  api: buildApiContext,
  onboarding: buildOnboardingContext,
  troubleshooting: buildTroubleshootingContext,
  glossary: buildGlossaryContext,
  calls: buildCallsContext,
  classes: buildClassesContext,
  readme: buildReadmeContext,
  environment: buildEnvironmentContext,
  testing: buildTestingContext,
  conventions: buildConventionsContext,
  constraints: buildConstraintsContext,
  decisions: buildDecisionsContext,
  cli: buildCliContext,
  'tech-stack': buildTechStackContext,
  'public-api': buildPublicApiContext,
  routes: buildRoutesContext,
  components: buildComponentsContext,
  state: buildStateContext,
  routing: buildRoutingContext,
  workspaces: buildWorkspacesContext,
  'package-boundaries': buildPackageBoundariesContext,
  'db-schema': buildDbSchemaContext,
};

/**
 * 从 codebase-memory-mcp 知识图谱构建各 wiki 页面的上下文数据。
 *
 * 替代了旧的 SQLite 直查方式。所有数据来自 MCP 的架构概览、调用链追踪、
 * Cypher 查询，携带 docstring/signature/complexity 等富化属性。
 */
export class WikiContextBuilder {
  private deps: ContextDeps;

  constructor(
    client: CodebaseMemoryClient,
    scanResult: ScanResult,
    detector: ConfigDetector,
  ) {
    this.deps = createDeps(client, scanResult, detector);
  }

  setIntentProvider(provider: IntentEvidenceProvider): void {
    this.deps.intentProvider = provider;
  }

  setTopics(topics: TopicDefinition[]): void {
    this.deps.topics = topics;
  }

  setOutlineChapters(chapters: OutlineChapter[]): void {
    this.deps.outlineChapters = chapters;
  }

  /** 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 */
  buildByName(page: string, plannedPages?: string[]): unknown {
    const ctx = this.dispatchContext(page, plannedPages);
    if (ctx === null || ctx === undefined) return ctx;
    return this.enrichIfThinEvidence(page, ctx);
  }

  private dispatchContext(page: string, plannedPages?: string[]): unknown {
    if (isTopicPage(page)) return buildTopicContext(this.deps, topicIdFromPage(page));
    if (isChapterPage(page)) return buildChapterPageContext(this.deps, page);
    const build = CONTEXT_PAGES[page];
    return build ? build(this.deps, plannedPages) : null;
  }

  /**
   * 证据补强（DeepWiki「二次扩展检索」的图谱版）：
   * LLM 路径的 structure 页证据文件低于下限时，从图谱补一批高复杂度真实符号，
   * 只保留扫描清单内的文件路径。图谱查无的热点/入口名回落源码正则探测
   * （mcp 对 .vue/部分 Rust 索引不全，避免 LLM 把真实符号标成「待确认」）。
   */
  private enrichIfThinEvidence(page: string, ctx: unknown): unknown {
    return enrichIfThinEvidence(this.deps, page, ctx);
  }

  getDepNames(): Set<string> {
    return getDepNames(this.deps);
  }

  getFallbackSymbolNames(): Set<string> {
    return this.deps.fallbackSymbolNames;
  }

  buildOverviewContext(): OverviewContext {
    return this.dispatchContext('overview') as OverviewContext;
  }

  buildArchitectureContext(): ArchitectureContext {
    return this.dispatchContext('architecture') as ArchitectureContext;
  }

  buildDataFlowContext(): DataFlowContext {
    return this.dispatchContext('data-flow') as DataFlowContext;
  }

  buildModulesContext(): ModulesContext {
    return this.dispatchContext('modules') as ModulesContext;
  }

  buildApiContext(): ApiContext {
    return this.dispatchContext('api') as ApiContext;
  }

  buildOnboardingContext(): OnboardingContext {
    return this.dispatchContext('onboarding') as OnboardingContext;
  }

  buildTroubleshootingContext(): TroubleshootingContext {
    return this.dispatchContext('troubleshooting') as TroubleshootingContext;
  }

  buildGlossaryContext(): GlossaryContext {
    return this.dispatchContext('glossary') as GlossaryContext;
  }

  buildCallsContext(): CallsContext {
    return this.dispatchContext('calls') as CallsContext;
  }

  buildClassesContext(): ClassesContext {
    return this.dispatchContext('classes') as ClassesContext;
  }

  buildReadmeContext(plannedPages?: string[]): ReadmeContext {
    return this.dispatchContext('readme', plannedPages) as ReadmeContext;
  }

  buildEnvironmentContext(): EnvironmentContext {
    return this.dispatchContext('environment') as EnvironmentContext;
  }

  buildTestingContext(): TestingContext {
    return this.dispatchContext('testing') as TestingContext;
  }

  buildConventionsContext(): ConventionsContext {
    return this.dispatchContext('conventions') as ConventionsContext;
  }

  buildConstraintsContext(): ConstraintsContext {
    return this.dispatchContext('constraints') as ConstraintsContext;
  }

  buildDecisionsContext(): DecisionsContext | null {
    return this.dispatchContext('decisions') as DecisionsContext | null;
  }

  buildCliContext(): CliContext {
    return this.dispatchContext('cli') as CliContext;
  }

  buildTechStackContext(): TechStackContext {
    return this.dispatchContext('tech-stack') as TechStackContext;
  }

  buildTopicContext(topicId: string): TopicContext | null {
    return buildTopicContext(this.deps, topicId);
  }

  buildChapterPageContext(page: string): ChapterPageContext | null {
    return buildChapterPageContext(this.deps, page);
  }
}
