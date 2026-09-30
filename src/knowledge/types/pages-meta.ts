/** 页面 Context 类型（续）：onboarding 及之后的页面 + 构建选项。 */

import type { ConstantEvidence, EnvVarEvidence } from '../../core/types.js';
import type { IntentEvidence, GitCommitRef } from '../intent-evidence.js';
import type { PendingConfirmation, ConfirmationDecision } from '../confirmation.js';
import type { DepUsage, SupplementalSymbol } from './graph.js';

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
  envVars?: EnvVarEvidence[];
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
  envVars?: EnvVarEvidence[];
  /** 限制常量（源码 MAX/LIMIT/TIMEOUT 等，排障边界参考） */
  constants?: ConstantEvidence[];
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
    type: import('../../core/types.js').SymbolType;
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
  /** 证据索引（evidence-ID 试点）：符号/边/边界/意图的稳定编号，供 LLM 以 [E#] 引用声明证据 */
  evidenceIndex?: import('../evidence-id.js').EvidenceRef[];
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
