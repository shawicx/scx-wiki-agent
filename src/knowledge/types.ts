// src/knowledge/types.ts

import type { SymbolType, RelationType } from '../core/types.js';
import type { IntentEvidence, GitCommitRef } from './intent-evidence.js';
import type { PendingConfirmation, ConfirmationDecision } from './confirmation.js';

/** Hotspot 补强符号：structure 页证据不足时从图谱补充的真实符号（二次扩展检索）。
 *  startLine/signature 在源码回落（source-fallback）路径下携带定义行信息。
 *  docstring 来自图谱富化属性（证据最薄处恰不能丢「为什么」）。 */
export interface SupplementalSymbol {
  name: string;
  type: SymbolType;
  file: string;
  startLine?: number;
  complexity?: number;
  signature?: string | null;
  docstring?: string | null;
}

/** 依赖使用证据（overview/troubleshooting 等元数据页）：用途锚点分生产 import / 测试 import / scripts 命令 */
export interface DepUsage {
  name: string;
  /** 使用它的文件（usageKind=import/test 时非空，≤5 个） */
  importFiles: string[];
  importCount: number;
  /** import=生产代码 import；test=仅测试文件 import；script=仅 scripts 命令引用；none=查无使用 */
  usageKind: 'import' | 'test' | 'script' | 'none';
}

/** Context for overview page */
export interface OverviewContext {
  projectType: string;
  hasTypeScript: boolean;
  fileCount: number;
  techStack: string[];
  sourceDirs: string[];
  /** 源码语言分布（来自 MCP get_architecture；多语言项目如 Tauri 须说明各语言职责域）
   *  exampleFiles：该语言在扫描清单内的真实文件样本（职责描述的锚点） */
  languages?: Array<{ language: string; fileCount: number; exampleFiles?: string[] }>;
  /** 根 README.md 摘录（前 ~2000 字符；项目自述的既有事实源） */
  readmeExcerpt?: string;
  /** docs/ 下的 markdown 清单（≤10，延伸阅读） */
  docsFiles?: string[];
  /** package.json 的 name/description（缺失为空串） */
  packageName?: string;
  packageDescription?: string;
  entryFiles: Array<{ name: string; path: string }>;
  topSymbols: Array<{ name: string; type: SymbolType; qualifiedName?: string; docstring?: string | null; complexity?: number }>;
  /** 技术栈依赖的使用证据（防 R5 把真实依赖标成待确认/声明未用） */
  depUsage?: DepUsage[];
  supplementalSymbols?: SupplementalSymbol[];
  /** 意图证据（注释/git/文档小节/测试行为，「为什么」叙述的锚点源） */
  intent?: IntentEvidence[];
}

/** Module summary for architecture and modules pages */
export interface ModuleSummary {
  name: string;
  files: string[];
  symbols: Array<{ name: string; type: SymbolType; docstring?: string | null; signature?: string | null; complexity?: number }>;
  fileSymbols: Array<{ file: string; symbols: Array<{ name: string; type: SymbolType }> }>;
  outgoingRelations: Array<{ target: string; type: RelationType }>;
  incomingRelations: Array<{ source: string; type: RelationType }>;
  codeSnippets: Array<{ symbolName: string; content: string; startLine: number }>;
  /** 模块内文件的语言分布（多语言模块须分别说明各语言职责域） */
  languages?: Array<{ language: string; fileCount: number }>;
  /** 图谱包级扇入/扇出（模块重要性与分层判据的叙事锚点） */
  fanIn?: number;
  fanOut?: number;
  /** 模块级意图证据（文件头自述 + 首提交 + 高频主题 + 测试行为承诺） */
  intent?: IntentEvidence[];
}

/** Context for architecture page */
export interface ArchitectureContext {
  modules: ModuleSummary[];
  interModuleRelations: Array<{
    source: string;
    target: string;
    type: RelationType;
  }>;
  /** 分层信息（来自 MCP get_architecture，消费侧过滤后） */
  layers?: Array<{ name: string; layer: string; reason: string }>;
  /** 模块间调用边界（来自 MCP get_architecture） */
  boundaries?: Array<{ from: string; to: string; callCount: number }>;
  /** 聚类（来自 MCP get_architecture，cohesion = 聚类凝聚度） */
  clusters?: Array<{ label: string; members: number; topNodes: string[]; cohesion?: number }>;
  supplementalSymbols?: SupplementalSymbol[];
}

/** A participant in a sequence diagram (function/class/module) */
export interface SequenceParticipant {
  name: string;
  type: SymbolType;
  filePath: string;
}

/** A message between participants in a sequence diagram */
export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  callLine: number;
  filePath: string;
}

/** A traced execution sequence from entry to terminal calls */
export interface ExecutionSequence {
  name: string;
  entrySymbol: string;
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
}

/** Context for data-flow page */
export interface DataFlowContext {
  sequences: ExecutionSequence[];
  supplementalSymbols?: SupplementalSymbol[];
}

/** Context for modules page */
export interface ModulesContext {
  modules: ModuleSummary[];
  /** 模块数超过详述上限时的概要聚合（其余模块只列名称与规模） */
  otherModules?: Array<{ name: string; fileCount: number; symbolCount: number }>;
  supplementalSymbols?: SupplementalSymbol[];
  /** 页级意图证据（文档小节等模块无关证据） */
  intent?: IntentEvidence[];
}

/** IPC 调用点（Tauri 项目的真正 API 边界） */
export interface IpcRef {
  file: string;
  line: number;
}

/** IPC 命令：前端 invoke ↔ Rust #[tauri::command] 对表（rustDef 为空 = 仅前端调用） */
export interface IpcCommand {
  name: string;
  frontendCalls: IpcRef[];
  rustDef: IpcRef | null;
}

/** IPC 事件：前端 listen ↔ 前端/Rust emit 对表 */
export interface IpcEvent {
  name: string;
  listeners: IpcRef[];
  emits: Array<IpcRef & { side: 'frontend' | 'rust' }>;
}

/** Tauri IPC 面（tauri-ipc.ts 正则扫描产物） */
export interface IpcSurface {
  commands: IpcCommand[];
  events: IpcEvent[];
}

/** Context for api page */
export interface ApiContext {
  commands: Array<{
    name: string;
    filePath: string;
    startLine: number;
    description: string;
  }>;
  exportedFunctions: Array<{
    name: string;
    filePath: string;
    startLine: number;
    signature?: string | null;
    docstring?: string | null;
  }>;
  frameworkNodes: Array<{
    name: string;
    type: string;
    filePath: string;
    startLine: number;
    metadata: Record<string, unknown>;
  }>;
  /** Tauri IPC 面（Tauri 项目时为 api 页主数据） */
  ipc?: IpcSurface;
  supplementalSymbols?: SupplementalSymbol[];
}

/** Context for glossary page */
export interface GlossaryContext {
  symbols: Array<{
    name: string;
    type: SymbolType;
    filePath: string;
    startLine?: number;
    docstring?: string | null;
    signature?: string | null;
    complexity?: number;
  }>;
  supplementalSymbols?: SupplementalSymbol[];
}

/** Context for calls page (调用边表，R2 边表优于时序图) */
export interface CallsContext {
  /** 按入口函数分组的调用边 */
  groups: Array<{
    entry: string;
    entryFile: string;
    /** entry = 应用入口；hotspot = 高扇入热点锚定组（入口漏采/跨语言入口被滤时的回填） */
    kind?: 'entry' | 'hotspot';
    edges: Array<{
      caller: string;
      callee: string;
      /** 被调方所属类（图谱 parent_class；同名符号的归属语境） */
      calleeParent?: string | null;
      calleeFile: string;
      calleeLine: number;
    }>;
  }>;
  /** 全局扇入表（被调用次数最多的符号） */
  fanIn: Array<{ symbol: string; file: string; qualifiedName?: string; inDegree: number }>;
  /** Tauri IPC 命令对表（前端 invoke → Rust 命令的真实跨语言执行边；非 Tauri 项目缺省） */
  ipc?: IpcSurface;
}

/**
 * Context for classes page (类层次与多态)。
 * 降级适配：MCP 无 INHERITS 边、Class 无 parent_class/is_abstract，
 * 故只做"类清单 + 每类方法表"，无继承树。
 */
export interface ClassesContext {
  classes: Array<{
    name: string;
    qualifiedName: string;
    filePath: string;
    startLine: number;
    /** MCP 未提供继承数据，此字段恒为 null */
    parentClass: string | null;
    methods: Array<{
      name: string;
      signature: string;
      visibility: string;
      docstring: string | null;
      filePath: string;
      startLine: number;
    }>;
  }>;
  /** 是否检测到继承关系（MCP 当前恒 false） */
  hasInheritance: boolean;
}

/** Context for README.md (导航索引) */
export interface ReadmeContext {
  projectName: string;
  version: string;
  license: string;
  description: string;
  runtime: string;
  /** 文档索引：文件名 → 该文档回答的核心问题（file 含编号目录前缀） */
  docIndex: Array<{ file: string; dir: string; tier: string; answer: string }>;
  /** 仓库既有文档（根 README/AGENTS.md + docs/**.md），链接 ../ 前缀指向 wiki 外 */
  relatedDocs?: Array<{ path: string; title: string }>;
}

/** Context for tech-stack page (技术栈，R3 拒绝编造用途) */
export interface TechStackContext {
  /** 核心依赖（dependencies 中被实际 import 的） */
  coreDeps: Array<{ name: string; version: string; importFiles: string[] }>;
  /** 开发依赖（devDependencies 中被 import 的） */
  devDeps: Array<{ name: string; version: string; importFiles: string[] }>;
  /** 声明未用依赖（package.json 声明但 src/ 中 0 import） */
  unusedDeps: Array<{ name: string; version: string }>;
  /** 运行时/构建信息 */
  runtime: string;
  buildTool: string;
  packageManager: string;
  /** 依赖相关提交主题（选型/引入动机的 git 证据） */
  intent?: IntentEvidence[];
}

/** Context for environment page (运行态) */
export interface EnvironmentContext {
  packageName: string;
  version: string;
  runtime: string;
  nodeVersion: string;
  packageManager: string;
  scripts: Record<string, string>;
  envVars: Array<{ name: string; sensitive: boolean }>;
}

/** Context for testing page (测试) */
export interface TestingContext {
  framework: string | null;
  configPath: string | null;
  testDirs: string[];
  fixturesDir: string | null;
  runCommand: string;
}

/** Context for conventions page (规约——AI 头号文档) */
export interface ConventionsContext {
  hasLinter: boolean;
  linterConfig: string | null;
  hasEditorConfig: boolean;
  editorConfig: string | null;
  agentsMd: string | null;
}

/** Context for constraints page (边界与代价) */
export interface ConstraintsContext {
  /** 源码中的限制常量（MAX/LIMIT/TIMEOUT 等） */
  constants: Array<{ name: string; value: string; filePath: string }>;
  /** 高复杂度函数（MCP complexity > 阈值） */
  hotFunctions: Array<{ name: string; filePath: string; complexity: number; loopDepth: number }>;
  /** 常量注释证据（每个限制「防什么失控场景」的直接叙述源） */
  intent?: IntentEvidence[];
}

/** Context for cli page (CLI 命令参考) */
export interface CliContext {
  commands: Array<{
    name: string;
    description: string;
    filePath: string;
    startLine: number;
    options: Array<{ flag: string; description: string }>;
  }>;
  exitCodes: Array<{ code: number; context: string; filePath: string }>;
}

/** Context for onboarding page */
export interface OnboardingContext {
  projectType: string;
  techStack: string[];
  entryFiles: Array<{ name: string; path: string }>;
  sourceDirs: string[];
  hasTypeScript: boolean;
  packageManager: string;
  nodeVersion: string;
  cliCommands: Array<{
    name: string;
    description: string;
    /** commander .option() 解析的参数清单（有 snippet 证据时） */
    options?: Array<{ flag: string; description: string }>;
  }>;
  scripts: Record<string, string>;
  /** 源码 process.env 引用（env 清单，敏感标记） */
  envVars?: Array<{ name: string; sensitive: boolean }>;
  /** 技术栈依赖的使用证据（依赖用途叙述的锚点） */
  depUsage?: DepUsage[];
  /** 各源码目录的真实文件样本（结构描述的锚点，防止「目录内容未提供」类待确认） */
  sourceDirFiles?: Array<{ dir: string; files: string[] }>;
  firstRunExample: string;
}

/** Context for troubleshooting page */
export interface TroubleshootingContext {
  projectType: string;
  techStack: string[];
  modules: Array<{ name: string }>;
  /** 运行态（ConfigDetector）：脚本命令/包管理器/Node 版本/env 变量 */
  scripts?: Record<string, string>;
  packageManager?: string;
  nodeVersion?: string;
  envVars?: Array<{ name: string; sensitive: boolean }>;
  /** 限制常量（源码 MAX/LIMIT/TIMEOUT 等，排障边界参考） */
  constants?: Array<{ name: string; value: string; filePath: string }>;
  /** 入口文件（排障起点） */
  entryFiles?: string[];
  /** 技术栈依赖的使用证据（排障叙述依赖用途时的锚点） */
  depUsage?: DepUsage[];
  /** 意图证据：源码 why-marker（TODO/FIXME 真实风险信号）+ git 高频变更 */
  intent?: IntentEvidence[];
}

/** Context for topic pages（仓库专属主题，图谱推导） */
export interface TopicContext {
  id: string;
  title: string;
  /** 主题覆盖的生产文件（扫描清单内） */
  files: string[];
  symbols: Array<{
    name: string;
    type: SymbolType;
    file: string;
    startLine?: number;
    docstring?: string | null;
    signature?: string | null;
    complexity?: number;
  }>;
  /** 主题文件间的 CALLS 边（边表，R2） */
  edges: Array<{ caller: string; callee: string; file: string; line: number }>;
  /** 主题涉及的跨包调用边界 */
  boundaries: Array<{ from: string; to: string; callCount: number }>;
  /** 意图证据（注释/首提交/测试行为，「设计动机」的锚点源） */
  intent?: IntentEvidence[];
}

/** Context for outline chapter pages（章节页：outline.json 锁定，brief 驱动） */
export interface ChapterPageContext {
  chapterId: string;
  chapterTitle: string;
  chapterSummary: string;
  pageId: string;
  title: string;
  /** 规划期锁定的写作简报（要点、真实符号、建议小节） */
  brief: string;
  files: string[];
  symbols: TopicContext['symbols'];
  edges: TopicContext['edges'];
  boundaries: TopicContext['boundaries'];
  /** 意图证据（注释/首提交/测试行为） */
  intent?: IntentEvidence[];
}

/** Context for decisions page（设计决策与演进，git + 文档证据锚定）
 *  只承载真实证据：模块级 git 聚合、文档小节、高频变更；无证据时整页剔除 */
export interface DecisionsContext {
  /** 模块级演进聚合（首末提交/提交数/高频主题） */
  gitTimeline: Array<{
    module: string;
    commitCount: number;
    first: GitCommitRef | null;
    last: GitCommitRef | null;
    themes: string[];
  }>;
  /** 设计文档小节证据（README/docs 切节） */
  docDecisions: IntentEvidence[];
  /** 高频变更文件（维护风险热点） */
  hotFileChurn: Array<{ file: string; commitCount: number; last: GitCommitRef | null }>;
  /** 依赖引入相关提交（dep 名 → 佐证主题） */
  depCommits?: IntentEvidence[];
}

/** Build options for wiki generation */
export interface WikiBuildOptions {
  model?: string;
  baseURL?: string;
  apiKey?: string;
  noLlm?: boolean;
  pages?: string[];
  /** full=全量覆盖重写；update=内容一致时跳过重写并输出变更摘要 */
  mode?: 'full' | 'update';
  /** 重新探测主题页并覆盖 topics.json */
  refreshTopics?: boolean;
  /** 重新规划章节树并覆盖 outline.json（无 LLM 时回退现有锁定文件） */
  refreshOutline?: boolean;
  /** LLM 请求超时（秒，来自全局配置 provider.timeout） */
  timeoutSec?: number;
  /** 单轮流式生成的输出 token 预算（来自全局配置 build.max_output_tokens，默认 8000） */
  maxOutputTokens?: number;
  /** 待确认项人工裁决会话（全部页面生成后、写盘前调用一次）；缺省不交互。
 *  确认的 claim 持久化到 .scx-wiki-agent/confirmations.json，后续构建免标 */
  confirmSession?: (items: PendingConfirmation[]) => Promise<ConfirmationDecision[]>;
  onChunk?: (filename: string, text: string) => void;
}