import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type {
  OverviewContext,
  ArchitectureContext,
  DataFlowContext,
  ModulesContext,
  ApiContext,
  BusinessContext,
  DesignDecisionsContext,
  GlossaryContext,
  OnboardingContext,
  TroubleshootingContext,
} from './types.js';

interface PageConfig {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
}

export class WikiPageGenerator {
  private model: ReturnType<ReturnType<typeof createOpenAI>> | null;

  constructor(modelName?: string, baseURL?: string, apiKey?: string) {
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

  async generateOverview(ctx: OverviewContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据项目数据生成完整的项目概述页面（Markdown格式）。

要求：
- 用中文撰写
- 第一段用2-3句话说明项目是什么、解决什么问题
- 然后用自然语言描述项目的核心设计思路（不要列举符号名）
- 包含"技术栈"章节，用表格列出关键技术及用途
- 包含"项目结构"章节，简要描述源代码目录组织方式
- 包含"入口文件"章节，列出主要入口点及其作用
- 不要列举符号表，不要重复符号名
- 总长度800-1200字`,
      userPrompt: JSON.stringify({
        projectType: ctx.projectType,
        hasTypeScript: ctx.hasTypeScript,
        fileCount: ctx.fileCount,
        techStack: ctx.techStack,
        sourceDirs: ctx.sourceDirs,
        entryFiles: ctx.entryFiles.map(f => f.path),
        topSymbols: ctx.topSymbols
          .filter((s, i, a) => a.findIndex(t => t.name === s.name) === i)
          .slice(0, 10)
          .map(s => `${s.name}(${s.type})`),
      }, null, 2),
      maxOutputTokens: 4000,
    });
  }

  async generateArchitecture(ctx: ArchitectureContext, onChunk: (text: string) => void): Promise<string> {
    const modules = ctx.modules.map(m => ({
      name: m.name,
      symbolCount: m.symbols.length,
      topSymbols: m.symbols
        .filter((s, i, a) => a.findIndex(t => t.name === s.name) === i)
        .slice(0, 5)
        .map(s => s.name),
      dependsOn: [...new Set(m.outgoingRelations.map(r => r.target))].slice(0, 5),
      usedBy: [...new Set(m.incomingRelations.map(r => r.source))].slice(0, 5),
    }));
    const relations = ctx.interModuleRelations
      .filter((r, i, a) => a.findIndex(t => t.source === r.source && t.target === r.target) === i)
      .slice(0, 30);

    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据模块和依赖数据生成完整的架构文档页面（Markdown格式）。

要求：
- 用中文撰写
- 开头用2-3段自然语言描述整体架构设计思路：系统如何分层、各层职责、层间如何协作
- 包含"架构图"章节，用 Mermaid graph TD 展示模块间的依赖关系（节点用模块名，边表示依赖方向）
- 包含"核心模块"章节，对每个模块用一段话描述其职责（不要列举符号）
- 包含"模块依赖"章节，简要描述关键依赖关系
- 不要列举所有符号名，不要输出代码片段
- Mermaid图中的节点名必须与实际模块名一致
- 总长度1000-1500字`,
      userPrompt: JSON.stringify({ modules, relations }, null, 2),
      maxOutputTokens: 4000,
    });
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
      systemPrompt: `你是一个代码文档专家。请根据执行序列数据生成完整的数据流文档页面（Markdown格式）。

要求：
- 用中文撰写
- 开头用1-2段描述项目的核心数据流走向
- 对每条执行序列，包含：
  - 用一段话描述完整流程（从入口到终点）
  - 用 Mermaid sequenceDiagram 展示调用序列（必须使用 sequenceDiagram 语法）
  - 在图中用 participant 声明所有参与者
  - 用 ->> 表示每个调用步骤
  - 用 Note over 标注关键数据转换节点
- 每个调用步骤标注源文件位置（文件名:行号）
- 不要输出原始代码片段
- 总长度800-1200字`,
      userPrompt: JSON.stringify({ sequences }, null, 2),
      maxOutputTokens: 4000,
    });
  }

  async generateModules(ctx: ModulesContext, onChunk: (text: string) => void): Promise<string> {
    const modules = ctx.modules.map(m => ({
      name: m.name,
      files: m.files.slice(0, 10),
      topSymbols: m.symbols
        .filter((s, i, a) => a.findIndex(t => t.name === s.name) === i)
        .slice(0, 5)
        .map(s => s.name),
      fileSymbols: m.fileSymbols.map(fs => ({
        file: fs.file,
        symbols: fs.symbols.map(s => `${s.name}(${s.type})`),
      })),
      dependsOn: [...new Set(m.outgoingRelations.map(r => r.target))].slice(0, 5),
      usedBy: [...new Set(m.incomingRelations.map(r => r.source))].slice(0, 5),
    }));

    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据模块数据生成完整的模块文档页面（Markdown格式）。

要求：
- 用中文撰写
- 开头用一段话概述项目的模块组织方式
- 对每个模块，包含：
  - "做什么"：该模块承担的职责
  - "为什么存在"：设计这个模块的原因
  - "怎么交互"：与其他模块的协作方式
  - 文件结构表：用表格列出该模块的文件及其关键符号和职责（文件名 | 关键符号 | 职责）
- 不要输出代码片段
- 按模块重要性排序
- 总长度1000-1500字`,
      userPrompt: JSON.stringify({ modules }, null, 2),
      maxOutputTokens: 4000,
    });
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

    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据API数据生成完整的API参考文档页面（Markdown格式）。

要求：
- 用中文撰写
- 开头用一段话概述项目的对外接口
- CLI命令用表格列出（命令名 | 说明 | 源文件位置）
- 导出函数用表格列出（函数名 | 源文件:行号），按功能分组，不要全部平铺
- 如果有框架相关的节点（如Controller、Router），用表格列出
- 每个表格前用一句话说明该分类的作用
- 总长度600-1000字`,
      userPrompt: JSON.stringify({
        commands: commands.map(c => ({ name: c.name, file: `${c.filePath}:${c.startLine}` })),
        exportedFunctions: functions.map(f => ({ name: f.name, file: `${f.filePath}:${f.startLine}` })),
        frameworkNodes: nodes.map(n => ({ name: n.name, type: n.type, file: n.filePath })),
      }, null, 2),
      maxOutputTokens: 4000,
    });
  }

  async generateBusiness(ctx: BusinessContext, onChunk: (text: string) => void): Promise<string> {
    const services = ctx.services.map(s => ({
      name: s.name,
      methods: s.methods
        .filter((m, i, a) => a.findIndex(t => t.name === m.name) === i)
        .slice(0, 8)
        .map(m => m.name),
      dependencies: [...new Set(s.dependencies.map(d => d.target))].slice(0, 5),
    }));

    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据业务服务数据生成完整的业务逻辑文档页面（Markdown格式）。

要求：
- 用中文撰写
- 开头用一段话概述项目的业务架构和服务协作方式
- 对每个服务，用一段话描述其核心职责和关键方法（不要列举所有方法签名）
- 描述服务之间的协作关系（谁依赖谁、如何配合）
- 不要输出原始代码片段
- 总长度800-1200字`,
      userPrompt: JSON.stringify({ services }, null, 2),
      maxOutputTokens: 4000,
    });
  }

  async generateDesignDecisions(ctx: DesignDecisionsContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据设计模式和技术选型数据生成完整的设计决策文档页面（Markdown格式）。

要求：
- 用中文撰写
- 开头用一段话概述项目的设计哲学
- 对每个检测到的设计模式，说明：模式名称、在项目中的具体应用、带来的好处、相关文件
- 对每个技术选型，说明：技术名称、选型理由、在项目中的角色
- 用自然语言分析，不要列举符号
- 总长度600-1000字`,
      userPrompt: JSON.stringify({
        patterns: ctx.patterns,
        techChoices: ctx.techChoices,
      }, null, 2),
      maxOutputTokens: 4000,
    });
  }

  async generateOnboarding(ctx: OnboardingContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据项目数据生成完整的上手指南页面（Markdown格式）。

要求：
- 用中文撰写
- 包含"环境准备"章节：根据提供的Node.js版本要求和包管理器列出所需环境
- 包含"安装步骤"章节：使用提供的包管理器（不要用npm/yarn/pnpm以外的命令）
- 包含"项目初始化"章节：列出实际的CLI命令（从提供的命令列表中获取）
- 包含"基本使用"章节：列出核心命令和用法
- 包含"项目结构概览"章节：简要描述源代码目录含义
- 只描述基于数据可以确定的内容，不要编造具体命令参数
- 总长度600-1000字`,
      userPrompt: JSON.stringify({
        projectType: ctx.projectType,
        hasTypeScript: ctx.hasTypeScript,
        techStack: ctx.techStack,
        entryFiles: ctx.entryFiles.map(f => f.path),
        sourceDirs: ctx.sourceDirs,
        packageManager: ctx.packageManager,
        nodeVersion: ctx.nodeVersion,
        cliCommands: ctx.cliCommands,
      }, null, 2),
      maxOutputTokens: 4000,
    });
  }

  async generateTroubleshooting(ctx: TroubleshootingContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据项目数据生成完整的故障排除页面（Markdown格式）。

要求：
- 用中文撰写
- 包含"常见问题"章节：基于项目类型和技术栈，列出可能的常见问题和解决方案
- 包含"构建问题"章节：列出可能的构建相关问题和解决方案
- 包含"运行时问题"章节：列出可能的运行时问题和解决方案
- 每个问题用"问题描述 → 原因分析 → 解决方案"的格式
- 只描述与项目技术栈相关的问题，不要编造不相关的场景
- 总长度600-1000字`,
      userPrompt: JSON.stringify({
        projectType: ctx.projectType,
        techStack: ctx.techStack,
        moduleCount: ctx.modules.length,
        moduleNames: ctx.modules.map(m => m.name).slice(0, 10),
      }, null, 2),
      maxOutputTokens: 4000,
    });
  }

  async generateGlossary(ctx: GlossaryContext, onChunk: (text: string) => void): Promise<string> {
    const symbols = ctx.symbols.slice(0, 40);

    return this.generate(onChunk, {
      systemPrompt: `你是一个代码文档专家。请根据符号数据生成"关键概念"参考页面（Markdown格式）。

要求：
- 用中文撰写
- 开头用一段话说明这个页面列出了项目的关键类型和函数
- 按功能分组（如：核心服务、数据模型、工具函数、CLI命令等），不要按字母排序
- 每个符号用表格列出（名称 | 类型 | 所属文件 | 简要说明）
- "简要说明"列需要你根据符号名和类型推断其作用
- 只列出重要的顶层符号，忽略 import/export 类型
- 总长度600-1000字`,
      userPrompt: JSON.stringify({
        symbols: symbols.map(s => ({ name: s.name, type: s.type, file: s.filePath })),
      }, null, 2),
      maxOutputTokens: 4000,
    });
  }

  // --- Core generation ---

  private static readonly ANTI_HALLUCINATION = [
    '绝对规则：只能基于提供的JSON数据描述项目，严禁编造不存在的模块、服务、功能或业务场景。',
    '如果数据不足以描述某个方面，直接省略或注明"信息不足"，不要猜测或补充。',
    '不要将测试代码（tests/目录下的文件）当作项目功能来描述。',
  ].join('\n');

  private async generate(onChunk: (text: string) => void, config: PageConfig): Promise<string> {
    if (!this.model) return '';

    const result = streamText({
      model: this.model,
      system: WikiPageGenerator.ANTI_HALLUCINATION + '\n\n' + config.systemPrompt,
      prompt: config.userPrompt,
      maxOutputTokens: config.maxOutputTokens,
    });

    let text = '';
    for await (const chunk of result.textStream) {
      text += chunk;
      onChunk(chunk);
    }

    return text;
  }
}
