<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/commands/types.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/core/types.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/config-detector/detector.ts
- src/knowledge/config-detector/env-purpose.ts
- src/knowledge/context/calls.ts
- src/knowledge/context/data-flow.ts
- src/knowledge/context/db-schema.ts
- src/knowledge/context/frontend.ts
</details>

## 组织方式概述

项目在顶层按职责横向切分为 6 个模块：`knowledge`、`services`、`mcp`、`core`、`shared`、`cli`。规模分布高度不均——`knowledge` 以 99 个文件占据绝对主体，`services`（12）、`cli`（6）、`shared`（4）构成中间层，`mcp` 与 `core` 各仅 2 个文件，属于最小粒度的接入/基础单元。符号（symbol）声明集中在 `knowledge`（10 个）与 `mcp`（4 个）两个模块，其余 4 个模块的符号计数为 0。

| 模块 | 文件数 | 符号数 | 说明（基于计数） |
|---|---|---|---|
| `knowledge` | 99 | 10 | 文件与符号数均为最高，是项目的体量中心 |
| `services` | 12 | 0 | 文件数居中，无符号声明记录 |
| `mcp` | 2 | 4 | 文件极少但符号密度最高 |
| `core` | 2 | 0 | 最小文件规模之一 |
| `shared` | 4 | 0 | 小规模公共层 |
| `cli` | 6 | 0 | 小规模入口层 |
| **合计** | **125** | **14** | — |

模块划分呈现出「一个重型目录 + 若干轻量职责层」的形态：`knowledge` 承载了 79.2%（99/125）的文件与 71.4%（10/14）的符号，而 `core`、`shared`、`cli`、`mcp` 合计仅 14 个文件。（推断）从命名结构看（`core` / `shared` 位于底层，`services` 居中，`cli` / `mcp` 作为对外入口，`knowledge` 作为数据/内容主体），该项目倾向于「基础设施—服务—接入」的分层组织，依据是模块命名与文件规模梯度，而非源码中的显式声明。

**待确认**：各模块的目录路径、入口文件与模块间调用关系未包含在本节数据中，因此模块的依赖方向与调用边无法在本节给出；模块详解节可能覆盖这些内容。

## 模块详解（第1批）

本批按数据顺序覆盖 4 个模块：`knowledge`、`services`、`mcp`、`core`。

### 1. knowledge

#### 职责

`knowledge` 是 Wiki 内容生成与校验的核心模块，共 99 个 TypeScript 文件（数据 `fileCount: 99`，其中文件清单仅列出 10 个、`fileSymbols` 覆盖 12 个，详见下方「文件结构」）。从携带 intent 的文件头可确认它至少承担以下职责域：

- **正文断言校验**：`src/knowledge/claim-verifier.ts:1` 自述「抽取 LLM 生成正文 inline 代码片段中的标识符声明，三级核验：图谱符号全集 → 扫描文件名干 → 词法证据探测……查无实据或仅提及的声明改写为『待确认』标注（R5 风格）」。
- **页首证据锚定**：`src/knowledge/wiki-evidence.ts:1` 自述从页面 Context 递归提取真实源文件路径，「生成 `<details>` 折叠块注入页首。LLM 与规则路径统一由工具注入，LLM 无法伪造锚定块内容」。
- **Markdown 页面构造**：`src/knowledge/wiki-builder.ts:1` 自述为「fluent utility for constructing markdown wiki pages」，方法链式返回 `this`，末端 `build()` 产出最终 markdown。
- **页面层级定义**：`src/knowledge/page-registry.ts:1` 自述定义页面所属层级 `structure` / `operations` / `surface`。
- **配置用途确定性提取**：`src/knowledge/config-detector/env-purpose.ts:1` 自述「R3：只采集可复核证据，不做语义推断」。
- **签名/类型形状推断**：`src/knowledge/dataflow/shapes.ts:1` 自述承载「文本级括号/字符串扫描工具、图谱签名解析、实参字面量保守推断、返回类型归一与 void 解释」。

#### 设计意图

- 该模块的定位是「把真实图谱/扫描数据确定性地转成可核验的 Wiki 内容」：`src/knowledge/claim-verifier.ts:1` 明确其为「DeepWiki-Open 文本断言交叉核验的确定性实现」，`src/knowledge/wiki-evidence.ts:1` 称其为「DeepWiki grounding 机制的确定性实现」。两条 intent 共同指向「可复核、抗伪造」的设计取向。
- 校验与锚定被内置于知识层而非交给 LLM 自行产出（`src/knowledge/wiki-evidence.ts:1` 明言「LLM 无法伪造锚定块内容」），据此可推断：knowledge 是内容真实性的责任边界，而非纯文本拼装层。
- `src/knowledge/dataflow/shapes.ts:1` 注明「自 data-flow-shape.ts 拆出；纯搬移，零逻辑变化」，说明该文件是既有结构的一次拆分重构产物。

#### 交互方式

| 关系方向 | 模块 | 说明 |
|---|---|---|
| 依赖（dependsOn） | `shared`、`mcp`、`cli`、`core` | knowledge 依赖这 4 个模块 |
| 被依赖（usedBy） | `services` | services 消费 knowledge |

> 数据未提供 knowledge 与这些模块之间的具体调用点（无调用边明细），故此处仅列出模块级依赖方向，具体调用关系待确认。

#### 文件结构

| 文件名 | 关键符号 | 职责 |
|---|---|---|
| `src/knowledge/fallback/index.ts` | `buildByName` | 按页面名派发规则生成，供 PageRegistry 调用（`src/knowledge/fallback/index.ts:55`） |
| `src/knowledge/context/calls.ts` | `buildCallsContext` | 构建调用关系上下文（`src/knowledge/context/calls.ts:51`） |
| `src/knowledge/context/db-schema.ts` | `buildDbSchemaContext` | 构建数据库 schema 上下文（`src/knowledge/context/db-schema.ts:118`） |
| `src/knowledge/context/data-flow.ts` | `buildDataFlowContext` | 构建数据流上下文（`src/knowledge/context/data-flow.ts:29`） |
| `src/knowledge/context/workspaces.ts` | `buildEdges` | 包间依赖边聚合（`src/knowledge/context/workspaces.ts:106`） |
| `src/knowledge/context/frontend.ts` | `buildComponentsContext` | 构建前端组件上下文（`src/knowledge/context/frontend.ts:67`） |
| `src/knowledge/fallback/structure.ts` | `buildArchitecture` | 结构层兜底生成（`src/knowledge/fallback/structure.ts:72`） |
| `src/knowledge/fallback/surface.ts` | `buildOnboarding` | 表层兜底生成（`src/knowledge/fallback/surface.ts:118`） |
| `src/knowledge/generator/structure.ts` | `buildGlossarySections` | 关键概念页确定性节表（`src/knowledge/generator/structure.ts:229`） |
| `src/knowledge/outline-planner.ts` | `buildInputs` | 确定性组装规划输入（`src/knowledge/outline-planner.ts:70`） |
| `src/knowledge/claim-verifier.ts` | （数据未提供符号） | 正文断言校验（`src/knowledge/claim-verifier.ts:1`） |
| `src/knowledge/config-detector/detector.ts` | （数据未提供符号） | 配置检测（文件清单中列出，无符号明细） |

> intent 中还引用了 `src/knowledge/wiki-evidence.ts:1`、`src/knowledge/wiki-builder.ts:1`、`src/knowledge/page-registry.ts:1`、`src/knowledge/config-detector/env-purpose.ts:1`、`src/knowledge/dataflow/shapes.ts:1`，这些文件在模块 intent 中被确认为模块组成部分。

#### 核心符号

| 符号 | 签名 | 用途 |
|---|---|---|
| `buildByName` | `(page: string, ctx: any)` | 按页面名派发规则生成，供 PageRegistry 调用（`src/knowledge/fallback/index.ts:55`） |
| `buildCallsContext` | `(deps: ContextDeps)` | 构建调用关系上下文（`src/knowledge/context/calls.ts:51`） |
| `buildDbSchemaContext` | `(deps: ContextDeps)` | 构建数据库 schema 上下文（`src/knowledge/context/db-schema.ts:118`） |
| `buildDataFlowContext` | `(deps: ContextDeps)` | 构建数据流上下文（`src/knowledge/context/data-flow.ts:29`） |
| `buildEdges` | `(deps: ContextDeps, packages: PkgInfo[])` | 包间依赖边聚合（from → to：import 计数 + 是否声明）（`src/knowledge/context/workspaces.ts:106`） |
| `buildArchitecture` | `(ctx: ArchitectureContext)` | 结构层兜底生成（`src/knowledge/fallback/structure.ts:72`） |
| `buildOnboarding` | `(ctx: OnboardingContext)` | 表层兜底生成（`src/knowledge/fallback/surface.ts:118`） |
| `buildGlossarySections` | `(ctx: GlossaryContext)` | 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化），贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节（`src/knowledge/generator/structure.ts:229`） |
| `buildInputs` | `(topics: TopicDefinition[], feedback?: string)` | 确定性组装规划输入（全部真实数据，无臆造字段）（`src/knowledge/outline-planner.ts:70`） |
| `buildComponentsContext` | `(deps: ContextDeps)` | 构建前端组件上下文（`src/knowledge/context/frontend.ts:67`） |

**语言域**：模块 `languages` 仅含 `ts`（99 文件），无多语言分工。

---

### 2. services


`services` 共 12 个 TypeScript 文件，承担 Wiki 构建的编排与服务层职责。由 intent 文件头可确认的职责域：

- **build 编排**：`src/services/wiki/service.ts:1` 自述「WikiService：build 编排（两阶段构建：内存生成 → 裁决 → 闸门写盘）」。
- **断言核验基础设施**：`src/services/wiki/verification.ts:1` 自述「图谱符号索引、源码行缓存、指纹条目、词法探测、outline 参考集」。
- **阶段一（生成）**：`src/services/wiki/generate-phase.ts:1` 自述「两阶段构建·阶段一：全部页面内存生成 + 断言校验（不写盘）」。
- **阶段三（写盘）**：`src/services/wiki/write-phase.ts:1` 自述「两阶段构建·阶段三：剥离 marker + 注入锚定块 + 写盘前闸门 + 写盘（update 模式在终稿上比较）」。
- **目录治理**：`src/services/wiki/cleanup.ts:1` 自述「.wiki 目录治理（update 模式路径；full 模式整目录重建跳过）」。
- **兼容壳**：`src/services/wiki-service.ts:1` 自述「实现已拆分至 src/services/wiki/（service/cleanup/report/verification/阶段二·三）」。


- 两阶段构建是明确的设计主张：`src/services/wiki/generate-phase.ts:1`（阶段一·内存生成不写盘）与 `src/services/wiki/write-phase.ts:1`（阶段三·写盘前闸门）共同表明「先生成、后校验、再落盘」的流程被拆成独立阶段文件，而不是单次写盘。
- `src/services/wiki-service.ts:1` 自述为「兼容壳」，说明 services 保留了旧入口以兼容外部调用，实际实现已迁入 `src/services/wiki/` 子目录。
- 核验能力被抽为独立基础设施文件（`src/services/wiki/verification.ts:1`），据此可推断其服务于「生成阶段 + 写盘前闸门」两处复用（推断依据：文件头列出的索引/缓存/探测/参考集正是校验与闸门共同需要的数据）。


| 关系方向 | 模块 | 说明 |
|---|---|---|
| 依赖（dependsOn） | `knowledge` | services 依赖 knowledge |
| 被依赖（usedBy） | `cli` | cli 调用 services |

> 数据未提供 services 与 knowledge / cli 之间的具体调用点明细，具体调用关系待确认。


| 文件名 | 关键符号 | 职责 |
|---|---|---|
| `src/services/wiki/service.ts` | （数据未提供符号） | WikiService：build 编排，两阶段构建（`src/services/wiki/service.ts:1`） |
| `src/services/wiki/generate-phase.ts` | （数据未提供符号） | 阶段一：全部页面内存生成 + 断言校验（不写盘）（`src/services/wiki/generate-phase.ts:1`） |
| `src/services/wiki/write-phase.ts` | （数据未提供符号） | 阶段三：剥离 marker + 注入锚定块 + 写盘前闸门 + 写盘（`src/services/wiki/write-phase.ts:1`） |
| `src/services/wiki/verification.ts` | （数据未提供符号） | 断言核验基础设施：图谱符号索引、源码行缓存、指纹条目、词法探测、outline 参考集（`src/services/wiki/verification.ts:1`） |
| `src/services/wiki/cleanup.ts` | （数据未提供符号） | .wiki 目录治理（`src/services/wiki/cleanup.ts:1`） |
| `src/services/wiki/confirm-phase.ts` | （数据未提供符号） | 由 intent 提示的阶段文件（阶段二·裁决方向），文件清单中列出 |
| `src/services/wiki/report.ts` | （数据未提供符号） | 构建报告（`src/services/wiki-service.ts:1` 提及拆分内容含 report） |
| `src/services/wiki/resolve.ts` | （数据未提供符号） | 文件清单中列出，无职责自述 |
| `src/services/wiki/index.ts` | （数据未提供符号） | 子模块入口，文件清单中列出 |
| `src/services/wiki/types.ts` | （数据未提供符号） | 类型定义，文件清单中列出 |
| `src/services/scan-service.ts` | （数据未提供符号） | 扫描服务，文件清单中列出 |
| `src/services/wiki-service.ts` | （数据未提供符号） | 兼容壳，实现已拆分至 `src/services/wiki/`（`src/services/wiki-service.ts:1`） |


本模块 `topSymbols` 为空、各文件 `symbols` 数组亦为空，无签名级信息可引用。符号明细待确认。

**语言域**：模块 `languages` 仅含 `ts`（12 文件），无多语言分工。

---

### 3. mcp


`mcp` 共 2 个 TypeScript 文件，承担与 codebase-memory-mcp 知识图谱服务的对接与数据适配职责。语义来自 `src/mcp/types.ts:1` 自述「codebase-memory-mcp index_repository 返回」，即该模块负责承接并规范化 MCP 返回的数据结构。


- `commit:9ef4fd6f (2026-06-24)` 首次提交信息为「refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki」，这是该模块存在的直接动机证据：项目整体从其他知识来源改为以 codebase-memory-mcp 知识图谱为输入（commit 短哈希 + 日期为证）。
- `src/mcp/codebase-memory-client.ts` 中多个适配函数（`asObjects`、`adaptArchitecture`、`adaptTrace`）均带有「旧版/新版」兼容 docstring（`src/mcp/codebase-memory-client.ts:35`、`src/mcp/codebase-memory-client.ts:45`、`src/mcp/codebase-memory-client.ts:92`），可推断 MCP 返回格式发生过从「对象数组」到「列式表」的演进，适配层用于抹平两代格式差异（推断依据：docstring 中明确并列「旧版对象数组 / 新版列式表」）。


| 关系方向 | 模块 | 说明 |
|---|---|---|
| 依赖（dependsOn） | （无） | 数据中 dependsOn 为空数组 |
| 被依赖（usedBy） | `knowledge`、`cli` | knowledge 与 cli 均依赖 mcp |

> mcp 作为数据来源适配层，被 knowledge（内容生成）与 cli（命令入口）共同依赖；具体调用点未在数据中提供。


| 文件名 | 关键符号 | 职责 |
|---|---|---|
| `src/mcp/codebase-memory-client.ts` | `asObjects`、`adaptArchitecture`、`adaptTrace`、`adaptSide` | 兼容旧版对象数组 / 新版列式表两种形态，适配 get_architecture 与 trace_path 返回 |
| `src/mcp/types.ts` | （数据未提供符号） | 承载「codebase-memory-mcp index_repository 返回」的类型定义（`src/mcp/types.ts:1`） |


| 符号 | 签名 | 用途 |
|---|---|---|
| `adaptTrace` | `(raw: Record<string, any>)` | trace_path 分组列式表 → 扁平 TraceNode[]（`src/mcp/codebase-memory-client.ts:92`） |
| `asObjects` | `(raw: Record<string, unknown>, key: string)` | 兼容两种形态：旧版对象数组 / 新版列式表（`src/mcp/codebase-memory-client.ts:35`） |
| `adaptArchitecture` | `(raw: Record<string, any>)` | get_architecture 列式表 → ArchitectureData 对象数组（`src/mcp/codebase-memory-client.ts:45`） |
| `adaptSide` | `(side: unknown)` | 数据未提供 docstring，仅知其为适配函数（`src/mcp/codebase-memory-client.ts:93`） |

**语言域**：模块 `languages` 仅含 `ts`（2 文件），无多语言分工。

---

### 4. core


`core` 共 2 个 TypeScript 文件，位于 `src/core/scanner.ts` 与 `src/core/types.ts`。数据未提供任何符号级与 docstring 信息，职责细节不足。


- `commit:76565d14 (2026-06-02)` 首次提交信息为「feat: 功能基本可用」，是该模块目前可用的唯一动机证据。
- 由文件命名（`scanner.ts`、`types.ts`）及被 `knowledge`、`cli` 共同依赖的方向（usedBy）可推断其为项目扫描能力的底层实现与共享类型定义（此条为「推断」，依据为命名与依赖方向，非源码注释佐证）。


| 关系方向 | 模块 | 说明 |
|---|---|---|
| 依赖（dependsOn） | `shared` | core 依赖 shared |
| 被依赖（usedBy） | `knowledge`、`cli` | knowledge 与 cli 均依赖 core |


| 文件名 | 关键符号 | 职责 |
|---|---|---|
| `src/core/scanner.ts` | （数据未提供符号） | 扫描器实现（命名来源，无 docstring 佐证） |
| `src/core/types.ts` | （数据未提供符号） | 核心类型定义（命名来源，无 docstring 佐证） |


本模块 `topSymbols` 为空、各文件 `symbols` 数组亦为空，无签名级信息可引用。符号明细待确认。

**语言域**：模块 `languages` 仅含 `ts`（2 文件），无多语言分工。

---

### 待确认汇总

1. `knowledge` 的实际文件集合与符号明细不全：数据 `fileCount: 99`，但 `files` 仅列 10 个、`fileSymbols` 覆盖 12 个，其余文件与符号信息缺失。
2. `services` 无任何 `topSymbols` 与文件级符号，其内部函数/类签名不可核实。
3. `core` 无任何 `topSymbols` 与文件级符号，且除首次提交信息外无职责自述，`scanner.ts` / `types.ts` 的实际功能待确认。
4. 各模块间的具体调用点（调用方 → 被调用方）未在数据中提供，交互关系仅有模块级 dependsOn / usedBy 方向。

## 模块详解（第2批）

本批覆盖 2 个模块：`shared`、`cli`（依据 `modules[]` 数据顺序）。两模块均为纯 TypeScript（`languages: [{language: "ts"}]`），无需按语言拆分职责域。

### shared 模块


`shared` 由 4 个 TypeScript 文件组成，作为被上层模块复用的基础层存在。数据中仅有两个文件携带可直接引用的职责自述：

- 全局配置层：负责从 `~/.scx/wiki-agent/config.yaml` 读取 YAML 配置，并定义配置优先级与容错策略。原文见 `src/shared/config.ts:1`：「全局配置：~/.scx/wiki-agent/config.yaml（YAML）。 优先级：CLI 参数 > 全局配置文件 > 内置默认。 api_key 支持 `${ENV_VAR}` 环境变量引用（展开失败置空并告警，不把字面量发往 API）。 配置缺失/解析失败一律降级为「无配置」并告警，绝不阻断构建。」
- 多语言源码模式层：负责为 Python / Go / JVM 提供行、注释形态与限制常量，并以「域 → 模式组」的组织方式供调用方按域分发。原文见 `src/shared/language-patterns.ts:1`：「多语言源码模式层（Python / Go / JVM）：定义行、注释形态、限制常量。 TS/Rust 的既有正则留在原模块（intent/shared、source-fallback）；本模块 以「域 → 模式组」的方式补齐其余语言域，调用方按域分发。」

其余文件（`src/shared/constants.ts`、`src/shared/utils.ts`）在本次数据中没有任何符号、docstring 或 intent 证据，其职责**信息不足**（详见本模块「待确认」）。


- 配置读取的失败隔离：`src/shared/config.ts:1` 明确承诺「配置缺失/解析失败一律降级为「无配置」并告警，绝不阻断构建」，即配置层被设计为**不具阻断能力**的基础设施，保证构建流程在任何配置状态下都能继续。
- 敏感值的间接注入：`src/shared/config.ts:1` 的 `${ENV_VAR}` 引号展开规则「展开失败置空并告警，不把字面量发往 API」，说明 api_key 的注入路径被刻意设计为「要么是真值，要么为空」，避免把未展开的字面量当作密钥外发。
- 模式层的域化与分工：`src/shared/language-patterns.ts:1` 说明了职责边界的划分理由——TS/Rust 的既有正则**不迁移**，留在旧模块（intent/shared、source-fallback），本文件只承担 Python/Go/JVM 等其余语言域，形成「按域分发」的组织方式而非单一集中式正则表。
- 模块角色（推断）：`shared` 的 `dependsOn` 为空、`usedBy` 为 `knowledge`、`core`、`cli`（模块依赖元数据），依赖方向单向朝外，符合「无依赖的共享底座」定位。推断依据：依赖方向与模块命名，无 file:line 级调用点证据。
- 时间线证据：`commit:76565d14 (2026-06-02)`「首次提交：feat: 功能基本可用」，说明该模块在首个可用版本即已存在，属于随项目骨架一同建立的基础层。


| 方向 | 对端 | 说明 | 证据 |
| --- | --- | --- | --- |
| 本模块 → 其他 | 无 | `dependsOn` 为空，`shared` 不依赖任何其他模块 | 模块依赖元数据（`shared.dependsOn`），无 file:line 级证据 |
| 其他 → 本模块 | `knowledge`、`core`、`cli` | 三个上层模块复用本模块提供的配置、常量、语言模式与工具 | 模块依赖元数据（`shared.usedBy`），无 file:line 级证据 |

配置优先级「CLI 参数 > 全局配置文件 > 内置默认」（`src/shared/config.ts:1`）与 `cli` 模块的高频提交主题「支持全局配置（×2）」（`commit:19eb6f9f (2026-09-29)`）在语义上互相呼应，是本模块被 `cli` 依赖的具体落点。


| 文件 | 关键符号 | 职责 |
| --- | --- | --- |
| `src/shared/config.ts` | 数据未提供符号（`fileSymbols.symbols` 为空） | 全局配置加载：`~/.scx/wiki-agent/config.yaml`，CLI 参数 > 配置文件 > 内置默认；`${ENV_VAR}` 展开；失败降级不阻断（`src/shared/config.ts:1`） |
| `src/shared/language-patterns.ts` | 数据未提供符号 | Python / Go / JVM 的行、注释形态与限制常量，按「域 → 模式组」组织，调用方按域分发（`src/shared/language-patterns.ts:1`） |
| `src/shared/constants.ts` | 数据未提供符号 | 信息不足（无 docstring、无 intent、无调用点证据） |
| `src/shared/utils.ts` | 数据未提供符号 | 信息不足（无 docstring、无 intent、无调用点证据） |


本模块 `topSymbols` 为空数组，所有 `fileSymbols[].symbols` 亦为空数组，因此**没有任何 file:line 级符号证据**可用于描述函数签名或 docstring。

**待确认**：缺 `shared` 模块的符号清单（`topSymbols` / `fileSymbols` 均为空），无法给出该模块导出函数/常量的签名与用途；需重新采集带行号的符号索引。

**待确认**：`src/shared/constants.ts` 与 `src/shared/utils.ts` 无任何职责证据（无 intent、无符号、无调用点），无法判断其内容边界，也无法判断是否仅被 `shared` 内部使用。

### cli 模块


`cli` 由 6 个 TypeScript 文件组成，是项目对外暴露的命令入口与会话交互层。数据中可直接引用的职责来自一个文件自述：

- 待确认项交互会话（`src/cli/confirm-interaction.ts:1`）：「待确认项交互会话（@clack/prompts）。 注入 WikiBuildOptions.confirmSession，在全部页面生成后、写盘前调用一次： 逐项展示「疑问 + 上下文 + 选项」，用户裁决确认或保持。 安全性：非 TTY（CI/管道/测试）直接返回空（全部保持待确认）； Ctrl-C 中断时保留已裁决项，其余按保持处理。」

由此可确证的三点行为事实：
1. 交互以依赖注入方式接入：通过 `WikiBuildOptions.confirmSession` 注入（`src/cli/confirm-interaction.ts:1`）；
2. 调用时机固定：在**全部页面生成后、写盘前调用一次**（`src/cli/confirm-interaction.ts:1`）；
3. 降级语义明确：非 TTY（CI/管道/测试）返回空即全部保持待确认；Ctrl-C 保留已裁决项、其余按保持处理（`src/cli/confirm-interaction.ts:1`）。

其余文件（`src/cli/index.ts`、`src/cli/commands/build.ts`、`src/cli/commands/init.ts`、`src/cli/commands/scan.ts`、`src/cli/commands/types.ts`）在本次数据中没有符号或 docstring 证据，其具体命令签名与参数**信息不足**。


- 人机裁决点被放在流程末端：交互只在「全部页面生成后、写盘前」触发一次（`src/cli/confirm-interaction.ts:1`），说明设计上把用户裁决作为写盘前的最后一道确认闸门，而不是逐阶段打断生成过程。
- 非交互环境优先：非 TTY 一律返回空（`src/cli/confirm-interaction.ts:1`），说明该能力被设计为「可选增强」而非构建必需环节，与 `shared` 配置层「绝不阻断构建」（`src/shared/config.ts:1`）的容错取向一致。
- 中断可恢复：Ctrl-C 保留已裁决项（`src/cli/confirm-interaction.ts:1`），说明交互过程被设计为增量可提交，避免用户决策因中断全部丢失。
- 演进活跃度：`commit:19eb6f9f (2026-09-29)` 记录的高频提交主题为「功能基本可用（×4）、修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）、支持全局配置（×2）」，表明 `cli` 是持续修复与功能补齐的主战场，涉及探测误报、图谱边、llm 页面生成路径与全局配置四类主题。
- 起点：`commit:76565d14 (2026-06-02)`「首次提交：feat: 功能基本可用」表明该模块同样自首个可用版本即存在。


| 方向 | 对端 | 说明 | 证据 |
| --- | --- | --- | --- |
| 本模块 → 其他 | `shared` | 复用配置/常量/语言模式/工具 | 模块依赖元数据（`cli.dependsOn`），无 file:line 级证据 |
| 本模块 → 其他 | `services` | 调用服务层完成实际构建/扫描动作 | 模块依赖元数据（`cli.dependsOn`），无 file:line 级证据 |
| 本模块 → 其他 | `core` | 复用核心领域能力 | 模块依赖元数据（`cli.dependsOn`），无 file:line 级证据 |
| 本模块 → 其他 | `mcp` | 与 MCP 相关能力对接 | 模块依赖元数据（`cli.dependsOn`），无 file:line 级证据 |
| 其他 → 本模块 | `knowledge` | 被 `knowledge` 模块依赖 | 模块依赖元数据（`cli.usedBy`），无 file:line 级证据 |

本模块的对外协作契约之一是 `WikiBuildOptions.confirmSession` 注入点（`src/cli/confirm-interaction.ts:1`）：交互会话不是被直接调用，而是作为回调注入构建选项，由构建流程在写盘前触发。


| 文件 | 关键符号 | 职责 |
| --- | --- | --- |
| `src/cli/index.ts` | 数据未提供符号 | 信息不足（无 docstring/intent 证据，具体入口行为待确认） |
| `src/cli/commands/build.ts` | 数据未提供符号 | 信息不足（无符号证据，无法给出命令签名与行为） |
| `src/cli/commands/init.ts` | 数据未提供符号 | 信息不足（无符号证据） |
| `src/cli/commands/scan.ts` | 数据未提供符号 | 信息不足（无符号证据） |
| `src/cli/commands/types.ts` | 数据未提供符号 | 信息不足（无符号证据） |
| `src/cli/confirm-interaction.ts` | 数据未提供符号 | 待确认项交互会话（`@clack/prompts`）；经 `WikiBuildOptions.confirmSession` 注入；页面全生成后、写盘前调用一次；非 TTY 返回空；Ctrl-C 保留已裁决项（`src/cli/confirm-interaction.ts:1`） |


本模块 `topSymbols` 为空数组，所有 `fileSymbols[].symbols` 亦为空数组，**无 file:line 级符号证据**，无法给出 `build` / `init` / `scan` 等入口函数的签名、参数与返回类型。唯一可确定的核心角色是注释中出现的注入点 `WikiBuildOptions.confirmSession`（`src/cli/confirm-interaction.ts:1`），其定义位置与签名在本批数据中未提供。

**待确认**：缺 `cli` 模块的符号清单（`topSymbols` / `fileSymbols` 均为空），无法列出 CLI 子命令名、参数 schema 与 `WikiBuildOptions` 定义所在文件:行号；需重新采集带行号的符号索引。

**待确认**：`src/cli/commands/` 下四个文件（`build.ts`、`init.ts`、`scan.ts`、`types.ts`）无任何符号或 intent 证据，无法确认它们是各自独立注册的子命令还是共用同一分发器，也**无法确认 `init` 与 `scan` 的实际行为**（仅凭文件名不足以作事实声明）。
## Related

- 同目录：[architecture.md](architecture.md)
- 互补职责：[architecture.md](../02-architecture/architecture.md)
- 共享 9 个源文件、共享 18 个符号：[troubleshooting.md](../05-guides/troubleshooting.md)
- 共享 7 个源文件、共享 16 个符号：[onboarding.md](../05-guides/onboarding.md)
- 共享 4 个源文件、共享 19 个符号：[topic:topic-9.md](../08-topics/topic-9.md)
- 总入口：[README](../README.md)
