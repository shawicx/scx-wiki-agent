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
      systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的项目概述页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 第一段用3-5句话说明项目是什么、解决什么问题、面向什么场景
- "核心设计思路"章节：用2-3段自然语言描述项目的架构理念、关键设计决策、技术选型理由（结合技术栈）
- "技术栈"章节：用表格列出每项技术及用途，并在表格后用1-2段分析技术选型的合理性
- "项目结构"章节：逐一描述每个源代码目录的职责（至少覆盖所有 sourceDirs），说明目录间的关系
- "入口文件"章节：列出每个入口点，说明其启动流程和职责
- "核心组件"章节：基于 topSymbols 数据，用一段话介绍项目中复杂度最高/调用最频繁的核心组件
- 不要只列举符号名，要解释每个组件的用途和设计意图
- 内容要充实，宁可详细也不要遗漏重要信息`,
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
          .map(s => ({
            name: s.name,
            type: s.type,
            docstring: s.docstring,
            complexity: s.complexity,
          })),
      }, null, 2),
      maxOutputTokens: 8000,
    });
  }

  async generateArchitecture(ctx: ArchitectureContext, onChunk: (text: string) => void): Promise<string> {
    const modules = ctx.modules.map(m => ({
      name: m.name,
      symbolCount: m.symbols.length,
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
    }));
    const relations = ctx.interModuleRelations
      .filter((r, i, a) => a.findIndex(t => t.source === r.source && t.target === r.target) === i)
      .slice(0, 30);

    return this.generate(onChunk, {
      systemPrompt: `你是一个资深软件架构师。请根据模块和依赖数据生成详尽、专业的架构文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "整体架构设计思路"：用3-4段自然语言深入分析系统的分层方式、各层职责、层间协作机制、架构风格。结合 layers 数据说明每个包属于哪一层及原因
- "架构图"章节：用 Mermaid graph TD 展示完整的模块依赖关系图（节点用模块名，边表示依赖方向）
- "核心模块详解"章节：对每个模块，用1-2段详细描述其职责、核心符号的作用（引用 docstring 和 signature）、设计意图。如果模块有 topSymbols，必须逐一说明其用途
- "模块依赖分析"章节：基于 boundaries 数据，用表格列出每个依赖边及其调用次数，并用文字分析关键依赖路径
- "横切关注点"章节：分析错误处理、日志、配置管理等横切机制
- Mermaid图中的节点名必须与实际模块名一致
- 内容要充实，每个模块都要有实质性的描述，不要只写套话`,
      userPrompt: JSON.stringify({
        modules,
        relations,
        layers: ctx.layers,
        boundaries: ctx.boundaries,
        clusters: ctx.clusters,
      }, null, 2),
      maxOutputTokens: 8000,
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
      systemPrompt: `你是一个资深代码文档专家。请根据执行序列数据生成详尽、专业的数据流文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "核心数据流概览"：用2-3段描述项目从入口到完成的核心数据流走向，说明主要阶段和数据如何在模块间流转
- 对每条执行序列，包含：
  - "流程描述"：用2-3段详细描述完整流程（从入口到终点），说明每一步做什么、为什么这样调用、数据如何转换
  - "序列图"：用 Mermaid sequenceDiagram 展示调用序列（必须使用 sequenceDiagram 语法，严禁 flowchart）
    - 在图中用 participant 声明所有参与者
    - 用 ->> 表示每个调用步骤
    - 用 Note over 标注关键数据转换节点
  - 每个调用步骤标注源文件位置（文件名:行号）
- 不要输出原始代码片段，但可以引用关键函数签名
- 内容要充实，每条序列都要有完整的流程解析`,
      userPrompt: JSON.stringify({ sequences }, null, 2),
      maxOutputTokens: 8000,
    });
  }

  async generateModules(ctx: ModulesContext, onChunk: (text: string) => void): Promise<string> {
    const modules = ctx.modules.map(m => ({
      name: m.name,
      files: m.files.slice(0, 10),
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
    }));

    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据模块数据生成详尽、专业的模块文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用一段话概述项目的模块组织方式和设计原则
- 对每个模块，包含：
  - "职责"：该模块承担的职责（基于符号的 docstring 和 signature 详细说明）
  - "设计意图"：设计这个模块的原因，它在整体架构中的角色
  - "交互方式"：与其他模块的协作方式（基于 dependsOn 和 usedBy）
  - "文件结构"：用表格列出该模块的文件及其关键符号和职责（文件名 | 关键符号 | 职责）
  - "核心符号"：对每个 topSymbol，用1-2句说明其用途（基于 docstring/signature）
- 不要输出原始代码片段，但要引用关键函数的签名
- 按模块重要性排序
- 内容要充实，每个模块都要有实质性的深入描述`,
      userPrompt: JSON.stringify({ modules }, null, 2),
      maxOutputTokens: 8000,
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
      systemPrompt: `你是一个资深代码文档专家。请根据API数据生成详尽、专业的API参考文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用1-2段概述项目的对外接口设计理念和主要交互方式
- "CLI 命令"章节：用表格列出（命令名 | 说明 | 源文件位置），并在表格后逐个说明每个命令的功能、参数、使用场景（基于 description/docstring）
- "导出函数"章节：用表格列出（函数名 | 签名 | 说明 | 源文件:行号），按功能分组。对每个重要函数，补充1-2句说明其用途（基于 docstring/signature）
- 如果有框架相关的节点（如Controller、Router），用表格列出并说明
- 每个表格前用一段话说明该分类的作用和设计
- 内容要充实，不要只罗列，要解释每个 API 的用途`,
      userPrompt: JSON.stringify({
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
      }, null, 2),
      maxOutputTokens: 8000,
    });
  }

  async generateBusiness(ctx: BusinessContext, onChunk: (text: string) => void): Promise<string> {
    const services = ctx.services.map(s => ({
      name: s.name,
      filePath: s.filePath,
      methods: s.methods
        .filter((m, i, a) => a.findIndex(t => t.name === m.name) === i)
        .slice(0, 10)
        .map(m => ({
          name: m.name,
          visibility: m.visibility,
          docstring: m.docstring,
        })),
      dependencies: [...new Set(s.dependencies.map(d => d.target))].slice(0, 5),
      codeSnippet: s.codeSnippet,
    }));

    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据业务服务数据生成详尽、专业的业务逻辑文档页面（Markdown格式）。

重要：只描述数据中实际存在的服务和方法，严禁编造。如果一个服务只有一个类，就如实描述它是单个类（不要拆分成"两个服务"）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "业务架构概述"：用2-3段概述项目的业务架构、服务/类的组织方式、协作模式
- 对每个服务/类，包含：
  - "职责"：该类承担的核心职责（基于 codeSnippet 和方法的 docstring）
  - "关键方法"：用表格列出方法（方法名 | 可见性 | 说明），引用每个方法的 docstring
  - "设计意图"：这个类为什么这样设计、在架构中的角色
- "服务协作"章节：分析服务/类之间的依赖关系和协作方式
- 如实反映数据：如果一个类同时有 register/getClient 等方法，说明它们是同一个类的不同方法，不要拆分成多个服务
- 内容要充实，每个服务/类都要有实质性描述`,
      userPrompt: JSON.stringify({ services }, null, 2),
      maxOutputTokens: 8000,
    });
  }

  async generateDesignDecisions(ctx: DesignDecisionsContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深软件架构师。请根据设计模式和技术选型数据生成详尽、专业的设计决策文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "设计哲学"：用2-3段概述项目的设计哲学和核心设计原则
- "设计模式分析"：对每个检测到的设计模式，详细说明：
  - 模式名称和定义
  - 在项目中的具体应用（引用相关文件和类名）
  - 解决了什么问题、带来的好处
  - 相关文件路径
- "技术选型"：对每项技术，详细说明：
  - 技术名称和版本
  - 选型理由（为什么选它而非替代品）
  - 在项目中的具体角色
  - 与其他技术如何配合
- 用自然语言深入分析，不要只列举
- 内容要充实，每个模式和选型都要有充分的论证`,
      userPrompt: JSON.stringify({
        patterns: ctx.patterns,
        techChoices: ctx.techChoices,
      }, null, 2),
      maxOutputTokens: 8000,
    });
  }

  async generateOnboarding(ctx: OnboardingContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的上手指南页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "环境准备"章节：详细列出所需环境（Node.js版本、包管理器、系统要求），说明每个依赖的作用
- "安装步骤"章节：给出完整的安装流程，使用提供的包管理器，包含每步的预期输出和验证方法
- "项目初始化"章节：列出实际的CLI命令（从提供的命令列表中获取），说明每个命令的作用和参数
- "基本使用"章节：详细列出核心命令和用法，用代码块展示命令示例，说明典型工作流（如 scan → build 的完整流程）
- "项目结构概览"章节：逐一描述每个源代码目录的含义和作用
- "开发指南"章节：说明如何构建、如何运行测试、如何开发调试
- 只描述基于数据可以确定的内容，不要编造具体命令参数
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
      }, null, 2),
      maxOutputTokens: 8000,
    });
  }

  async generateTroubleshooting(ctx: TroubleshootingContext, onChunk: (text: string) => void): Promise<string> {
    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的故障排除页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "环境问题"章节：详细列出与项目技术栈相关的环境配置问题、版本冲突、依赖安装问题及解决方案
- "构建问题"章节：详细列出可能的构建失败场景（如 TypeScript 编译错误、打包问题、ESM/CJS 兼容）及解决方案
- "运行时问题"章节：详细列出可能的运行时问题（如模块解析、路径问题、权限问题、外部依赖缺失如 codebase-memory-mcp 未安装）及解决方案
- "调试技巧"章节：列出针对该项目的调试方法（如 watch 构建、单文件测试调试、如何查看日志）
- 每个问题用"问题描述 → 原因分析 → 解决方案"的详细格式，解决方案要具体可操作（给出实际命令）
- 只描述与项目技术栈相关的问题，不要编造不相关的场景
- 内容要充实，要覆盖开发者实际会遇到的问题`,
      userPrompt: JSON.stringify({
        projectType: ctx.projectType,
        techStack: ctx.techStack,
        moduleCount: ctx.modules.length,
        moduleNames: ctx.modules.map(m => m.name).slice(0, 10),
      }, null, 2),
      maxOutputTokens: 8000,
    });
  }

  async generateGlossary(ctx: GlossaryContext, onChunk: (text: string) => void): Promise<string> {
    const symbols = ctx.symbols.slice(0, 40);

    return this.generate(onChunk, {
      systemPrompt: `你是一个资深代码文档专家。请根据符号数据生成详尽、专业的"关键概念"参考页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用1-2段说明这个页面列出了项目的关键类型和函数，及其文档价值
- 按功能分组（如：核心服务、数据模型、工具函数、CLI命令、MCP客户端等），不要按字母排序。分组要基于符号的实际所属模块
- 每组用表格列出（名称 | 类型 | 签名 | 说明 | 所属文件）
- "说明"列：基于提供的 docstring（如果有）写出准确的说明；docstring 为空时根据符号名和类型推断，但要标注是推断
- "签名"列：填入提供的 signature（如有）
- 对每个分组，用一段话说明该组符号的整体职责
- 内容要充实，要让读者能通过此页面快速理解项目的核心概念`,
      userPrompt: JSON.stringify({
        symbols: symbols.map(s => ({
          name: s.name,
          type: s.type,
          file: s.filePath,
          docstring: s.docstring,
          signature: s.signature,
          complexity: s.complexity,
        })),
      }, null, 2),
      maxOutputTokens: 8000,
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
      // 思考模型（如 Qwen3/DeepSeek-v4）默认把内容输出到 reasoning 字段，content 为空。
      // 尝试关闭思考；若 provider 不支持则透传忽略。
      providerOptions: {
        openai: { thinking: { type: 'disabled' } },
        ollama: { think: false },
      },
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

    // content 为空时回退用 reasoning（思考模型未关闭思考的情况）
    if (text.trim().length === 0 && reasoning.trim().length > 0) {
      return reasoning;
    }

    return text;
  }
}
