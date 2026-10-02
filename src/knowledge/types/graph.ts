/** 图谱侧共享类型：补强符号、依赖证据、模块汇总、架构/序列/IPC。 */

import type { SymbolType, RelationType } from '../../core/types.js';
import type { IntentEvidence } from '../intent-evidence.js';

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

/** tech-stack 页的依赖使用证据（版本 + 作用域化使用方式） */
export interface DependencyUsageInfo {
  name: string;
  version: string;
  importFiles: string[];
  usageKind: 'import' | 'test' | 'script';
}

/** Module summary for architecture and modules pages */
export interface ModuleSummary {
  name: string;
  /** 该包映射到的全部生产文件数；files 仅是 prompt 用的代表文件子集 */
  fileCount?: number;
  files: string[];
  symbols: Array<{
    name: string;
    type: SymbolType;
    file?: string;
    startLine?: number;
    docstring?: string | null;
    signature?: string | null;
    complexity?: number;
  }>;
  fileSymbols: Array<{ file: string; symbols: Array<{ name: string; type: SymbolType; file?: string; startLine?: number }> }>;
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
  /** 前端调用为空时的二次检索命中点：非空 = 扫描口径局限，不得断言「未被前端调用」 */
  frontendMissSuspect?: IpcRef[];
  /** Rust 定义为空时的二次检索命中点：非空 = 扫描口径局限 */
  rustMissSuspect?: IpcRef[];
}

/** IPC 事件：前端 listen ↔ 前端/Rust emit 对表 */
export interface IpcEvent {
  name: string;
  listeners: IpcRef[];
  emits: Array<IpcRef & { side: 'frontend' | 'rust' }>;
  /** 发射点为空时的二次检索命中点：非空 = 扫描口径局限，不得断言「无发射点」 */
  emitMissSuspect?: IpcRef[];
  /** 监听点为空时的二次检索命中点：非空 = 扫描口径局限 */
  listenMissSuspect?: IpcRef[];
}

/** Tauri IPC 面（tauri-ipc.ts 正则扫描产物） */
export interface IpcSurface {
  commands: IpcCommand[];
  events: IpcEvent[];
}
