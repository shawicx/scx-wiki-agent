import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type {
  OverviewContext,
  ArchitectureContext,
  DataFlowContext,
  ModulesContext,
  ModuleSummary,
  ApiContext,
  GlossaryContext,
  OnboardingContext,
  TroubleshootingContext,
  TestingContext,
  ConstraintsContext,
  EnvironmentContext,
  TechStackContext,
  ConventionsContext,
  CliContext,
  TopicContext,
  ChapterPageContext,
  DecisionsContext,
} from './types.js';
import type { IntentEvidence } from './intent-evidence.js';
import { isTopicPage, isChapterPage } from './page-registry.js';
import { sanitizeWikiOutput } from './wiki-output-sanitizer.js';
import { assembleSections, findSafeCut, isAbnormalFinish } from './wiki-continuation.js';
import { WIKI_MAX_CONTINUATIONS } from '../shared/constants.js';

interface PageConfig {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}

/** 单轮流式生成的产出与终止原因 */
interface StreamOutcome {
  text: string;
  reasoning: string;
  finish: string;
}

/** 带续写统计的一节/一页生成结果 */
interface GenerationOutcome {
  content: string;
  rounds: number;
  truncated: boolean;
}

/** 单页生成结束后的续写/分节结果通知（供构建报告统计） */
export type PageGenNotice =
  | { kind: 'continuation'; rounds: number; truncated: boolean }
  | { kind: 'sections'; sections: number; continuedSections: number; truncated: boolean };

const CONTINUE_INSTRUCTION = [
  '你的上一轮输出因达到长度上限而中断。你上面那条回复是已生成的安全前缀，末尾不完整的代码块、段落或表格行已被移除。',
  '请从中断处直接继续，严格遵守：',
  '- 禁止重复或改写已输出的内容，禁止重新开始',
  '- 禁止任何开场白、说明或寒暄，直接续写 Markdown 正文',
  '- 保持既有章节编号、表格与图表规范，反幻觉规则 R1-R7 继续生效',
  '- 一次性写完剩余全部章节',
].join('\n');

/** 均匀分块（保序） */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** 从相对路径推导模块归属键（src/<module>/… → <module>，否则取首段目录） */
function moduleKeyOf(filePath: string): string {
  const parts = filePath.split('/');
  const srcIdx = parts.indexOf('src');
  if (srcIdx >= 0 && srcIdx + 1 < parts.length) return parts[srcIdx + 1];
  return parts.length > 1 ? parts[0] : filePath;
}

/** 意图证据 → 紧凑 prompt 形态（kind/text/anchor/target 摘要，预算内原样引用） */
function intentToPrompt(items: IntentEvidence[] | undefined): Array<{ kind: string; text: string; anchor: string; target: string }> {
  return (items ?? []).map(e => ({
    kind: e.kind,
    text: e.text,
    anchor: e.anchor,
    target: e.target.symbol ?? e.target.module ?? e.target.file ?? '',
  }));
}

/** 分节作用域约束：告知本页节清单与本节职责，防止跨节越界或重复 */
function sectionScope(pageTitle: string, sectionTitle: string, siblings: string[]): string {
  return [
    `本页面（${pageTitle}）分多节生成，完整节清单：${siblings.join('、')}。`,
    `你只负责生成「${sectionTitle}」这一节。`,
    '禁止输出页面开头导语、其他节的内容或全页总结；正文直接以本节的二级标题（##）开头。',
  ].join('\n');
}

/** 生成器级设置（来自全局配置：请求超时与输出预算） */
export interface GeneratorSettings {
  /** 请求超时毫秒数（每次流式请求独立计时） */
  timeoutMs?: number;
  /** 单轮流式输出的默认 token 预算（页面配置未显式指定时生效） */
  maxOutputTokens?: number;
}

export class WikiPageGenerator {
  private model: ReturnType<ReturnType<typeof createOpenAI>> | null;

  constructor(
    modelName?: string,
    baseURL?: string,
    apiKey?: string,
    private onNotice?: (notice: PageGenNotice) => void,
    private settings?: GeneratorSettings,
  ) {
    if (modelName) {
      const options: Parameters<typeof createOpenAI>[0] = {};
      if (baseURL) {
        options.baseURL = baseURL;
      }
      if (apiKey) {
        options.apiKey = apiKey;
      } else if (baseURL) {
        options.apiKey = 'ollama';
      }
      const provider = createOpenAI(options);
      this.model = provider.chat(modelName);
    } else {
      this.model = null;
    }
  }

  hasModel(): boolean {
    return this.model !== null;
  }

  /** 规划类调用的原始文本（章节树 planner 复用模型与续写能力；不做 sanitize） */
  async plan(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.model) return '';
    const r = await this.generateWithContinuation(() => {}, { systemPrompt, userPrompt });
    return r.content;
  }

  /** 按页面名派发 LLM 生成（供 PageRegistry 调用） */
  async generateByName(page: string, ctx: any, onChunk: (text: string) => void): Promise<string> {
    if (isChapterPage(page)) return this.generateChapterPage(ctx, onChunk);
    if (isTopicPage(page)) return this.generateTopic(ctx, onChunk);
    switch (page) {
      case 'overview': return this.generateOverview(ctx, onChunk);
      case 'architecture': return this.generateArchitecture(ctx, onChunk);
      case 'data-flow': return this.generateDataFlow(ctx, onChunk);
      case 'modules': return this.generateModules(ctx, onChunk);
      case 'api': return this.generateApi(ctx, onChunk);
      case 'onboarding': return this.generateOnboarding(ctx, onChunk);
      case 'troubleshooting': return this.generateTroubleshooting(ctx, onChunk);
      case 'glossary': return this.generateGlossary(ctx, onChunk);
      case 'testing': return this.generateTesting(ctx, onChunk);
      case 'constraints': return this.generateConstraints(ctx, onChunk);
      case 'decisions': return this.generateDecisions(ctx, onChunk);
      case 'environment': return this.generateEnvironment(ctx, onChunk);
      case 'tech-stack': return this.generateTechStack(ctx, onChunk);
      case 'conventions': return this.generateConventions(ctx, onChunk);
      case 'cli': return this.generateCliPage(ctx, onChunk);
      default: return '';
    }
  }

  async generateOverview(ctx: OverviewContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的项目概述页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 第一段用3-5句话说明项目是什么、解决什么问题、面向什么场景；如提供 readmeExcerpt（仓库 README 自述），须吸收其项目定位与功能描述（冲突处以代码证据为准并标「待确认」）
- 如 languages 显示多语言（如 TypeScript + Rust），必须在概述中说明各语言的职责域（前端/后端划分），不得遗漏任一语言的存在；各语言的 exampleFiles 是扫描清单内的真实文件，职责描述必须锚定这些完整路径，严禁以「未提供该语言文件路径」为由标「待确认」
- 如提供 docsFiles，在概述末尾列出延伸阅读清单（相对路径原样保留）
- "核心设计思路"章节：用2-3段自然语言描述项目的架构理念、关键设计决策、技术选型理由（结合技术栈）；如提供 intent（意图证据：注释/提交/文档小节/测试行为），每条动机叙述必须引用其原文并携带证据锚点（file:line / commit 哈希+日期 / 文档路径#标题），无证据支撑的设计判断标注「推断」并写明依据（R7）
- "技术栈"章节：用表格列出每项技术及用途，并在表格后用1-2段分析技术选型的合理性；如提供 depUsage（依赖使用证据），用途陈述必须锚定其证据——usageKind=import 锚定 importFiles、test 锚定测试文件、script 锚定 scripts 命令；usageKind ≠ none 的依赖严禁标「待确认」或「声明未用」，仅 none 可标「声明未用」
- "项目结构"章节：逐一描述每个源代码目录的职责（至少覆盖所有 sourceDirs），说明目录间的关系；多语言项目的 sourceDirs 含各语言的源码目录（如 src 与 src-tauri）
- "入口文件"章节：列出每个入口点，说明其启动流程和职责
- "核心组件"章节：基于 topSymbols 数据，用一段话介绍项目中复杂度最高/调用最频繁的核心组件
- 不要只列举符号名，要解释每个组件的用途和设计意图
- 内容要充实，宁可详细也不要遗漏重要信息`,
      userPrompt: JSON.stringify({
        projectType: ctx.projectType,
        hasTypeScript: ctx.hasTypeScript,
        fileCount: ctx.fileCount,
        techStack: ctx.techStack,
        entryFiles: ctx.entryFiles.map(f => f.path),
        sourceDirs: ctx.sourceDirs,
        languages: ctx.languages ?? [],
        readmeExcerpt: ctx.readmeExcerpt ?? null,
        docsFiles: ctx.docsFiles ?? [],
        packageName: ctx.packageName ?? '',
        packageDescription: ctx.packageDescription ?? '',
        topSymbols: ctx.topSymbols
          .filter((s, i, a) => a.findIndex(t => t.name === s.name) === i)
          .slice(0, 10)
          .map(s => ({
            name: s.name,
            type: s.type,
            docstring: s.docstring,
            complexity: s.complexity,
          })),
        supplementalSymbols: ctx.supplementalSymbols ?? [],
        depUsage: ctx.depUsage ?? [],
        intent: intentToPrompt(ctx.intent),
      }, null, 2),
    });
  }

  async generateArchitecture(ctx: ArchitectureContext, onChunk: (text: string) => void): Promise<string> {
    return this.generateSectioned(onChunk, this.buildArchitectureSections(ctx));
  }

  /** 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 */
  private buildArchitectureSections(ctx: ArchitectureContext): PageConfig[] {
    const toDetail = (m: ModuleSummary) => ({
      name: m.name,
      symbolCount: m.symbols.length,
      languages: m.languages ?? [],
      fanIn: m.fanIn,
      fanOut: m.fanOut,
      topSymbols: m.symbols
        .filter((s, i, a) => a.findIndex(t => t.name === s.name) === i)
        .slice(0, 6)
        .map(s => ({
          name: s.name,
          type: s.type,
          docstring: s.docstring,
          signature: s.signature,
        })),
      dependsOn: [...new Set(m.outgoingRelations.map(r => r.target))].slice(0, 5),
      usedBy: [...new Set(m.incomingRelations.map(r => r.source))].slice(0, 5),
      intent: intentToPrompt(m.intent),
    });
    const relations = ctx.interModuleRelations
      .filter((r, i, a) => a.findIndex(t => t.source === r.source && t.target === r.target) === i)
      .slice(0, 30);
    const detailBatches = chunk(ctx.modules.map(toDetail), 6);
    const sectionTitles = [
      '整体架构设计思路与架构图',
      ...detailBatches.map((_, i) => `核心模块详解（第${i + 1}批）`),
      '模块依赖分析与横切关注点',
    ];

    const sections: PageConfig[] = [
      {
        systemPrompt: `${sectionScope('架构文档', sectionTitles[0], sectionTitles)}\n\n你是一个资深软件架构师。请生成架构文档的「整体架构设计思路与架构图」节（Markdown格式）。

要求：
- 用中文撰写
- 用3-4段自然语言深入分析系统的分层方式、各层职责、层间协作机制、架构风格。结合 layers 数据说明每个包属于哪一层及原因
- "架构图"：用 Mermaid graph TD 展示完整的模块依赖关系图（节点用模块名，边表示依赖方向），Mermaid 图中的节点名必须与数据中的实际模块名一致
- 不要展开单个模块的符号细节（详解由其他节负责）`,
        userPrompt: JSON.stringify({
          modules: ctx.modules.map(m => ({ name: m.name, symbolCount: m.symbols.length })),
          relations,
          layers: ctx.layers,
          clusters: ctx.clusters,
        }, null, 2),
      },
    ];

    detailBatches.forEach((batch, i) => {
      sections.push({
        systemPrompt: `${sectionScope('架构文档', sectionTitles[i + 1], sectionTitles)}\n\n你是一个资深软件架构师。请生成架构文档的「核心模块详解」节（第${i + 1}/${detailBatches.length}批，Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 对本批每个模块，用1-2段详细描述其职责、核心符号的作用（引用 docstring 和 signature）、设计意图；如模块携带 intent（文件头自述/首提交/高频提交主题/测试行为承诺），设计意图必须优先引用这些证据原文并携带锚点（file:line / commit 哈希+日期），无证据的意图叙述标注「推断」并写明依据（R7）；fanIn/fanOut 是模块重要性的量化依据，可引用
- 模块的 languages 显示多语言时，必须分别说明各语言的职责域（如该模块同时含 TypeScript 与 Rust 代码）
- 如果模块有 topSymbols，必须逐一说明其用途
- 只描述本批数据中的模块，禁止描述其他批次的模块`,
        userPrompt: JSON.stringify({
          modules: batch,
          supplementalSymbols: ctx.supplementalSymbols ?? [],
        }, null, 2),
      });
    });

    sections.push({
      systemPrompt: `${sectionScope('架构文档', sectionTitles[sectionTitles.length - 1], sectionTitles)}\n\n你是一个资深软件架构师。请生成架构文档的「模块依赖分析与横切关注点」节（Markdown格式）。

要求：
- 用中文撰写
- "模块依赖分析"：基于 boundaries 数据，用表格列出每个依赖边及其调用次数，并用文字分析关键依赖路径
- "横切关注点"：分析错误处理、日志、配置管理等横切机制`,
      userPrompt: JSON.stringify({
        relations,
        boundaries: ctx.boundaries,
        modules: ctx.modules.map(m => ({
          name: m.name,
          dependsOn: [...new Set(m.outgoingRelations.map(r => r.target))].slice(0, 5),
          usedBy: [...new Set(m.incomingRelations.map(r => r.source))].slice(0, 5),
        })),
      }, null, 2),
    });

    return sections;
  }

  async generateDataFlow(ctx: DataFlowContext, onChunk: (text: string) => void): Promise<string> {
    const sequences = ctx.sequences.map(s => ({
      name: s.name,
      participants: s.participants.map(p => ({
        name: p.name,
        type: p.type,
        file: p.filePath,
      })),
      messages: s.messages.map(m => ({
        from: m.from,
        to: m.to,
        label: m.label,
        location: `${m.filePath}:${m.callLine}`,
      })),
    }));

    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据执行序列数据生成详尽、专业的数据流文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "核心数据流概览"：用2-3段描述项目从入口到完成的核心数据流走向，说明主要阶段和数据如何在模块间流转
- "数据阶段表"：用表格描述每个处理阶段（这是核心，替代时序图）：
  | 阶段 | 输入类型 | 输出类型 | 关键函数 | 源文件:行号 |
  每个阶段对应数据流中的一个转换步骤。从 sequences 数据推导出阶段（如"扫描"→"索引"→"生成"）
- "错误路径"：报错分支触发的调用须单独标注"错误路径"，不得混入主成功流程
- 每条事实声明必须带 file:line 或函数名锚点（R1 锚点强制）
- 严禁使用 sequenceDiagram 表达调用关系（R2 边表优于时序图）；调用关系详见 calls.md
- 内容要充实，要让读者理解数据在各阶段如何变换`,
      userPrompt: JSON.stringify({ sequences, supplementalSymbols: ctx.supplementalSymbols ?? [] }, null, 2),
    });
  }

  async generateModules(ctx: ModulesContext, onChunk: (text: string) => void): Promise<string> {
    return this.generateSectioned(onChunk, this.buildModulesSections(ctx));
  }

  /** 模块页确定性节表：组织方式概述 → 模块详解（≤4 个/批）→ 其他模块汇总 */
  private buildModulesSections(ctx: ModulesContext): PageConfig[] {
    const toDetail = (m: ModuleSummary) => ({
      name: m.name,
      files: m.files.slice(0, 10),
      languages: m.languages ?? [],
      fanIn: m.fanIn,
      fanOut: m.fanOut,
      topSymbols: m.symbols
        .filter((s, i, a) => a.findIndex(t => t.name === s.name) === i)
        .slice(0, 6)
        .map(s => ({
          name: s.name,
          type: s.type,
          docstring: s.docstring,
          signature: s.signature,
        })),
      fileSymbols: m.fileSymbols.map(fs => ({
        file: fs.file,
        symbols: fs.symbols.map(s => `${s.name}(${s.type})`),
      })),
      dependsOn: [...new Set(m.outgoingRelations.map(r => r.target))].slice(0, 5),
      usedBy: [...new Set(m.incomingRelations.map(r => r.source))].slice(0, 5),
      intent: intentToPrompt(m.intent),
    });

    const hasOther = (ctx.otherModules ?? []).length > 0;
    const detailBatches = chunk(ctx.modules, 4).map(batch => batch.map(toDetail));
    const sectionTitles = [
      '组织方式概述',
      ...detailBatches.map((_, i) => `模块详解（第${i + 1}批）`),
      ...(hasOther ? ['其他模块汇总'] : []),
    ];

    const sections: PageConfig[] = [
      {
        systemPrompt: `${sectionScope('模块文档', sectionTitles[0], sectionTitles)}\n\n你是一个资深代码文档专家。请生成模块文档的「组织方式概述」节（Markdown格式）。

要求：
- 用中文撰写，用1-2段概述项目的模块组织方式和设计原则（模块清单与规模见数据）
- 不要展开任何单个模块的内部细节（详解由其他节负责）
- 只基于提供的模块清单描述，严禁编造模块`,
        userPrompt: JSON.stringify({
          modules: ctx.modules.map(m => ({
            name: m.name,
            fileCount: m.files.length,
            symbolCount: m.symbols.length,
          })),
        }, null, 2),
      },
    ];

    detailBatches.forEach((batch, i) => {
      sections.push({
        systemPrompt: `${sectionScope('模块文档', sectionTitles[i + 1], sectionTitles)}\n\n你是一个资深代码文档专家。请生成模块文档的「模块详解」节（第${i + 1}/${detailBatches.length}批，Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 对本批的每个模块，包含：
  - "职责"：该模块承担的职责（基于符号的 docstring 和 signature 详细说明）
  - "设计意图"：设计这个模块的原因，它在整体架构中的角色；如模块携带 intent（文件头自述/首提交/高频提交主题/测试行为承诺），必须优先引用证据原文并携带锚点（file:line / commit 哈希+日期，R7），无证据时标注「推断」并写明依据（命名/签名/依赖方向）
  - "交互方式"：与其他模块的协作方式（基于 dependsOn 和 usedBy）
  - "文件结构"：用表格列出该模块的文件及其关键符号和职责（文件名 | 关键符号 | 职责）
  - "核心符号"：对每个 topSymbol，用1-2句说明其用途（基于 docstring/signature）
- 模块的 languages 显示多语言时，必须分别说明各语言的职责域
- 按模块重要性排序（保持数据顺序）
- 只描述本批数据中的模块，禁止描述其他批次的模块
- 不要输出原始代码片段，但要引用关键函数的签名`,
        userPrompt: JSON.stringify({
          modules: batch,
          supplementalSymbols: ctx.supplementalSymbols ?? [],
        }, null, 2),
      });
    });

    if (hasOther) {
      sections.push({
        systemPrompt: `${sectionScope('模块文档', '其他模块汇总', sectionTitles)}\n\n你是一个资深代码文档专家。请生成模块文档的「其他模块汇总」节（Markdown格式）。

要求：
- 用中文撰写
- 用一张表汇总 otherModules 的名称与规模（模块 | 文件数 | 符号数）
- 严禁虚构这些聚合模块的内部细节（未提供其符号数据）`,
        userPrompt: JSON.stringify({ otherModules: ctx.otherModules }, null, 2),
      });
    }

    return sections;
  }

  async generateApi(ctx: ApiContext, onChunk: (text: string) => void): Promise<string> {
    const commands = ctx.commands
      .filter((c, i, a) => a.findIndex(t => t.name === c.name) === i);
    const functions = ctx.exportedFunctions
      .filter((f, i, a) => a.findIndex(t => t.name === f.name) === i)
      .slice(0, 20);
    const nodes = ctx.frameworkNodes
      .filter((n, i, a) => a.findIndex(t => t.name === n.name) === i)
      .slice(0, 10);
    const hasIpc = !!ctx.ipc && (ctx.ipc.commands.length > 0 || ctx.ipc.events.length > 0);

    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据API数据生成详尽、专业的API参考文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用1-2段概述项目的对外接口设计理念和主要交互方式
${hasIpc ? `
- "Tauri IPC 命令"章节（本项目 API 的主体，必须置前）：用表格列出（命令 | 前端调用点 | Rust 定义 | 状态），
  按功能分组并对每组说明用途与典型时序；rustDef 为空的命令标注「仅前端调用，Rust 侧未检出」，
  仅 Rust 定义的标注「未被前端调用」——两侧不匹配是重要事实，禁止省略或补造；
  最后注明扫描局限（invoke(变量) 动态命令名不在表内）
- "IPC 事件"章节：用表格列出（事件 | 前端监听点 | 发射点（前端/Rust）），说明事件驱动的交互模式` : ''}
- "CLI 命令"章节（如有）：用表格列出（命令名 | 说明 | 源文件位置），并在表格后逐个说明每个命令的功能、参数、使用场景（基于 description/docstring）
- "导出函数"章节：用表格列出（函数名 | 签名 | 说明 | 源文件:行号），按功能分组。对每个重要函数，补充1-2句说明其用途（基于 docstring/signature）
- 如果有框架相关的节点（如Controller、Router），用表格列出并说明
- 每个表格前用一段话说明该分类的作用和设计
- 内容要充实，不要只罗列，要解释每个 API 的用途`,
      userPrompt: JSON.stringify({
        ...(hasIpc ? {
          ipc: {
            commands: ctx.ipc!.commands.map(c => ({
              name: c.name,
              frontendCalls: c.frontendCalls.slice(0, 5).map(r => `${r.file}:${r.line}`),
              rustDef: c.rustDef ? `${c.rustDef.file}:${c.rustDef.line}` : null,
            })),
            events: ctx.ipc!.events.map(e => ({
              name: e.name,
              listeners: e.listeners.slice(0, 5).map(r => `${r.file}:${r.line}`),
              emits: e.emits.slice(0, 5).map(r => `${r.side} ${r.file}:${r.line}`),
            })),
          },
        } : {}),
        commands: commands.map(c => ({
          name: c.name,
          file: `${c.filePath}:${c.startLine}`,
          description: c.description,
        })),
        exportedFunctions: functions.map(f => ({
          name: f.name,
          signature: f.signature,
          docstring: f.docstring,
          file: `${f.filePath}:${f.startLine}`,
        })),
        frameworkNodes: nodes.map(n => ({ name: n.name, type: n.type, file: n.filePath })),
        supplementalSymbols: ctx.supplementalSymbols ?? [],
      }, null, 2),
    });
  }

  async generateOnboarding(ctx: OnboardingContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的上手指南页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "环境准备"章节：详细列出所需环境（Node.js版本、包管理器、系统要求），说明每个依赖的作用
- "安装步骤"章节：给出完整的安装流程，使用提供的包管理器，包含每步的预期输出和验证方法
- "项目初始化"章节：列出实际的CLI命令（从提供的命令列表中获取），说明每个命令的作用、参数（options 数据直接引用）与使用场景
- "基本使用"章节：详细列出核心命令和用法，用代码块展示命令示例，说明典型工作流（如 scan → build 的完整流程）；构建/测试等实际命令必须从 scripts 数据直接引用，严禁标「待确认」
- "环境变量"章节：如提供 envVars 数据，用表格列出变量名与敏感标记；未提供则不设该章节（不要标注待确认）
- "项目结构概览"章节：逐一描述每个源代码目录的含义和作用，锚定 sourceDirFiles 给出的各目录真实文件样本（严禁以「目录内部文件清单未提供」为由标待确认）
- "开发指南"章节：说明如何构建、如何运行测试、如何开发调试
- 只描述基于数据可以确定的内容，不要编造具体命令参数；工具链通用常识（包管理器命令差异、ESM/CJS 语义、构建工具常规行为）无需数据佐证，禁止标「待确认」；如提供 depUsage（依赖使用证据），依赖相关叙述按 usageKind 锚定，usageKind ≠ none 的依赖严禁标「待确认」或「声明未用」
- 内容要充实，要让新成员能据此快速上手`,
      userPrompt: JSON.stringify({
        projectType: ctx.projectType,
        hasTypeScript: ctx.hasTypeScript,
        techStack: ctx.techStack,
        entryFiles: ctx.entryFiles.map(f => f.path),
        sourceDirs: ctx.sourceDirs,
        packageManager: ctx.packageManager,
        nodeVersion: ctx.nodeVersion,
        cliCommands: ctx.cliCommands,
        scripts: ctx.scripts ?? {},
        envVars: ctx.envVars ?? [],
        depUsage: ctx.depUsage ?? [],
        sourceDirFiles: ctx.sourceDirFiles ?? [],
      }, null, 2),
    });
  }

  async generateTroubleshooting(ctx: TroubleshootingContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的故障排除页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "环境问题"章节：详细列出与项目技术栈相关的环境配置问题、版本冲突、依赖安装问题及解决方案（nodeVersion/envVars/packageManager 数据直接引用）
- "构建问题"章节：详细列出可能的构建失败场景（如 TypeScript 编译错误、打包问题、ESM/CJS 兼容）及解决方案（scripts.build 等实际命令直接引用）
- "运行时问题"章节：详细列出可能的运行时问题（如模块解析、路径问题、权限问题、外部依赖缺失如 codebase-memory-mcp 未安装）及解决方案；constants 中的限制常量（超时/上限）是排障的关键边界，必须逐个说明触界时的典型症状；如提供 intent 中的 why-marker（源码 TODO/FIXME/HACK 标记）与 git-churn（高频变更）证据，它们是作者自认的真实风险点与维护热点，按锚点引用并纳入对应问题条目（R7）
- "调试技巧"章节：列出针对该项目的调试方法（如 watch 构建、单文件测试调试、如何查看日志；入口文件 entryFiles 是排障起点）
- 每个问题用"问题描述 → 原因分析 → 解决方案"的详细格式，解决方案要具体可操作（给出实际命令）
- 只描述与项目技术栈相关的问题，不要编造不相关的场景；如提供 depUsage（依赖使用证据），技术相关问题的叙述按 usageKind 锚定（import 锚定 importFiles、test 锚定测试文件、script 锚定 scripts 命令），usageKind ≠ none 的依赖严禁标「待确认」或「声明未用」
- 数据已提供的字段（scripts/envVars/constants）严禁再标「待确认」；仅数据确实未覆盖的方面才诚实标注（R5）
- 内容要充实，要覆盖开发者实际会遇到的问题`,
      userPrompt: JSON.stringify({
        projectType: ctx.projectType,
        techStack: ctx.techStack,
        modules: ctx.modules.map(m => m.name).slice(0, 10),
        scripts: ctx.scripts ?? {},
        packageManager: ctx.packageManager ?? '',
        nodeVersion: ctx.nodeVersion ?? '',
        envVars: ctx.envVars ?? [],
        constants: ctx.constants ?? [],
        entryFiles: ctx.entryFiles ?? [],
        depUsage: ctx.depUsage ?? [],
        intent: intentToPrompt(ctx.intent),
      }, null, 2),
    });
  }

  async generateGlossary(ctx: GlossaryContext, onChunk: (text: string) => void): Promise<string> {
    return this.generateSectioned(onChunk, this.buildGlossarySections(ctx));
  }

  /**
   * 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化），
   * 贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节。
   */
  private buildGlossarySections(ctx: GlossaryContext): PageConfig[] {
    const symbols = ctx.symbols.slice(0, 40);
    const supplemental = ctx.supplementalSymbols ?? [];

    const groupOrder: string[] = [];
    const groups = new Map<string, GlossaryContext['symbols']>();
    for (const s of symbols) {
      const key = moduleKeyOf(s.filePath);
      if (!groups.has(key)) {
        groups.set(key, []);
        groupOrder.push(key);
      }
      groups.get(key)!.push(s);
    }

    const sectionCount = Math.min(3, Math.max(1, Math.ceil(symbols.length / 20)));
    const target = Math.max(1, Math.ceil(symbols.length / sectionCount));
    const buckets: Array<{ keys: string[]; symbols: GlossaryContext['symbols'] }> = [];
    let current = { keys: [] as string[], symbols: [] as GlossaryContext['symbols'] };
    for (const key of groupOrder) {
      const group = groups.get(key)!;
      if (current.symbols.length > 0 && current.symbols.length + group.length > target && buckets.length < sectionCount - 1) {
        buckets.push(current);
        current = { keys: [], symbols: [] };
      }
      current.keys.push(key);
      current.symbols.push(...group);
    }
    if (current.symbols.length > 0 || buckets.length === 0) buckets.push(current);

    const supplementalBySection = buckets.map(() => [] as NonNullable<GlossaryContext['supplementalSymbols']>);
    for (const s of supplemental) {
      const idx = buckets.findIndex(b => b.keys.includes(moduleKeyOf(s.file)));
      supplementalBySection[idx >= 0 ? idx : buckets.length - 1].push(s);
    }

    const toEntry = (s: GlossaryContext['symbols'][number]) => ({
      name: s.name,
      type: s.type,
      file: s.startLine && s.startLine > 0 ? `${s.filePath}:${s.startLine}` : s.filePath,
      docstring: s.docstring,
      signature: s.signature,
      complexity: s.complexity,
    });

    const sectionTitles = buckets.map((b, i) => `关键概念（第${i + 1}批·${b.keys.join('/') || '补强符号'}）`);

    return buckets.map((b, i) => ({
      systemPrompt: `${sectionScope('关键概念参考', sectionTitles[i], sectionTitles)}\n\n你是一个资深代码文档专家。请生成"关键概念"参考页的这一批符号内容（Markdown格式）。

要求：
- 用中文撰写${i === 0 ? `
- 开头用1段说明这个页面列出了项目的关键类型和函数，及其文档价值` : ''}
- 基于符号的实际所属模块分组（不要按字母排序），每组用表格列出（名称 | 类型 | 签名 | 说明 | 所属文件）
- "说明"列：基于提供的 docstring（如果有）写出准确的说明；docstring 为空时根据符号名和类型推断，但要标注是推断
- "签名"列：填入提供的 signature（如有）
- 对每个分组，用一段话说明该组符号的整体职责
- 只描述本批数据中的符号，禁止描述其他批次的符号`,
      userPrompt: JSON.stringify({
        modules: b.keys,
        symbols: b.symbols.map(toEntry),
        supplementalSymbols: supplementalBySection[i],
      }, null, 2),
    }));
  }

  async generateTopic(ctx: TopicContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深软件架构师。请根据主题数据生成详尽、专业的仓库专属主题文档页面（Markdown格式）。

该主题是从知识图谱聚类推导出的「跨模块协作面」——它横跨多个模块，是固定文档页面未覆盖的仓库特有主题。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用一段话说明该主题是什么、为什么值得单独成页（跨哪些模块、解决什么协作问题）
- "职责与范围"：说明主题覆盖的文件清单及其分工（基于 files 与 symbols）
- "关键符号"：对每个核心符号，用1-2段说明其用途与在主题中的角色（基于 docstring/signature，锚点用 file:line）
- "协作方式"：基于 edges 边表分析文件间如何配合（调用方向、数据流），用表格呈现调用边（R2 严禁时序图）
- "跨模块边界"：基于 boundaries 分析该主题与外部的耦合点及修改代价
- "设计动机"：如提供 intent（文件头自述/符号注释/首提交/测试行为承诺），必须优先引用证据原文并携带锚点（file:line / commit 哈希+日期，R7）；无证据的动机推断须显式标注「推断」并写明推断依据（命名/协作模式）
- 描述运行机制（生命周期、时序、等待/释放语义等）时，必须有数据中调用边或符号的 file:line 锚点佐证；无锚点佐证的机制描述必须显式标注「推断」，禁止以确定语气叙述
- 严禁编造数据外的方法、参数或行为（R1/R3）`,
      userPrompt: JSON.stringify({
        id: ctx.id,
        title: ctx.title,
        files: ctx.files,
        symbols: ctx.symbols.map(s => ({
          name: s.name,
          type: s.type,
          file: s.startLine && s.startLine > 0 ? `${s.file}:${s.startLine}` : s.file,
          docstring: s.docstring,
          signature: s.signature,
          complexity: s.complexity,
        })),
        edges: ctx.edges.map(e => ({
          caller: e.caller,
          callee: e.callee,
          location: e.line > 0 ? `${e.file}:${e.line}` : e.file,
        })),
        boundaries: ctx.boundaries,
        intent: intentToPrompt(ctx.intent),
      }, null, 2),
    });
  }

  async generateChapterPage(ctx: ChapterPageContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深软件架构师。请生成章节页「${ctx.title}」的详尽文档（Markdown格式）。

本页属于章节「${ctx.chapterTitle}」${ctx.chapterSummary ? `（${ctx.chapterSummary}）` : ''}，是仓库专属的深度主题页。

写作简报（规划期锁定，必须遵循其要点与结构）：
${ctx.brief}

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用一两句话说明本页职责与所属章节
- 按写作简报的要点组织小节；简报未覆盖但数据支持的内容可补充
- 如提供 intent（文件头自述/符号注释/首提交/测试行为承诺），动机类叙述必须优先引用证据原文并携带锚点（file:line / commit 哈希+日期，R7）；无证据的推断标注「推断」并写明依据
- 每条事实声明必须带 file:line 或函数名锚点（R1）
- 调用关系用表格（调用方→被调用方→file:line），严禁时序图（R2）
- 描述运行机制（生命周期、时序、等待/释放语义等）时，必须有数据中调用边或符号的 file:line 锚点佐证；无锚点佐证的机制描述必须显式标注「推断」，禁止以确定语气叙述
- 严禁编造数据外的方法、参数或行为（R3）`,
      userPrompt: JSON.stringify({
        chapter: ctx.chapterTitle,
        title: ctx.title,
        files: ctx.files,
        symbols: ctx.symbols.map(s => ({
          name: s.name,
          type: s.type,
          file: s.startLine && s.startLine > 0 ? `${s.file}:${s.startLine}` : s.file,
          docstring: s.docstring,
          signature: s.signature,
          complexity: s.complexity,
        })),
        edges: ctx.edges.map(e => ({
          caller: e.caller,
          callee: e.callee,
          location: e.line > 0 ? `${e.file}:${e.line}` : e.file,
        })),
        boundaries: ctx.boundaries,
        intent: intentToPrompt(ctx.intent),
      }, null, 2),
    });
  }

  async generateTesting(ctx: TestingContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据测试配置探测结果生成详尽、专业的测试文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "测试体系概览"：用表格列出框架/配置文件/测试目录/夹具目录的事实
- "运行方式"：基于 runCommand 给出完整命令，说明其做了什么、预期产出
- "测试策略解读"：基于检测到的事实（框架特性、目录组织、夹具位置）用1-2段分析项目的测试策略与覆盖重点
- 未检测到的项（framework 为 null 等）必须诚实标注「未检测到」，严禁编造框架特性、用例数量或覆盖率数字（R5）；未探测到的配置项（configPath/coverage 阈值等）直接省略或用一句话汇总缺口，禁止逐项标「待确认」；测试框架的通用用法（单文件运行、名称过滤、watch 模式）属公共常识，无需标注
- 内容要充实，让读者知道如何运行测试、测试覆盖了什么`,
      userPrompt: JSON.stringify({ ...ctx }, null, 2),
    });
  }

  async generateConstraints(ctx: ConstraintsContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据限制常量与复杂度数据生成详尽、专业的约束文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "限制常量"：用表格列出（常量 | 值 | 源文件），并逐个解读该常量防止的是什么失控场景（超时/内存/规模上限等）；如 intent 携带 const-comment（常量的源码注释），解读必须优先引用注释原文并携带 file:line 锚点（R7）——这是作者亲写的「为什么有这个限制」
- "复杂度热点"：用表格列出（函数 | 源文件 | 复杂度 | 循环深度），对复杂度最高的前几个函数深入分析潜在风险与重构方向
- "已知边界"：总结上述数据反映出的项目边界（哪些地方最脆弱、改动代价在哪）
- 无数据的分类诚实标注「未检测到」，严禁编造阈值或性能数字（R5）
- 每条事实声明必须带 file 锚点（R1）
- 内容要充实，让读者理解项目的硬边界与维护成本所在`,
      userPrompt: JSON.stringify({ ...ctx }, null, 2),
    });
  }

  async generateEnvironment(ctx: EnvironmentContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据运行态探测数据生成详尽、专业的环境文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "项目信息"章节：用表格列出包名/版本/运行时（ESM/CJS）/Node 版本/包管理器，并用一段话说明运行时与包管理器的实际影响（如 ESM 对 import 的要求、包管理器对应的安装命令前缀）
- "脚本命令"章节：用表格列出 scripts 的每个命令与脚本内容，逐个解释其行为与预期产出
- "环境变量"章节：如提供 envVars，用表格列出变量名/敏感标记，说明典型用途；未提供则不设该章节（不要标注待确认）
- 数据已提供的字段（packageManager/scripts/envVars）严禁再标「待确认」（R5）；工具链通用常识（ESM/CJS 语义、各包管理器命令差异）无需数据佐证，禁止标「待确认」；具体配置文件内容、端口、版本号等数据未提供的条目直接省略，不要逐项标「待确认」
- 内容要充实，让读者据此能正确准备环境与运行全部命令`,
      userPrompt: JSON.stringify({
        packageName: ctx.packageName,
        version: ctx.version,
        runtime: ctx.runtime,
        nodeVersion: ctx.nodeVersion,
        packageManager: ctx.packageManager,
        scripts: ctx.scripts,
        envVars: ctx.envVars,
      }, null, 2),
    });
  }

  async generateTechStack(ctx: TechStackContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据依赖分析数据生成详尽、专业的技术栈文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用1-2段概述项目的技术选型全貌（运行时/构建工具/包管理器/核心框架）
- "核心依赖"章节：用表格列出（依赖 | 版本 | 首个 import 点），按职责分组（框架/UI/状态/工具等），对每组用1-2段说明选型理由与协作关系（基于依赖职责与 import 分布，不得编造调用细节）；如提供 intent（依赖相关提交主题 git-commit 证据），选型/引入动机必须优先引用提交主题并携带 commit 哈希+日期锚点（R7），无提交佐证的动机分析标注「推断」
- "开发依赖"章节：用表格列出（依赖 | 版本 | 首个 import 点），说明各自的开发场景用途
- "声明未用依赖"章节：仅当 unusedDeps 非空时输出表格，且必须在其前写明：「下表由源码 import 扫描推导（覆盖 .ts/.js/.vue/.css），存在动态加载、字符串引用等扫描盲区，清理前请人工复核」——严禁断言这些依赖一定无用
- 每条 import 点锚点必须原样保留（R1/R3）
- 内容要充实，让读者理解技术栈全貌与升级影响面`,
      userPrompt: JSON.stringify({
        coreDeps: ctx.coreDeps,
        devDeps: ctx.devDeps,
        unusedDeps: ctx.unusedDeps,
        runtime: ctx.runtime,
        buildTool: ctx.buildTool,
        packageManager: ctx.packageManager,
        intent: intentToPrompt(ctx.intent),
      }, null, 2),
    });
  }

  async generateConventions(ctx: ConventionsContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据规约探测数据生成详尽、专业的规约文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "工具链规约"章节：用表格列出 Linter/EditorConfig 的配置状态与配置文件，editorConfig 原文用代码块展示
- "AI 协作规约（AGENTS.md 提炼）"章节：如提供 agentsMd，**提炼**其规约要点（命名/导入/注释/禁止项/工作流约定），按主题分组为表格或列表——严禁整篇复制原文，严禁编造原文没有的规约
- "命名与结构规约"章节：仅基于 AGENTS.md 与工具链配置可确定的内容归纳；无依据的方面直接省略
- 数据已提供的字段（hasLinter/linterConfig/agentsMd）严禁再标「待确认」（R5）
- 内容要充实，让新成员与 AI 都能据此遵守项目规约`,
      userPrompt: JSON.stringify({
        hasLinter: ctx.hasLinter,
        linterConfig: ctx.linterConfig,
        hasEditorConfig: ctx.hasEditorConfig,
        editorConfig: ctx.editorConfig,
        agentsMd: ctx.agentsMd ? ctx.agentsMd.slice(0, 6000) : null,
      }, null, 2),
    });
  }

  async generateCliPage(ctx: CliContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据 CLI 命令数据生成详尽、专业的 CLI 参考文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用1-2段概述 CLI 的命令组织方式与典型工作流
- "命令总表"章节：用表格列出（命令 | 说明 | 源文件:行号）
- 每个命令单独一节：说明其功能、参数（options 表格：参数 | 说明）、使用场景与示例（示例中的命令名与参数必须来自数据，严禁编造参数）
- "退出码"章节：如提供 exitCodes，用表格列出（码 | 触发上下文 | 源文件），说明其语义
- 每条事实声明必须带 file:line 锚点（R1）
- 内容要充实，让读者不用翻源码就能正确使用 CLI`,
      userPrompt: JSON.stringify({
        commands: ctx.commands,
        exitCodes: ctx.exitCodes,
      }, null, 2),
    });
  }

  async generateDecisions(ctx: DecisionsContext, onChunk: (text: string) => void): Promise<string> {
    const commitRef = (c: { hash: string; date: string; subject: string } | null) =>
      c ? `commit:${c.hash.slice(0, 8)} (${c.date})「${c.subject}」` : '-';
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深软件架构师。请基于 git 提交历史与仓库设计文档证据，生成「设计决策与演进」页面（Markdown格式）。

本页的职责是从真实证据中还原项目的演进动机与关键决策。每条决策必须携带证据锚点（commit 短哈希+日期 或 文档路径#标题），无锚点的内容不得写成决策（R7）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "演进时间线"：基于 gitTimeline 用表格（模块 | 提交数 | 首次提交 | 最近提交 | 高频主题）梳理演进脉络，并用2-3段分析各模块的演进重心与节奏；首次提交主题是模块「诞生动机」的最直接证据，必须引用
- "文档记录的决策"：基于 docDecisions 逐条引用文档小节（标题+摘录+锚点），说明其记录的设计决策与动机；摘录须忠实于原文
- "依赖引入决策"：如提供 depCommits，逐条说明依赖引入时的提交主题佐证（保留 commit 锚点）
- "高频变更热点"：基于 hotFileChurn 说明哪些文件变更最频繁，结合最近提交主题分析维护风险与稳定性
- 提交主题为英文时保留原文，用中文解释其含义
- 严禁把证据没有支撑的内容写成决策；严禁编造提交、文档或动机（R1/R3/R7）`,
      userPrompt: JSON.stringify({
        gitTimeline: (ctx.gitTimeline ?? []).map(t => ({
          module: t.module,
          commitCount: t.commitCount,
          first: commitRef(t.first),
          last: commitRef(t.last),
          themes: t.themes,
        })),
        docDecisions: intentToPrompt(ctx.docDecisions),
        hotFileChurn: (ctx.hotFileChurn ?? []).map(c => ({
          file: c.file,
          commitCount: c.commitCount,
          last: commitRef(c.last),
        })),
        depCommits: intentToPrompt(ctx.depCommits),
      }, null, 2),
    });
  }

  // --- Core generation ---
  private static readonly ANTI_HALLUCINATION = [
    '绝对规则：只能基于提供的JSON数据描述项目，严禁编造不存在的模块、服务、功能或业务场景。',
    '如果数据不足以描述某个方面，直接省略或注明"信息不足"，不要猜测或补充。',
    '不要将测试代码（tests/目录下的文件）当作项目功能来描述。',
    '',
    '铁律（违反即不可用）：',
    'R1 锚点强制：每条事实声明必须带 file:line 或 qualified_name；锚点路径必须用数据中的完整相对路径（如 src-tauri/src/main.rs，含目录前缀），严禁只写文件名；无锚点的声明不得写入。',
    'R2 边表优于时序图：调用关系用表格（调用方→被调用方→file:line），严禁用 sequenceDiagram 表达静态可达性。',
    'R3 拒绝编造用途：任何依赖/函数的"用途"必须有源码调用点佐证；数据中给出的使用证据（depUsage/importFiles/调用边）即为佐证，usageKind ≠ none 或有 import 点/调用边时严禁标"声明未用"。',
    'R4 结构化优先：用表格/列表而非散文；签名用代码块。',
    'R5 待确认标记：数据不足以描述的关键方面，写「待确认」并简述缺什么证据，禁止猜测或编造合理化解释；单页「待确认」总数控制在 5 处以内，只保留影响读者决策的关键缺口，次要缺口直接省略不提。',
    'R6 图表真实性：Mermaid 图中的节点/标签必须来自数据中的真实模块名、符号名或文件路径；无继承数据时严禁编造 classDiagram 继承边。',
    'R7 动机锚定：动机/设计依据/演进类叙述必须锚定证据——注释引用（file:line）、提交信息（commit 短哈希+日期）、文档小节（路径#标题）、测试用例名（测试文件:行号）；数据中的 intent 数组即证据源，引用时保留锚点；无锚点的动机段必须显式标注「推断」并写明推断依据（命名/签名/结构特征），单页「推断」段不超过 2 处。',
    '',
    '图表选型指引：模块依赖→graph TD；调用关系→表格（R2）；数据流→阶段表；类层次→仅当数据含继承关系时用 classDiagram；状态变迁→仅当数据含状态枚举与转换证据时用 stateDiagram。',
    '',
    '页面质量要求（project-wiki 方法论）：',
    '- 单页最低内容：开头一句话说明本页职责，随后是基于数据的事实要点（表格/列表优先），不产出空章节。',
    '- AI 友好必达：内容应能快速回答（按页面主题取相关项）——项目是什么、技术栈、模块职责、如何启动、数据在哪、配置从哪来、外部依赖是什么。',
  ].join('\n');

  private async generate(onChunk: (text: string) => void, config: PageConfig): Promise<string> {
    if (!this.model) return '';
    const r = await this.generateWithContinuation(onChunk, config);
    if (r.rounds > 0) {
      this.onNotice?.({ kind: 'continuation', rounds: r.rounds, truncated: r.truncated });
    }
    return r.content;
  }

  /**
   * 分节生成：按确定性节表逐节生成（串行），每节独立获得输出预算与数据切片，
   * 并自动继承断流续写能力。任一节为空则整页判失败（返回 ''，交由降级路径）。
   */
  private async generateSectioned(onChunk: (text: string) => void, sections: PageConfig[]): Promise<string> {
    if (!this.model || sections.length === 0) return '';

    const parts: string[] = [];
    let continuedSections = 0;
    let truncated = false;
    for (let i = 0; i < sections.length; i++) {
      if (i > 0) onChunk('\n\n');
      const r = await this.generateWithContinuation(onChunk, sections[i]);
      if (r.content.trim().length === 0) return '';
      parts.push(r.content);
      if (r.rounds > 0) continuedSections++;
      if (r.truncated) truncated = true;
    }
    if (sections.length > 1) {
      this.onNotice?.({ kind: 'sections', sections: sections.length, continuedSections, truncated });
    }
    return assembleSections(parts);
  }

  /** 单次生成 + 断流续写循环；返回内容与续写统计 */
  private async generateWithContinuation(
    onChunk: (text: string) => void,
    config: PageConfig,
  ): Promise<GenerationOutcome> {
    const outcome = await this.streamOnce(onChunk, config);

    // content 为空时回退用 reasoning（思考模型未关闭思考的情况）：无法安全续写，直接返回
    if (outcome.text.trim().length === 0 && outcome.reasoning.trim().length > 0) {
      return { content: outcome.reasoning, rounds: 0, truncated: false };
    }

    let text = outcome.text;
    let finish = outcome.finish;
    let rounds = 0;
    while (isAbnormalFinish(finish) && text.trim().length > 0 && rounds < WIKI_MAX_CONTINUATIONS) {
      const cut = findSafeCut(text);
      if (cut === null) break;

      onChunk('\n\n[wiki] 输出中断，自动续写…\n\n');
      let more: StreamOutcome;
      try {
        more = await this.streamOnce(onChunk, config, cut.kept);
      } catch {
        break; // 续写调用失败：保留已生成的安全前缀，交由闸门裁决
      }
      finish = more.finish;
      const segment = sanitizeWikiOutput(more.text);
      if (segment.length === 0) break;
      text = cut.kept.trimEnd() + '\n\n' + segment;
      rounds++;
    }

    return { content: text, rounds, truncated: isAbnormalFinish(finish) };
  }

  /**
   * 单轮流式生成。携带 prefix 时以 messages 形式发起续写：
   * 原始页面数据 + 已生成的安全前缀 + 续写指令。
   */
  private async streamOnce(
    onChunk: (text: string) => void,
    config: PageConfig,
    prefix?: string,
  ): Promise<StreamOutcome> {
    if (!this.model) return { text: '', reasoning: '', finish: 'error' };

    const system = WikiPageGenerator.ANTI_HALLUCINATION + '\n\n' + config.systemPrompt;
    // 思考模型（如 Qwen3/DeepSeek-v4）默认把内容输出到 reasoning 字段，content 为空。
    // 尝试关闭思考；若 provider 不支持则透传忽略。
    const providerOptions = {
      openai: { thinking: { type: 'disabled' } },
      ollama: { think: false },
    };
    const maxOutputTokens = config.maxOutputTokens ?? this.settings?.maxOutputTokens;
    // 超时独立计时（AbortSignal.timeout 不可复用，每次请求新建）
    const abortSignal = this.settings?.timeoutMs
      ? AbortSignal.timeout(this.settings.timeoutMs)
      : undefined;

    const result = prefix
      ? streamText({
          model: this.model,
          system,
          messages: [
            { role: 'user', content: config.userPrompt },
            { role: 'assistant', content: prefix },
            { role: 'user', content: CONTINUE_INSTRUCTION },
          ],
          maxOutputTokens,
          abortSignal,
          providerOptions,
        })
      : streamText({
          model: this.model,
          system,
          prompt: config.userPrompt,
          maxOutputTokens,
          abortSignal,
          providerOptions,
        });

    // 用 fullStream 收集 text 与 reasoning 两类 delta。
    // 思考模型在关闭思考失败时，实际内容会出现在 reasoning 里。
    let text = '';
    let reasoning = '';
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        text += part.text;
        onChunk(part.text);
      } else if (part.type === 'reasoning-delta') {
        reasoning += part.text;
      }
    }

    return { text, reasoning, finish: await result.finishReason };
  }
}
