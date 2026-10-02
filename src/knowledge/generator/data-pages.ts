import type {
  OverviewContext,
  DataFlowContext,
  DataValueShape,
  ApiContext,
  DecisionsContext,
} from '../types.js';
import { generate, intentToPrompt } from './shared.js';
import type { GeneratorDeps } from './shared.js';

export async function generateOverview(deps: GeneratorDeps, ctx: OverviewContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据项目数据生成详尽、专业的项目概述页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 第一段用3-5句话说明项目是什么、解决什么问题、面向什么场景；如提供 readmeExcerpt（仓库 README 自述），须吸收其项目定位与功能描述（冲突处以代码证据为准并标「待确认」）
- 如 languages 显示多语言（如 TypeScript + Rust），必须在概述中说明各语言的职责域（前端/后端划分），不得遗漏任一语言的存在；各语言的 exampleFiles 是扫描清单内的真实文件，职责描述必须锚定这些完整路径，严禁以「未提供该语言文件路径」为由标「待确认」
- 如提供 docsFiles，在概述末尾列出延伸阅读清单（相对路径原样保留）
- "核心设计思路"章节：用2-3段自然语言描述项目的架构理念、关键设计决策、技术选型理由（结合技术栈）；如提供 intent（意图证据：注释/提交/文档小节/测试行为），每条动机叙述必须引用其原文并携带证据锚点（file:line / commit 哈希+日期 / 文档路径#标题），无证据支撑的设计判断标注「推断」并写明依据（R7）
- "技术栈"章节：用表格列出每项技术及用途，并在表格后用1-2段分析技术选型的合理性；如提供 depUsage（依赖使用证据），用途陈述必须锚定其证据——usageKind=import 锚定 importFiles、test 锚定测试文件、script 锚定 scripts 命令；usageKind ≠ none 的依赖严禁标「待确认」或「声明未用」，仅 none 可标「声明未用」
- techStack 只包含生产代码 import 的依赖；depUsage.usageKind=test 的依赖只能说明为测试专用，不得写成生产运行时技术栈
- "项目结构"章节：逐一描述每个源代码目录的职责（至少覆盖所有 sourceDirs），说明目录间的关系，并引用 productionFileCount/testFileCount 区分生产与测试规模；多语言项目的 sourceDirs 含各语言的源码目录（如 src 与 src-tauri）
- "入口文件"章节：列出每个入口点，说明其启动流程和职责
- "核心组件"章节：基于 topSymbols 数据，用一段话介绍项目中复杂度最高/调用最频繁的核心组件
- 不要只列举符号名，要解释每个组件的用途和设计意图
- 内容要充实，宁可详细也不要遗漏重要信息`,
    userPrompt: JSON.stringify({
      projectType: ctx.projectType,
      hasTypeScript: ctx.hasTypeScript,
      fileCount: ctx.fileCount,
      productionFileCount: ctx.productionFileCount ?? ctx.fileCount,
      testFileCount: ctx.testFileCount ?? 0,
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

export async function generateDataFlow(deps: GeneratorDeps, ctx: DataFlowContext, onChunk: (text: string) => void): Promise<string> {
  // 执行路径只用于阶段排序与路径解释；页面主体是确定性数据形态证据
  const executionPaths = ctx.sequences.map(s => ({
    entry: s.entrySymbol,
    symbols: [...new Set(s.messages.flatMap(m => [m.from, m.to]))],
  }));
  const shapeAnchor = (file: string, line: number) => (line > 0 ? `${file}:${line}` : file);
  const shapes = (list: DataValueShape[]) => list.map(s => ({
    expression: s.expression,
    type: s.type,
    evidence: s.evidence,
    anchor: s.anchor,
  }));

  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据确定性「数据形态证据」生成数据流文档页（Markdown格式）。

数据来源（全部为工具确定性采集，禁止补充数据之外的结构）：
- stages：数据阶段（真实符号 + 输入/输出数据形态 + 证据类型）
- transitions：带数据证据的调用转换（调用实参 + 调用点 + callee 定义点）
- ioEvents：函数体内的 I/O 与外部边界事件（读/写文件、子进程、配置、env、终端输出）
- typeDefinitions：本地 interface/type/enum/class 定义摘录
- shapeCoverage：数据形态覆盖率

必须固定输出以下七个二级章节，顺序不得调整：
## 核心数据流概览
## 数据阶段表
## 阶段转换表
## 输入与输出边界
## 关键数据结构
## 错误与降级路径
## 证据局限

各节硬性要求：
- 核心数据流概览：2-3 段，说明数据从哪里进入、经过哪些阶段、最终写到哪里。只能引用 stages/ioEvents 中真实存在的符号与 file:line。
- 数据阶段表：表头必须为 | 阶段 | 输入形态 | 输出形态 | 转换依据 | 证据 |
  输入/输出形态只能来自 stages[].inputs/outputs（expression 与 type 同时存在时都要展示；无类型写「未检出类型」）；
  转换依据填写签名/调用实参/I-O 的实际内容；证据列填 evidence 类型。禁止根据函数名编造 schema。
- 阶段转换表：表头必须为 | From | To | 调用实参 | 调用点 | To 定义 |
  调用点用 transitions[].callSite（CALLS 边 r.line），To 定义用 transitions[].calleeDefinition（callee start_line），两者语义不同，严禁混用或互换。
- 输入与输出边界：表头必须为 | 类型 | 方向 | 数据介质 | 所属阶段 | 表达式 | 位置 |，逐条列出 ioEvents。
- 关键数据结构：用代码块原样引用 typeDefinitions[].text，并标注 file:line；未提供定义体的类型只写名称与引用位置。
- 错误与降级路径：只有数据中存在相应证据（如错误分支调用、I/O 失败处理）时才写；无证据时写「未检出错误路径证据」，禁止编造。
- 证据局限：如实转述 shapeCoverage（unknownStages/controlOnlyTransitions/approximatedBodies/低置信度边），说明哪些形态未知。

禁止事项（违反即不可用）：
- 禁止把调用链当数据转换：不要复述 calls.md 的完整边表；纯控制流细节链接到 calls.md。
- 禁止在 type 为 unknown/未检出时编造 object 字段或无中生有的数据结构。
- 禁止把文件路径字符串推断成完整文件内容结构（medium 只是路径表达式）。
- 禁止把 I/O 函数所在模块整体当作阶段：I/O 必须落到 ioEvents[].symbol。
- 低置信度（confidence < 0.8）的边不得作为唯一事实来源，须在证据局限中说明。
- 严禁使用 sequenceDiagram（R2 边表优于时序图）。
- 每条事实声明必须带 file:line 锚点（R1）。
- 页面固定写明：「完整控制流与调用可达性见 calls.md；本页只描述带数据形态证据的转换。」

用中文撰写，内容必须详尽完整，不要人为缩减篇幅。`,
    userPrompt: JSON.stringify({
      stages: ctx.stages.map(s => ({
        symbol: s.symbol,
        role: s.role,
        anchor: shapeAnchor(s.file, s.line),
        inputs: shapes(s.inputs),
        outputs: shapes(s.outputs),
        evidence: s.evidenceKinds,
        dataShapeKnown: s.dataShapeKnown,
      })),
      transitions: ctx.transitions.map(t => ({
        from: t.from,
        to: t.to,
        args: t.args.map(a => a.expression).filter((e): e is string => typeof e === 'string'),
        callSite: shapeAnchor(t.callFile, t.callLine),
        calleeDefinition: t.calleeDefinition,
        confidence: t.confidence,
      })),
      ioEvents: ctx.ioEvents.map(e => ({
        kind: e.kind,
        direction: e.direction,
        symbol: e.symbol,
        medium: e.medium,
        expression: e.expression,
        anchor: shapeAnchor(e.file, e.line),
      })),
      typeDefinitions: ctx.typeDefinitions.map(d => ({
        name: d.name,
        kind: d.kind,
        anchor: shapeAnchor(d.file, d.line),
        text: d.text,
      })),
      shapeCoverage: ctx.shapeCoverage,
      executionPaths,
      supplementalSymbols: ctx.supplementalSymbols ?? [],
    }, null, 2),
  });
}

export async function generateApi(deps: GeneratorDeps, ctx: ApiContext, onChunk: (text: string) => void): Promise<string> {
  const commands = ctx.commands
    .filter((c, i, a) => a.findIndex(t => t.name === c.name) === i);
  const functions = ctx.exportedFunctions
    .filter((f, i, a) => a.findIndex(t => t.name === f.name) === i)
    .slice(0, 20);
  const nodes = ctx.frameworkNodes
    .filter((n, i, a) => a.findIndex(t => t.name === n.name) === i)
    .slice(0, 10);
  const hasIpc = !!ctx.ipc && (ctx.ipc.commands.length > 0 || ctx.ipc.events.length > 0);

  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据API数据生成详尽、专业的API参考文档页面（Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 开头用1-2段概述项目的对外接口设计理念和主要交互方式
${hasIpc ? `
- "Tauri IPC 命令"章节（本项目 API 的主体，必须置前）：用表格列出（命令 | 前端调用点 | Rust 定义 | 状态），
  按功能分组并对每组说明用途与典型时序；rustDef 为空且无 rustMissSuspect 的命令标注「仅前端调用，Rust 侧未检出」，
  frontendCalls 为空且无 frontendMissSuspect 的标注「未被前端调用」——确属两侧不匹配是重要事实，禁止省略或补造；
  missSuspect 字段非空的条目（frontendCalls/rustDef 为空但源码存在引用）是正则扫描口径局限
  （多行调用/深嵌套泛型/动态名残余），必须标注「扫描口径局限」并附 suspect 引用点，禁止断言「未被调用/未检出」；
  最后注明扫描局限（invoke(变量) 动态命令名不在表内）
- "IPC 事件"章节：用表格列出（事件 | 前端监听点 | 发射点（前端/Rust）），说明事件驱动的交互模式；
  emits 为空但 emitMissSuspect 非空的事件同样标注「扫描口径局限」，禁止断言「无发射点」` : ''}
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
            ...(c.frontendMissSuspect?.length ? { frontendMissSuspect: c.frontendMissSuspect.map(r => `${r.file}:${r.line}`) } : {}),
            ...(c.rustMissSuspect?.length ? { rustMissSuspect: c.rustMissSuspect.map(r => `${r.file}:${r.line}`) } : {}),
          })),
          events: ctx.ipc!.events.map(e => ({
            name: e.name,
            listeners: e.listeners.slice(0, 5).map(r => `${r.file}:${r.line}`),
            emits: e.emits.slice(0, 5).map(r => `${r.side} ${r.file}:${r.line}`),
            ...(e.emitMissSuspect?.length ? { emitMissSuspect: e.emitMissSuspect.map(r => `${r.file}:${r.line}`) } : {}),
            ...(e.listenMissSuspect?.length ? { listenMissSuspect: e.listenMissSuspect.map(r => `${r.file}:${r.line}`) } : {}),
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

export async function generateDecisions(deps: GeneratorDeps, ctx: DecisionsContext, onChunk: (text: string) => void): Promise<string> {
  const commitRef = (c: { hash: string; date: string; subject: string } | null) =>
    c ? `commit:${c.hash.slice(0, 8)} (${c.date})「${c.subject}」` : '-';
  return generate(deps, onChunk, {
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
