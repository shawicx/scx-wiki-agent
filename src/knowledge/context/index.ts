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
    switch (page) {
      case 'overview': return buildOverviewContext(this.deps);
      case 'architecture': return buildArchitectureContext(this.deps);
      case 'data-flow': return buildDataFlowContext(this.deps);
      case 'modules': return buildModulesContext(this.deps);
      case 'api': return buildApiContext(this.deps);
      case 'onboarding': return buildOnboardingContext(this.deps);
      case 'troubleshooting': return buildTroubleshootingContext(this.deps);
      case 'glossary': return buildGlossaryContext(this.deps);
      case 'calls': return buildCallsContext(this.deps);
      case 'classes': return buildClassesContext(this.deps);
      case 'readme': return buildReadmeContext(this.deps, plannedPages);
      case 'environment': return buildEnvironmentContext(this.deps);
      case 'testing': return buildTestingContext(this.deps);
      case 'conventions': return buildConventionsContext(this.deps);
      case 'constraints': return buildConstraintsContext(this.deps);
      case 'decisions': return buildDecisionsContext(this.deps);
      case 'cli': return buildCliContext(this.deps);
      case 'tech-stack': return buildTechStackContext(this.deps);
      case 'public-api': return buildPublicApiContext(this.deps);
      case 'routes': return buildRoutesContext(this.deps);
      case 'components': return buildComponentsContext(this.deps);
      case 'state': return buildStateContext(this.deps);
      case 'routing': return buildRoutingContext(this.deps);
      case 'workspaces': return buildWorkspacesContext(this.deps);
      case 'package-boundaries': return buildPackageBoundariesContext(this.deps);
      case 'db-schema': return buildDbSchemaContext(this.deps);
      default: return null;
    }
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
    return buildOverviewContext(this.deps);
  }

  buildArchitectureContext(): ArchitectureContext {
    return buildArchitectureContext(this.deps);
  }

  buildDataFlowContext(): DataFlowContext {
    return buildDataFlowContext(this.deps);
  }

  buildModulesContext(): ModulesContext {
    return buildModulesContext(this.deps);
  }

  buildApiContext(): ApiContext {
    return buildApiContext(this.deps);
  }

  buildOnboardingContext(): OnboardingContext {
    return buildOnboardingContext(this.deps);
  }

  buildTroubleshootingContext(): TroubleshootingContext {
    return buildTroubleshootingContext(this.deps);
  }

  buildGlossaryContext(): GlossaryContext {
    return buildGlossaryContext(this.deps);
  }

  buildCallsContext(): CallsContext {
    return buildCallsContext(this.deps);
  }

  buildClassesContext(): ClassesContext {
    return buildClassesContext(this.deps);
  }

  buildReadmeContext(plannedPages?: string[]): ReadmeContext {
    return buildReadmeContext(this.deps, plannedPages);
  }

  buildEnvironmentContext(): EnvironmentContext {
    return buildEnvironmentContext(this.deps);
  }

  buildTestingContext(): TestingContext {
    return buildTestingContext(this.deps);
  }

  buildConventionsContext(): ConventionsContext {
    return buildConventionsContext(this.deps);
  }

  buildConstraintsContext(): ConstraintsContext {
    return buildConstraintsContext(this.deps);
  }

  buildDecisionsContext(): DecisionsContext | null {
    return buildDecisionsContext(this.deps);
  }

  buildCliContext(): CliContext {
    return buildCliContext(this.deps);
  }

  buildTechStackContext(): TechStackContext {
    return buildTechStackContext(this.deps);
  }

  buildTopicContext(topicId: string): TopicContext | null {
    return buildTopicContext(this.deps, topicId);
  }

  buildChapterPageContext(page: string): ChapterPageContext | null {
    return buildChapterPageContext(this.deps, page);
  }
}
