import type {
  OnboardingContext,
  TroubleshootingContext,
  TopicContext,
  ChapterPageContext,
  TestingContext,
  ConstraintsContext,
  EnvironmentContext,
  TechStackContext,
  ConventionsContext,
  CliContext,
} from '../types.js';
import { generate, intentToPrompt } from './shared.js';
import type { GeneratorDeps } from './shared.js';

export async function generateOnboarding(deps: GeneratorDeps, ctx: OnboardingContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的上手指南页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "环境准备"章节：详细列出所需环境（Node.js版本、包管理器、系统要求），说明每个依赖的作用
- "安装步骤"章节：给出完整的安装流程，使用提供的包管理器，包含每步的预期输出和验证方法
- "项目初始化"章节：列出实际的CLI命令（从提供的命令列表中获取），说明每个命令的作用、参数（options 数据直接引用）与使用场景
- "基本使用"章节：详细列出核心命令和用法，用代码块展示命令示例，说明典型工作流（如 scan → build 的完整流程）；构建/测试等实际命令必须从 scripts 数据直接引用，严禁标「待确认」
- "环境变量"章节：如提供 envVars 数据，用表格列出（变量名 | 敏感 | 生产引用），production 引用必须使用 filePaths 中完整文件路径；未提供则不设该章节（不要标注待确认）
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

export async function generateTroubleshooting(deps: GeneratorDeps, ctx: TroubleshootingContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的故障排除页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "环境问题"章节：详细列出与项目技术栈相关的环境配置问题、版本冲突、依赖安装问题及解决方案（nodeVersion/envVars/packageManager 数据直接引用）；envVars 的 filePaths 是生产源码锚点，必须原样保留
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

export async function generateTopic(deps: GeneratorDeps, ctx: TopicContext, onChunk: (text: string) => void): Promise<string> {
  // evidence-ID 试点契约：数据带证据索引时要求 [E#] 引用，成稿由工具确定性解析剥离
  const evidenceContract = (ctx.evidenceIndex && ctx.evidenceIndex.length > 0)
    ? `
证据引用契约（evidence-ID 试点）：
- 数据中的 evidenceIndex 提供带编号的证据清单（E1、E2…，含锚点）
- 凡事实性声明（符号职责/调用关系/边界/动机引用），在该句末尾标注支撑证据编号，如 [E3]，可多选 [E1][E5]
- 无任何证据编号支撑的动机/评价性表述必须标注「推断」（R7）
- [E#] 编号必须来自 evidenceIndex，严禁编造不存在的编号`
    : '';
  return generate(deps, onChunk, {
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
- 严禁编造数据外的方法、参数或行为（R1/R3）${evidenceContract}`,
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
      ...(ctx.evidenceIndex && ctx.evidenceIndex.length > 0
        ? { evidenceIndex: ctx.evidenceIndex.map(e => ({ id: e.id, kind: e.kind, name: e.name, anchor: e.anchor })) }
        : {}),
    }, null, 2),
  });
}

export async function generateChapterPage(deps: GeneratorDeps, ctx: ChapterPageContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
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

export async function generateTesting(deps: GeneratorDeps, ctx: TestingContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据测试配置探测结果生成详尽、专业的测试文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "测试体系概览"：用表格列出框架/配置文件/测试目录/夹具目录的事实
- "运行方式"：基于 runCommand 给出完整命令，说明其做了什么、预期产出
- "测试专用证据"：如提供 testOnlyEnvVars/testOnlyConstants/testOnlyDeps，分表列出并保留测试文件锚点；这些内容只属于测试环境，禁止写成生产运行时配置或生产技术栈
- "测试策略解读"：基于检测到的事实（框架特性、目录组织、夹具位置）用1-2段分析项目的测试策略与覆盖重点
- 未检测到的项（framework 为 null 等）必须诚实标注「未检测到」，严禁编造框架特性、用例数量或覆盖率数字（R5）；未探测到的配置项（configPath/coverage 阈值等）直接省略或用一句话汇总缺口，禁止逐项标「待确认」；测试框架的通用用法（单文件运行、名称过滤、watch 模式）属公共常识，无需标注
- 内容要充实，让读者知道如何运行测试、测试覆盖了什么`,
    userPrompt: JSON.stringify({
      ...ctx,
      testOnlyConstants: ctx.testOnlyConstants.map(c => ({
        ...c,
        anchor: c.line ? `${c.filePath}:${c.line}` : c.filePath,
      })),
    }, null, 2),
  });
}

export async function generateConstraints(deps: GeneratorDeps, ctx: ConstraintsContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据限制常量与复杂度数据生成详尽、专业的约束文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "限制常量"：用表格列出（常量 | 值 | 源文件:行号），并逐个解读该常量防止的是什么失控场景（超时/内存/规模上限等）；如 intent 携带 const-comment（常量的源码注释），解读必须优先引用注释原文并携带 file:line 锚点（R7）——这是作者亲写的「为什么有这个限制」
- "复杂度热点"：用表格列出（函数 | 源文件 | 复杂度 | 循环深度），对复杂度最高的前几个函数深入分析潜在风险与重构方向
- "已知边界"：总结上述数据反映出的项目边界（哪些地方最脆弱、改动代价在哪）
- 无数据的分类诚实标注「未检测到」，严禁编造阈值或性能数字（R5）
- 每条事实声明必须带 file 锚点（R1）
- 内容要充实，让读者理解项目的硬边界与维护成本所在`,
    userPrompt: JSON.stringify({ ...ctx }, null, 2),
  });
}

export async function generateEnvironment(deps: GeneratorDeps, ctx: EnvironmentContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据运行态探测数据生成详尽、专业的环境文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- "项目信息"章节：用表格列出包名/版本/运行时（ESM/CJS）/Node 版本/包管理器，并用一段话说明运行时与包管理器的实际影响（如 ESM 对 import 的要求、包管理器对应的安装命令前缀）
- "脚本命令"章节：用表格列出 scripts 的每个命令与脚本内容，逐个解释其行为与预期产出
- "环境变量"章节：如提供 envVars，用表格列出（变量名 | 敏感 | 生产引用），production 引用必须使用 filePaths 中完整文件路径；用途说明只能基于变量名与引用位置谨慎概括，未提供用途证据时写「见生产引用」，禁止编造；未提供则不设该章节
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

export async function generateTechStack(deps: GeneratorDeps, ctx: TechStackContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据依赖分析数据生成详尽、专业的技术栈文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用1-2段概述项目的技术选型全貌（运行时/构建工具/包管理器/核心框架）
- "核心依赖"章节：用表格列出（依赖 | 版本 | 首个 import 点），按职责分组（框架/UI/状态/工具等），对每组用1-2段说明选型理由与协作关系（基于依赖职责与 import 分布，不得编造调用细节）；如提供 intent（依赖相关提交主题 git-commit 证据），选型/引入动机必须优先引用提交主题并携带 commit 哈希+日期锚点（R7），无提交佐证的动机分析标注「推断」
- "开发依赖"章节：用表格列出（依赖 | 版本 | 首个 import 点），说明各自的开发场景用途
- "测试专用依赖"章节：如 testDeps 非空，用表格列出（依赖 | 版本 | 首个测试 import 点），明确它们不属于生产运行时技术栈
- "Rust 依赖栈"章节：如 rustDeps 非空（Cargo.toml），用表格列出（crate | 版本 | 使用），used=true 的说明其在 Rust 侧的职责（基于 crate 名称与常识职责，不得编造调用细节），used=false 的如实标「未检出引用」
- "声明未用依赖"章节：仅当 unusedDeps 非空时输出表格，且必须在其前写明：「下表由源码 import 扫描推导（覆盖 .ts/.js/.vue/.css），存在动态加载、字符串引用等扫描盲区，清理前请人工复核」——严禁断言这些依赖一定无用
- 每条 import 点锚点必须原样保留（R1/R3）
- 内容要充实，让读者理解技术栈全貌与升级影响面`,
    userPrompt: JSON.stringify({
      coreDeps: ctx.coreDeps,
      devDeps: ctx.devDeps,
      testDeps: ctx.testDeps,
      unusedDeps: ctx.unusedDeps,
      ...(ctx.rustDeps?.length ? { rustDeps: ctx.rustDeps } : {}),
      runtime: ctx.runtime,
      buildTool: ctx.buildTool,
      packageManager: ctx.packageManager,
      intent: intentToPrompt(ctx.intent),
    }, null, 2),
  });
}

export async function generateConventions(deps: GeneratorDeps, ctx: ConventionsContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
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

export async function generateCliPage(deps: GeneratorDeps, ctx: CliContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
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
