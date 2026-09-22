// src/knowledge/types.ts

import type { SymbolType, RelationType } from '../core/types.js';

/** Hotspot 补强符号：structure 页证据不足时从图谱补充的真实符号（二次扩展检索） */
export interface SupplementalSymbol {
  name: string;
  type: SymbolType;
  file: string;
  complexity?: number;
  signature?: string | null;
}

/** Context for overview page */
export interface OverviewContext {
  projectType: string;
  hasTypeScript: boolean;
  fileCount: number;
  techStack: string[];
  sourceDirs: string[];
  /** package.json 的 name/description（缺失为空串） */
  packageName?: string;
  packageDescription?: string;
  entryFiles: Array<{ name: string; path: string }>;
  topSymbols: Array<{ name: string; type: SymbolType; docstring?: string | null; complexity?: number }>;
  supplementalSymbols?: SupplementalSymbol[];
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
}

/** Context for architecture page */
export interface ArchitectureContext {
  modules: ModuleSummary[];
  interModuleRelations: Array<{
    source: string;
    target: string;
    type: RelationType;
  }>;
  /** 分层信息（来自 MCP get_architecture） */
  layers?: Array<{ name: string; layer: string; reason: string }>;
  /** 模块间调用边界（来自 MCP get_architecture） */
  boundaries?: Array<{ from: string; to: string; callCount: number }>;
  /** 聚类（来自 MCP get_architecture） */
  clusters?: Array<{ label: string; members: number; topNodes: string[] }>;
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
    edges: Array<{
      caller: string;
      callee: string;
      calleeFile: string;
      calleeLine: number;
    }>;
  }>;
  /** 全局扇入表（被调用次数最多的符号） */
  fanIn: Array<{ symbol: string; file: string; inDegree: number }>;
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
}

/** Context for decisions page (ADR 架构决策记录) */
export interface DecisionsContext {
  /** ADR 条目（编号+状态+背景+决策+后果） */
  adrs: Array<{
    id: string;
    title: string;
    status: 'accepted' | 'proposed' | 'deprecated';
    context: string;
    decision: string;
    consequences: string;
    files: string[];
  }>;
  /** 是否来自 MCP 持久化（false=自动降级生成） */
  fromMcp: boolean;
  supplementalSymbols?: SupplementalSymbol[];
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
  onChunk?: (filename: string, text: string) => void;
}