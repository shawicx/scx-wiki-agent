# 项目概览

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
- src/knowledge/config-detector/index.ts
- src/knowledge/confirmation/index.ts
- src/knowledge/context/cli.ts
- src/knowledge/context/index.ts
- src/knowledge/crosspage/index.ts
- src/knowledge/dataflow/index.ts
- src/knowledge/fallback/index.ts
- src/knowledge/generator/index.ts
- src/knowledge/intent/index.ts
- src/knowledge/quality/index.ts
- src/knowledge/types/index.ts
- src/services/wiki/index.ts
- README.md
- AGENTS.md
</details>

从代码知识图谱生成结构化中文 Markdown Wiki 的 CLI 工具（LLM 增强叙述 + 纯规则回退）

cli 类型项目：生产文件 148 个、测试文件 0 个（共 148 个）。

## 技术栈

- @ai-sdk/openai
- @clack/prompts
- @vue/compiler-sfc
- ai
- commander
- ignore
- yaml
- tsup
- vitest

## 入口文件

- `src/cli/index.ts`
- `src/knowledge/config-detector/index.ts`
- `src/knowledge/confirmation/index.ts`
- `src/knowledge/context/cli.ts`
- `src/knowledge/context/index.ts`
- `src/knowledge/crosspage/index.ts`
- `src/knowledge/dataflow/index.ts`
- `src/knowledge/fallback/index.ts`
- `src/knowledge/generator/index.ts`
- `src/knowledge/intent/index.ts`
- `src/knowledge/quality/index.ts`
- `src/knowledge/types/index.ts`
- `src/services/wiki/index.ts`

## 源码目录

- src

## 热点符号（高扇入）

| 符号 | 类型 | 扇入 |
| --- | --- | --- |
| isTestPath | function | 29 |
| renderFactsAndUnknowns | function | 28 |
| generate | function | 22 |
| dispatchContext | function | 19 |
| languageDomainOf | function | 14 |
| intentTable | function | 10 |
| matchPackageForFile | function | 9 |
| hasIntent | function | 9 |
| isProductionGraphFile | function | 9 |
| isChapterPage | function | 9 |

## 设计依据（意图证据）

从源码注释、git 提交与仓库文档确定性提取（每条带锚点，可回溯验证）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| scx-wiki-agent：基于 codebase-memory-mcp 知识图谱的项目 Wiki 生成 CLI。读取图谱中的符号、调用关系与复杂度数据，为支持矩阵内的代码项目生成结构化中文 Markdown 文档；以图谱的精确结构数据为唯一事实来源，LLM 只负责叙述，反幻觉铁律 + 写盘前质量闸门双重兜底。 | 文档小节 | README.md | README.md#scx-wiki-agent |
| 功能特性：- **知识图谱数据源** — 通过子进程调用 `codebase-memory-mcp` 获取 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边 - **意图证据层（Intent Evidence）** — 图谱只回答「是什么」，动机类叙述的证据由确定性提取器补充：源码注释（文件头/符号注释/TODO 标记/常量注释）、git | 文档小节 | README.md | README.md#功能特性 |
| 支持矩阵：| 语言 | 支持程度 | 说明 | | --- | --- | --- | | TypeScript / JavaScript / Vue | ✅ 完整 | 图谱 + 注释/git/docs 意图证据 + I/O 扫描全通道（实战验证） | | Rust（含 Tauri） | ✅ 完整 | 跨语言 CALLS 过滤 + Tauri IPC 面 | | Python | 🧪 实验性 | 扫描/注 | 文档小节 | README.md | README.md#支持矩阵 |
| 待确认项交互裁决层：全部页面生成完成后、写盘前的批量人工确认（R5 闭环）。 待确认项四种形态（全 wiki 可 grep「待确认」定位）： - claim：断言校验标注的 `` `标识符`（待确认） `` ——确认=移除标记，可持久化免标 - cell：fallback/LLM 表格单元 ⚠️ 待确认——确认=填入用户输入的确认内容 - note：块级降级说明（unconfirmedNote）——确认=移除提示行（或替换为补充说明） - prose：LLM R5 自由文本待 | 文件头自述 | src/knowledge/confirmation/index.ts | src/knowledge/confirmation/index.ts:1 |
| 跨页审校编排入口：指纹采集 → 重复/越界/一致性检测 → 亲和度计算。 纯函数（输入内存页产物与 context，输出报告与跨页链接）；降级动作经 applyCrossPageActions 应用。 / | 文件头自述 | src/knowledge/crosspage/index.ts | src/knowledge/crosspage/index.ts:1 |
| 数据形态证据层（Data-flow 页的确定性数据源）—— 编排入口。 背景：旧实现的 data-flow 页把 CALLS 调用边直接当数据流渲染，页面退化成 calls.md 的复制品。本模块把「调用链」降级为路径与排序依据，另行采集真正的数据证据： CALLS 边属性（r.line / r.args / confidence / strategy） + 图谱 Function/Method 签名（signature / return_type / param_types | 文件头自述 | src/knowledge/dataflow/index.ts | src/knowledge/dataflow/index.ts:1 |
| 意图证据层聚合出口（类型 / provider / 统计）。 | 文件头自述 | src/knowledge/intent/index.ts | src/knowledge/intent/index.ts:1 |
| 质量闸门模块聚合出口（原 wiki-quality-validator.ts 拆分） | 文件头自述 | src/knowledge/quality/index.ts | src/knowledge/quality/index.ts:1 |
| types 聚合出口（graph / dataflow / contexts / pages-meta / pages-tier2）。 | 文件头自述 | src/knowledge/types/index.ts | src/knowledge/types/index.ts:1 |
| services/wiki 聚合出口。 | 文件头自述 | src/services/wiki/index.ts | src/services/wiki/index.ts:1 |
| 仓库首次提交：feat: 功能基本可用 | 提交记录 | - | commit:76565d14 (2026-06-02) |

## 本页确定知道的事实

- 生产文件 148 个、测试文件 0 个、扫描文件共 148 个
- 技术栈检出 9 项（@ai-sdk/openai、@clack/prompts、@vue/compiler-sfc、ai、commander 等）
- 入口文件 13 个、源码目录 1 个
- 高扇入热点符号 10 个
- 意图证据 11 条（源码注释 / git 提交 / 仓库文档，均带锚点）
## Related

- 同目录：[tech-stack.md](tech-stack.md) · [environment.md](environment.md)
- 互补职责：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 13 个源文件、共享 13 个符号：[onboarding.md](../05-guides/onboarding.md)
- 共享 13 个源文件、共享 13 个符号：[troubleshooting.md](../05-guides/troubleshooting.md)
- 共享 1 个源文件、共享 3 个符号：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
