/** 各 wiki 页面 Context 类型（LLM 路径的 prompt 数据契约）+ 构建选项。 */

import type { SymbolType, ConstantEvidence, EnvVarEvidence } from '../../core/types.js';
import type { IntentEvidence, GitCommitRef } from '../intent-evidence.js';
import type { PendingConfirmation, ConfirmationDecision } from '../confirmation.js';
import type { SupplementalSymbol, DepUsage, DependencyUsageInfo, ModuleSummary, IpcSurface } from './graph.js';

/** Context for overview page */
export interface OverviewContext {
  projectType: string;
  hasTypeScript: boolean;
  fileCount: number;
  productionFileCount?: number;
  testFileCount?: number;
  techStack: string[];
  sourceDirs: string[];
  /** 生产源码语言分布（来自 FileScanner；多语言项目如 Tauri 须说明各语言职责域）
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

/** Context for modules page */
export interface ModulesContext {
  modules: ModuleSummary[];
  /** 模块数超过详述上限时的概要聚合（其余模块只列名称与规模） */
  otherModules?: Array<{ name: string; fileCount: number; symbolCount: number }>;
  supplementalSymbols?: SupplementalSymbol[];
  /** 页级意图证据（文档小节等模块无关证据） */
  intent?: IntentEvidence[];
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
  coreDeps: DependencyUsageInfo[];
  /** 开发依赖（devDependencies 中被生产 import 或脚本引用的） */
  devDeps: DependencyUsageInfo[];
  /** 仅测试 / fixture 使用的依赖 */
  testDeps: DependencyUsageInfo[];
  /** 声明未用依赖（package.json 声明但 src/ 中 0 import） */
  unusedDeps: Array<{ name: string; version: string }>;
  /** 运行时/构建信息 */
  runtime: string;
  buildTool: string;
  packageManager: string;
  /** Rust 依赖栈（src-tauri/Cargo.toml [dependencies]/[dev-dependencies]；非 Rust 项目为空/缺省） */
  rustDeps?: Array<{ name: string; version: string; used: boolean }>;
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
  envVars: EnvVarEvidence[];
}

/** Context for testing page (测试) */
export interface TestingContext {
  framework: string | null;
  configPath: string | null;
  testDirs: string[];
  fixturesDir: string | null;
  runCommand: string;
  productionFileCount: number;
  testFileCount: number;
  testOnlyEnvVars: EnvVarEvidence[];
  testOnlyConstants: ConstantEvidence[];
  testOnlyDeps: Array<{ name: string; version: string; importFiles: string[] }>;
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
  constants: ConstantEvidence[];
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
