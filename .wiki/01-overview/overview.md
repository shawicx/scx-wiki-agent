# scx-wiki-agent 项目概述

<details>
<summary>Relevant source files</summary>

- README.md
- src/knowledge/confirmation/index.ts
- src/knowledge/crosspage/index.ts
- src/knowledge/dataflow/index.ts
- src/knowledge/intent/index.ts
- src/knowledge/quality/index.ts
- src/knowledge/types/index.ts
- src/services/wiki/index.ts
- AGENTS.md
- package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- scripts/check-file-lines.mjs
- src/bin.ts
- src/cli/commands/build.ts
</details>

> 本页职责：说明 scx-wiki-agent 是什么、由哪些语言与目录构成、依赖什么、从哪进入、核心组件在哪，为后续页面提供全局索引。

scx-wiki-agent 是一个 **CLI 工具**（`projectType: cli`，包名 `@scxfe/wiki-agent`），职责是「从代码知识图谱生成结构化中文 Markdown Wiki」（package.json `description`；README.md#scx-wiki-agent）。它读取图谱中的符号、调用关系与复杂度数据，为支持矩阵内的代码项目生成结构化中文 Markdown 文档；其核心主张是「以图谱的精确结构数据为唯一事实来源，LLM 只负责叙述，反幻觉铁律 + 写盘前质量闸门双重兜底」（README.md#scx-wiki-agent）。工具面向的输入源是外部预装二进制 `codebase-memory-mcp`，通过子进程获取 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边（README.md#功能特性）。运行时 LLM 为可选能力：无模型、`--no-llm` 或生成失败时逐页回退纯规则模板，因此不配置 API 也能产出完整文档（README.md#功能特性）。

仓库规模：扫描范围内共 205 个文件，其中生产文件 135 个、测试文件 70 个（`productionFileCount` / `testFileCount`）。

---

## 技术栈

下表仅列数据中给出使用证据的依赖；「证据」列即 `depUsage` 的导入文件锚点。

| 技术 | 用途 | 证据（导入点） |
| --- | --- | --- |
| commander | CLI 命令定义与注册 | src/cli/index.ts、src/cli/commands/build.ts、src/cli/commands/init.ts、src/cli/commands/scan.ts（depUsage: commander.importFiles） |
| @ai-sdk/openai | OpenAI 兼容模型的接入层 | src/knowledge/generator/index.ts、src/knowledge/generator/shared.ts（depUsage: @ai-sdk/openai.importFiles） |
| ai | Vercel AI SDK 核心（生成调用） | src/knowledge/generator/shared.ts（depUsage: ai.importFiles） |
| @clack/prompts | 终端交互提示 | src/cli/confirm-interaction.ts（depUsage: @clack/prompts.importFiles） |
| ignore | gitignore 语义的文件过滤 | src/core/scanner.ts（depUsage: ignore.importFiles） |
| yaml | 配置文件解析 | src/shared/config.ts（depUsage: yaml.importFiles） |
| tsup | 构建/打包配置 | tsup.config.ts（depUsage: tsup.importFiles；仅在构建配置文件中导入，非运行时依赖） |
| vitest | 测试配置 | vitest.config.ts（depUsage: vitest.importFiles；仅在测试配置文件中导入，属测试专用，非生产运行时技术栈） |

`depUsage` 中另有两条 `usageKind: none` 的条目，`importFiles` 为空、`importCount` 为 0，即在本仓库生产代码中**声明未用**：`@types/node`、`typescript`（二者也不在 `techStack` 数组中）。

**选型合理性分析。** 该项目的产物是「文档」，而非服务，因此技术栈集中在三件事上：命令入口、模型调用、以及被写盘的内容质量。入口侧只用 commander（4 个导入点覆盖命令注册与三个子命令），没有引入更重的 CLI 框架，与 README 中给出的三条命令入口（init / scan / build 相关文件）规模相称。模型侧选择 `ai` + `@ai-sdk/openai` 的组合，导入点集中在 src/knowledge/generator/ 下的两个文件，与 README 强调的「OpenAI 兼容接口（含 Ollama）」以及「每页优先 LLM（Vercel AI SDK 流式）；无模型时回退纯规则模板」的双路径设计一致（README.md#功能特性）——OpenAI 兼容协议使同一份生成代码可以指向本地 Ollama，而不必为每个推理后端重写生成器。

**注意**：`@clack/prompts` 在本仓库仅有 1 个导入点（src/cli/confirm-interaction.ts），这与其只在「待确认项交互裁决」环节出现相对应（README.md#功能特性：`--confirm` 后在单次会话中逐项裁决待确认项），而非全 CLI 通用提示库。`ignore` 与 `yaml` 各仅 1 个导入点，分别落在扫描器与配置模块，说明文件过滤与配置解析被收束在单点，未散落到业务代码。

---

## 项目结构

源码目录（`sourceDirs`）为单一根目录 **src**，TypeScript 承担全部生产实现。

| 目录 / 文件 | 职责 | 证据 |
| --- | --- | --- |
| src/cli/ | CLI 层：入口注册与子命令 | src/cli/index.ts、src/cli/commands/build.ts、src/cli/commands/init.ts（commander.importFiles）、src/cli/commands/scan.ts、src/cli/confirm-interaction.ts（@clack/prompts.importFiles） |
| src/knowledge/ | 知识加工与页面生成核心，含多个子模块聚合出口 | src/knowledge/{config-detector,confirmation,context,crosspage,dataflow,fallback,generator,intent,quality,types}/index.ts（entryFiles） |
| src/services/wiki/ | 聚合出口 | src/services/wiki/index.ts:1（「services/wiki 聚合出口。」） |
| src/core/scanner.ts | 文件扫描（使用 ignore 做过滤） | src/core/scanner.ts（ignore.importFiles） |
| src/shared/config.ts | 配置读取与解析 | src/shared/config.ts（yaml.importFiles） |
| src/bin.ts | CLI 可执行入口 | typescript exampleFiles；README.md#快速开始（`node dist/bin.js init`） |

规模区分：生产文件 135 个、测试文件 70 个（`productionFileCount` / `testFileCount`）。测试文件在本次数据中未给出目录路径，故不在此处指派其归属目录（见「待确认」）。

src/knowledge/ 是目录层级最深、聚合出口最多的区域，其子目录从 entryFiles 可辨识出：config-detector（配置探测）、confirmation（待确认裁决）、context（上下文，含 context/cli.ts）、crosspage（跨页审校）、dataflow（数据形态证据）、fallback（回退）、generator（生成）、intent（意图证据）、quality（质量闸门）、types（类型聚合）。目录间关系是「收集 → 加工 → 校验 → 交互 → 落盘」的方向：src/knowledge/context 与 src/core/scanner.ts 提供输入，src/knowledge/generator 产出页面，src/knowledge/quality 与 src/knowledge/crosspage 做写盘前检查，src/knowledge/confirmation 在检查后接管人工裁决（依据各模块 file-header 注释，见下文）。

仓库根另有非源码文件（`languages` 数据）：

| 语言 | 文件数 | 示例文件 | 说明 |
| --- | --- | --- | --- |
| TypeScript | 128 | src/bin.ts、src/cli/commands/build.ts、src/cli/commands/init.ts | 全部生产与测试实现（唯一 sourceDir 为 src） |
| JavaScript | 1 | scripts/check-file-lines.mjs | 仓库脚本，位于 sourceDirs 之外的 scripts/；从文件名推断为「文件行数检查」脚本（推断，依据命名 `check-file-lines`），具体行为待确认 |
| Markdown | 2 | AGENTS.md、README.md | 仓库自述与代理约定文档 |
| JSON | 2 | package.json、tsconfig.json | 包清单与 TS 编译配置 |
| YAML | 2 | pnpm-lock.yaml、pnpm-workspace.yaml | 依赖锁与 pnpm workspace 清单 |

---

## 入口文件

`entryFiles` 共 13 条。下表按「是否有额外证据」分组说明；未标注额外证据者，数据仅表明其为模块入口，具体职责待确认。

| 入口文件 | 职责与依据 |
| --- | --- |
| src/cli/index.ts | CLI 命令注册入口（依据：commander.importFiles 含该文件） |
| src/bin.ts | CLI 可执行入口；README 快速开始以 `node dist/bin.js init` 方式调用（证据：README.md#快速开始、typescript exampleFiles） |
| src/knowledge/confirmation/index.ts | 「待确认项交互裁决层：全部页面生成完成后、写盘前的批量人工确认（R5 闭环）」（src/knowledge/confirmation/index.ts:1） |
| src/knowledge/crosspage/index.ts | 「跨页审校编排入口：指纹采集 → 重复/越界/一致性检测 → 亲和度计算」（src/knowledge/crosspage/index.ts:1） |
| src/knowledge/dataflow/index.ts | 「数据形态证据层（Data-flow 页的确定性数据源）—— 编排入口」（src/knowledge/dataflow/index.ts:1） |
| src/knowledge/intent/index.ts | 「意图证据层聚合出口（类型 / provider / 统计）」 （src/knowledge/intent/index.ts:1） |
| src/knowledge/quality/index.ts | 「质量闸门模块聚合出口（原 wiki-quality-validator.ts 拆分）」（src/knowledge/quality/index.ts:1） |
| src/knowledge/types/index.ts | 「types 聚合出口（graph / dataflow / contexts / pages-meta / pages-tier2）」（src/knowledge/types/index.ts:1） |
| src/services/wiki/index.ts | 「services/wiki 聚合出口」（src/services/wiki/index.ts:1） |
| src/knowledge/config-detector/index.ts | 配置探测模块入口（entryFiles；内部职责数据未提供） |
| src/knowledge/context/index.ts | 上下文模块入口（entryFiles；内部职责数据未提供） |
| src/knowledge/context/cli.ts | 上下文层的 CLI 入口（entryFiles；内部职责数据未提供） |
| src/knowledge/fallback/index.ts | 回退模块入口（entryFiles；内部职责数据未提供） |
| src/knowledge/generator/index.ts | 生成模块入口，且为 @ai-sdk/openai 的导入点之一（依据：@ai-sdk/openai.importFiles） |

（上表 14 行，因 src/bin.ts 属 typescript exampleFiles 而非 entryFiles 条目，为便于定位一并列出。）

从入口形态看，src/knowledge/* 与 src/services/wiki 下的入口全部是 `index.ts` 聚合出口，配合各模块 file-header 中反复出现的「聚合出口」措辞（src/knowledge/types/index.ts:1、src/knowledge/intent/index.ts:1、src/services/wiki/index.ts:1），可判定该项目采用「目录即模块、index 作公共面」的组织方式（推断，依据为入口文件命名模式与三条注释原文中的「聚合出口」字样）。

---

## 核心组件

`topSymbols` 给出复杂度最高的 10 个函数（该数据未附带 file:line 或 qualified_name，故下表只列名称、类型与复杂度，符号定义位置见「待确认」）：

| 符号 | 类型 | 复杂度 |
| --- | --- | --- |
| renderFactsAndUnknowns | function | 28 |
| isTestPath | function | 27 |
| generate | function | 22 |
| languageDomainOf | function | 14 |
| intentTable | function | 10 |
| matchPackageForFile | function | 9 |
| intentToPrompt | function | 9 |
| isProductionGraphFile | function | 9 |
| hasIntent | function | 9 |
| isChapterPage | function | 9 |

从命名与所在模块的职责可以读出这条链路的形状：`generate` 是生成主入口（与 src/knowledge/generator/index.ts 导入 @ai-sdk/openai 的证据相互印证）；`renderFactsAndUnknowns` 与 `intentTable` 属渲染层，负责把确定事实与未决项一并落到页面上（与 src/knowledge/intent/index.ts:1「意图证据层聚合出口」相呼应）；`intentToPrompt`、`hasIntent` 构成意图证据进入 LLM 提示词的通道；`isTestPath`、`isProductionGraphFile`、`matchPackageForFile`、`languageDomainOf` 是判定类函数，用于在扫描清单与图谱数据中区分测试/生产、定位归属包与语言域——这正是「事实来源必须是精确结构数据」这一主张在代码层面的落点；`isChapterPage` 对应 README 描述的「18 页固定注册表（PageRegistry）」与编号目录输出的分章判定（README.md#功能特性）。

值得注意的是，复杂度最高的两个函数（`renderFactsAndUnknowns`、`isTestPath`）都不是模型调用函数：前者处理「事实 + 待确认」的混合渲染，后者处理路径分类，说明该工具的复杂度重心在于**确定性规则**而非 LLM 编排，这与「LLM 只负责叙述」的定位一致（README.md#scx-wiki-agent）。

---

## 核心设计思路

**第一，图谱是唯一事实来源，模型只做叙述。** README 开篇即声明「以图谱的精确结构数据为唯一事实来源，LLM 只负责叙述，反幻觉铁律 + 写盘前质量闸门双重兜底」（README.md#scx-wiki-agent）。数据源通过子进程调用 `codebase-memory-mcp` 获取 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边（README.md#功能特性）。与之配套的是七条反幻觉铁律（R1-R7），被注入每次 LLM 调用（README.md#功能特性）——本页的表格化、锚点化写法即遵循同一规则。

**第二，「是什么」与「为什么」被拆成两层证据。** 图谱只回答「是什么」，动机类叙述的证据由确定性提取器补充：源码注释（文件头/符号注释/TODO 标记/常量注释）、git 提交（首末提交/高频主题/依赖引入）、README 与 docs 小节、测试用例名（行为承诺），每条证据带锚点且 fail-open（README.md#功能特性；src/knowledge/intent/index.ts:1）。数据流页面的演化直接记录了这一思路的由来：src/knowledge/dataflow/index.ts:1 的文件头注释写明「旧实现的 data-flow 页把 CALLS 调用边直接当数据流渲染，页面退化成 calls.md 的复制品。本模块把『调用链』降级为路径与排序依据，另行采集真正的数据证据：CALLS 边属性（r.line / r.args / confidence / strategy）+ 图谱 Function/Method 签名（signature / return_type / param_types…）」。这是一条带原始动机的自我修正记录，也是本项目「证据驱动」方法论的样本。

**第三，写盘前设闸门，把不确定显式交给人。** 质量闸门模块由原 `wiki-quality-validator.ts` 拆分而来（src/knowledge/quality/index.ts:1），按 README 描述：空壳页/密钥泄漏为 error 级拦截，死链/残缺锚点/薄证据/幽灵图表节点/无锚动机小节为 warn 级告警（README.md#功能特性）。闸门之后还有两道人工/跨页补强：crosspage 负责「指纹采集 → 重复/越界/一致性检测 → 亲和度计算」的跨页审校（src/knowledge/crosspage/index.ts:1）；confirmation 负责两阶段的待确认项交互裁决，「全部页面生成完成后、写盘前的批量人工确认（R5 闭环）」，并把确认结果持久化以免重复标注（src/knowledge/confirmation/index.ts:1）。这三者共用 `hasIntent`/`intentToPrompt` 一类判定函数（见「核心组件」），说明「证据不足即降级」是贯穿流水线的统一策略。项目自首次提交起即以此形态推进：「仓库首次提交：feat: 功能基本可用」（commit:76565d14，2026-06-02）。

---

## 延伸阅读

数据中 `docsFiles` 为空，未提供 docs 目录下的延伸阅读清单。仓库内可用的文档文件为：

- README.md（项目定位、功能特性、支持矩阵、前置依赖与快速开始）
- AGENTS.md
## Related

- 同目录：[tech-stack.md](tech-stack.md) · [environment.md](environment.md)
- 互补职责：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 6 个源文件、共享 12 个符号：[onboarding.md](../05-guides/onboarding.md)
- 共享 4 个源文件、共享 10 个符号：[troubleshooting.md](../05-guides/troubleshooting.md)
- 共享 1 个源文件、共享 4 个符号：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)
