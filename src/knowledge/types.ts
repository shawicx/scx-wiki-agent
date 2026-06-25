// src/knowledge/types.ts

import type { SymbolType, RelationType } from '../core/types.js';

/** Context for overview page */
export interface OverviewContext {
  projectType: string;
  hasTypeScript: boolean;
  fileCount: number;
  techStack: string[];
  sourceDirs: string[];
  entryFiles: Array<{ name: string; path: string }>;
  topSymbols: Array<{ name: string; type: SymbolType; docstring?: string | null; complexity?: number }>;
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
}

/** Context for modules page */
export interface ModulesContext {
  modules: ModuleSummary[];
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
}

/** Context for business page */
export interface BusinessContext {
  services: Array<{
    name: string;
    filePath: string;
    methods: Array<{ name: string; visibility: string | null; docstring?: string | null }>;
    dependencies: Array<{ target: string; type: RelationType }>;
    codeSnippet: string;
  }>;
}

/** Detected design pattern */
export interface DesignPattern {
  pattern: string;
  evidence: string[];
  files: string[];
}

/** Context for design-decisions page */
export interface DesignDecisionsContext {
  patterns: DesignPattern[];
  techChoices: Array<{
    technology: string;
    category: string;
    evidence: string[];
  }>;
}

/** Context for glossary page */
export interface GlossaryContext {
  symbols: Array<{
    name: string;
    type: SymbolType;
    filePath: string;
    docstring?: string | null;
    signature?: string | null;
    complexity?: number;
  }>;
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
  /** 文档索引：文件名 → 该文档回答的核心问题 */
  docIndex: Array<{ file: string; tier: string; answer: string }>;
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
  cliCommands: Array<{ name: string; description: string }>;
}

/** Context for troubleshooting page */
export interface TroubleshootingContext {
  projectType: string;
  techStack: string[];
  modules: Array<{ name: string }>;
}

/** Union type for all page contexts */
export type WikiPageContext =
  | OverviewContext
  | ArchitectureContext
  | DataFlowContext
  | ModulesContext
  | ApiContext
  | BusinessContext
  | DesignDecisionsContext
  | GlossaryContext;

/** Build options for wiki generation */
export interface WikiBuildOptions {
  model?: string;
  baseURL?: string;
  apiKey?: string;
  noLlm?: boolean;
  pages?: string[];
  onChunk?: (filename: string, text: string) => void;
}