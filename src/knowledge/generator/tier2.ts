/**
 * Tier-2 surface 页的 LLM 生成（public-api/routes/components/state/routing/
 * workspaces/package-boundaries/db-schema）。中文叙述 + R1-R7（锚点必留、
 * 拒编造、数据即证据），事实部分以确定性表格为骨架。
 */

import type {
  PublicApiContext, RoutesContext, ComponentsContext, StateContext,
  RoutingContext, WorkspacesContext, PackageBoundariesContext, DbSchemaContext,
} from '../types.js';
import { generate, intentToPrompt, type GeneratorDeps } from './shared.js';

export async function generatePublicApi(deps: GeneratorDeps, ctx: PublicApiContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据库的公共 API 数据生成详尽的公共 API 文档页面（Markdown）。

要求：
- 用中文撰写；开头概述该库的导出面组织方式（exports 子路径 / 单入口）
- "exports 字段"章节：表格列出子路径与指向
- "入口 re-export 链"章节：表格列出（入口文件 | 转发目标 | 形态 | 行号）
- "导出符号"章节：按功能分组说明各导出符号（分组可推断，但符号名/文件/行号必须原样引用，R1）
- 每条事实必须带 file:line 锚点；未检出用途时只描述签名形态，禁止编造用途（R3/R5）
- 事实表格中的条目严禁增删改（工具注入为准）`,
    userPrompt: JSON.stringify({
      packageName: ctx.packageName, version: ctx.version,
      exportsField: ctx.exportsField, entryDecls: ctx.entryDecls,
      reExports: ctx.reExports, symbols: ctx.symbols,
    }, null, 2),
  });
}

export async function generateRoutes(deps: GeneratorDeps, ctx: RoutesContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据 HTTP 路由扫描数据生成详尽的路由文档页面（Markdown）。

要求：
- 用中文撰写；开头概述路由组织（框架、分组方式、中间件策略）
- "路由表"章节：完整表格（方法 | 路径 | handler | 框架 | 中间件 | 源文件:行号），条目严禁增删改
- 按资源/业务域分组解读路由设计（叙述可综合，但不得出现表外路径，R1）
- 内联 handler 如实标注；动态注册的局限在页尾说明（未知项诚实列出）
- 每个 handler 叙述基于其命名与同文件上下文，无证据的语义描述标「推断」（R7）`,
    userPrompt: JSON.stringify({ routes: ctx.routes }, null, 2),
  });
}

export async function generateComponents(deps: GeneratorDeps, ctx: ComponentsContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据前端组件扫描数据生成详尽的组件文档页面（Markdown）。

要求：
- 用中文撰写；开头概述组件体系（框架、命名约定、组织方式）
- "组件清单"章节：完整表格（组件 | 框架 | props | emits | 被引用文件数 | 测试配对 | 文件），条目严禁增删改
- 挑选被引用度最高的 5-8 个组件做重点说明（职责叙述基于命名与文件位置，无证据标「推断」）
- 被引用度是词法统计，页面须说明该口径；未检出 props 的组件如实说明
- 每条事实带文件锚点（R1）`,
    userPrompt: JSON.stringify({ components: ctx.components, intent: intentToPrompt(ctx.intent) }, null, 2),
  });
}

export async function generateStatePage(deps: GeneratorDeps, ctx: StateContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据状态管理扫描数据生成详尽的状态管理文档页面（Markdown）。

要求：
- 用中文撰写；开头概述状态管理方案选型（Pinia/Vuex/Redux/Zustand/composable 的组合）
- "store 清单"章节：完整表格（名称 | 类型 | state 字段数 | 消费文件数 | 源文件:行号），条目严禁增删改
- 按业务域分组解读各 store 的职责（叙述可综合，符号名/锚点原样引用，R1）
- state 字段数为近似计数，页面须声明口径；消费数为词法统计
- 如提供 intent（意图证据），设计动机叙述必须引用其锚点（R7）`,
    userPrompt: JSON.stringify({ stores: ctx.stores, intent: intentToPrompt(ctx.intent) }, null, 2),
  });
}

export async function generateRouting(deps: GeneratorDeps, ctx: RoutingContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据前端路由扫描数据生成详尽的路由文档页面（Markdown）。

要求：
- 用中文撰写；开头概述路由结构（层级、懒加载 import 形态、路由库）
- "路由表"章节：完整表格（路径 | 组件 | 路由库 | 源文件:行号），条目严禁增删改
- 按页面域分组说明导航结构；组件名与路径必须原样引用（R1）
- 组件未检出的条目如实标注；动态路由局限在页尾说明`,
    userPrompt: JSON.stringify({ routes: ctx.routes }, null, 2),
  });
}

export async function generateWorkspaces(deps: GeneratorDeps, ctx: WorkspacesContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据 monorepo 工作区数据生成详尽的工作区文档页面（Markdown）。

要求：
- 用中文撰写；开头概述工作区结构（声明来源、包数量、分层方式）
- "成员包"章节：完整表格（包名 | 版本 | 目录 | private），条目严禁增删改
- "包间依赖"章节：完整表格（依赖方 | 被依赖方 | import 点数 | 已声明），条目严禁增删改
- 依据依赖边分析分层（如 app → core → shared），叙述以表格数据为限（R1/R3）
- import 聚合的口径（相对 import 解析、动态加载盲区）在页尾说明`,
    userPrompt: JSON.stringify({ source: ctx.source, packages: ctx.packages, edges: ctx.edges }, null, 2),
  });
}

export async function generatePackageBoundaries(deps: GeneratorDeps, ctx: PackageBoundariesContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据包间边界检查数据生成详尽的边界文档页面（Markdown）。

要求：
- 用中文撰写；开头概述边界健康度（声明率、违规数）
- "依赖边全景"与"边界违规"章节：完整表格，条目严禁增删改
- 对违规边逐条说明风险（隐式耦合 / 严格模式构建失败）与修复方式（补声明或收敛 import）
- 未检出违规时如实声明边界健康，禁止编造隐患（R5）`,
    userPrompt: JSON.stringify({ edges: ctx.edges, packages: ctx.packages, violations: ctx.violations }, null, 2),
  });
}

export async function generateDbSchema(deps: GeneratorDeps, ctx: DbSchemaContext, onChunk: (text: string) => void): Promise<string> {
  return generate(deps, onChunk, {
    systemPrompt: `你是一个资深代码文档专家。请根据数据模型扫描数据生成详尽的数据模型文档页面（Markdown）。

要求：
- 用中文撰写；开头概述持久化方案（检出的 ORM/SQL 类型与模型总数）
- 每个模型一节：字段表格（字段 | 类型 | 约束/属性），条目严禁增删改；字段含义可从命名综合，无证据标「推断」
- 模型间关系仅当字段/约束中可见（外键、引用列）时描述，禁止凭常识补全（R3）
- 正则提取口径与单模型字段上限在页尾说明（未知项诚实列出）`,
    userPrompt: JSON.stringify({ detectedKinds: ctx.detectedKinds, models: ctx.models }, null, 2),
  });
}
