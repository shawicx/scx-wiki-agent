<details>
<summary>Relevant source files</summary>

- src/core/scanner.ts
- src/mcp/codebase-memory-client.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/context/data-flow.ts
- src/knowledge/context/index.ts
- src/knowledge/context/intent-ranking.ts
- src/knowledge/context/shared.ts
- src/knowledge/context/workspaces.ts
- src/knowledge/crosspage/index.ts
- src/knowledge/dataflow/index.ts
- src/knowledge/generator/shared.ts
- src/knowledge/generator/structure.ts
- src/knowledge/intent/provider.ts
- src/knowledge/outline-planner.ts
- src/knowledge/tauri-ipc.ts
</details>

## 关键概念（第1批·knowledge）

本节列出 `src/knowledge` 下各子模块在数据中给出的关键接口与函数，覆盖「Markdown 构建 → 页面结构规划 → 上下文/证据采集 → 声明核验 → 大纲组装」这条链路。这些符号是理解本目录职责边界的主要抓手：接口定义了流式生成与声明核验的数据契约，函数则按「确定性组装」与「证据采集」两类分工。签名与说明优先取自源码 docstring，docstring 缺失处按符号名与类型标注「推断」。

| 分组（子模块） | 代表文件 | 本批符号数 |
| --- | --- | --- |
| Markdown 构建器 | src/knowledge/wiki-builder.ts | 9 |
| 确定性节表生成 | src/knowledge/generator/ | 5 |
| 上下文构建（context） | src/knowledge/context/ | 5 |
| 声明核验 | src/knowledge/claim-verifier.ts | 2 |
| 数据流 | src/knowledge/dataflow/index.ts | 1 |
| 意图信号 | src/knowledge/intent/provider.ts | 1 |
| Tauri IPC | src/knowledge/tauri-ipc.ts | 1 |
| 跨页关联 | src/knowledge/crosspage/index.ts | 1 |
| 大纲规划 | src/knowledge/outline-planner.ts | 1 |

### Markdown 构建器（src/knowledge/wiki-builder.ts）

该组符号构成一个链式的文档拼装器：`add*` 系列方法逐段追加标题、段落、代码块、表格等 Markdown 片段，`build` 在末尾把所有片段拼接为最终文档。它们本身不含业务判断，只负责把上游生成的内容落成规范化 Markdown，是各页面生成流程共用的输出层。

| 名称 | 类型 | 签名 | 说明 | 所属文件 |
| --- | --- | --- | --- | --- |
| addTitle | method | `(title: string)` | Add a top-level title: `# title` | src/knowledge/wiki-builder.ts:11 |
| addSection | method | `(title: string, content: string)` | Add a second-level section: `## title` +（content 非空时）换行接 content | src/knowledge/wiki-builder.ts:17 |
| addSubSection | method | `(title: string, content: string)` | Add a third-level sub-section: `### title` +（content 非空时）换行接 content | src/knowledge/wiki-builder.ts:23 |
| addParagraph | method | `(text: string)` | Add a plain paragraph. | src/knowledge/wiki-builder.ts:29 |
| addCodeBlock | method | `(language: string, code: string)` | Add a fenced code block with an optional language hint. | src/knowledge/wiki-builder.ts:35 |
| addTable | method | `(headers: string[], rows: string[][])` | Add a markdown table from headers and rows. | src/knowledge/wiki-builder.ts:41 |
| addBulletList | method | `(items: string[])` | Add a bullet list. | src/knowledge/wiki-builder.ts:50 |
| addNewline | method | `()` | Add an empty line. | src/knowledge/wiki-builder.ts:56 |
| build | method | `()` | Join all sections with newlines and return the final document. | src/knowledge/wiki-builder.ts:62 |

### 确定性节表生成（src/knowledge/generator/）

`generator/structure.ts` 提供各页面类型的**确定性节表**（不依赖模型自由发挥），`generator/shared.ts` 定义流式生成与「节/页」粒度的产出契约。两者合起来回答「一页由哪些节组成、每节生成结果长什么样」。

| 名称 | 类型 | 签名 | 说明 | 所属文件 |
| --- | --- | --- | --- | --- |
| StreamOutcome | interface | — | 单轮流式生成的产出与终止原因 | src/knowledge/generator/shared.ts:15 |
| GenerationOutcome | interface | — | 带续写统计的一节/一页生成结果 | src/knowledge/generator/shared.ts:22 |
| buildArchitectureSections | function | `(ctx: ArchitectureContext)` | 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 | src/knowledge/generator/structure.ts:15 |
| buildModulesSections | function | `(ctx: ModulesContext)` | 模块页确定性节表：组织方式概述 → 模块详解（≤4 个/批）→ 其他模块汇总 | src/knowledge/generator/structure.ts:118 |
| buildGlossarySections | function | `(ctx: GlossaryContext)` | 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化），贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节 | src/knowledge/generator/structure.ts:229 |

### 上下文构建（src/knowledge/context/）

该组是页面生成的「证据层」：`buildByName` 是页面级的统一入口，按页面名派发到各上下文构建器；其余符号分别负责架构快照缓存、包间依赖边聚合、源码回落补名、数据流形态证据批量采集。整体职责是**从代码图谱与源码中抽取真实事实**，供上层节表与 LLM 使用。

| 名称 | 类型 | 签名 | 说明 | 所属文件 |
| --- | --- | --- | --- | --- |
| buildByName | method | `(page: string, plannedPages?: string[])` | 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 | src/knowledge/context/index.ts:99 |
| archSnapshot | function | `(deps: ContextDeps)` | 架构快照（与 context/architecture.ts 同缓存位，避免循环依赖的本文件内联版） | src/knowledge/context/intent-ranking.ts:17 |
| buildEdges | function | `(deps: ContextDeps, packages: PkgInfo[])` | 包间依赖边聚合（from → to: import 计数 + 是否声明） | src/knowledge/context/workspaces.ts:106 |
| collectDataFlowShapeEvidence | function | `(deps: ContextDeps, facts: TransitionFacts[])` | 数据形态证据采集：一次查询批量取参与者符号事实（签名/返回类型/函数体范围）与本地类型定义节点，交 data-flow-shape 纯函数模块做确定性组装 | src/knowledge/context/data-flow.ts:86 |
| appendSourceFallback | function | `(deps: ContextDeps, existing: Array<{ name: string }>)` | 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。找到的名字记入 fallbackSymbolNames（供断言校验 universe 回填） | src/knowledge/context/shared.ts:288 |

### 声明核验（src/knowledge/claim-verifier.ts）

文档中出现反引号术语或点链时，需要判断其在代码中是否真实存在——`Claim` 定义了一条待核验声明的三段式结构，`chainCandidates` 给出点链的逐级回退候选序列，二者共同支撑「先按完整点链核验，失败再退到末段短名」的判定流程。

| 名称 | 类型 | 签名 | 说明 | 所属文件 |
| --- | --- | --- | --- | --- |
| Claim | interface | — | 单个声明：raw = 反引号内原文（改写定位），chain = 完整点链（优先核验），name = 末段标识符（回退核验/探测） | src/knowledge/claim-verifier.ts:22 |
| chainCandidates | function | `(chain: string)` | 点链的核验候选序列：全串 → 去首段 → … → 末段（qualified 优先，回退到短名） | src/knowledge/claim-verifier.ts:106 |

### 其余单点符号

以下符号各自属于独立的子模块，按文件分组列出。

| 名称 | 类型 | 签名 | 说明 | 所属文件 |
| --- | --- | --- | --- | --- |
| OrderInfo | interface | — | 数据中仅给出注释「3. 符号排序键与调用点行」；字段构成信息不足，按其所属的 dataflow 模块推断为承载符号排序键与调用点行号（推断） | src/knowledge/dataflow/index.ts:148 |
| churnEvidence | method | `(limit: number)` | 高频变更信号（troubleshooting 维护风险 / decisions 热点） | src/knowledge/intent/provider.ts:170 |
| collectMatches | function | `(line: string, re: RegExp, cb: (name: string) => void)` | 重置全局正则 lastIndex 后逐命中回调（全局正则在行级复用） | src/knowledge/tauri-ipc.ts:138 |
| computeAffinity | function | `(fingerprints: ReadonlyMap<string, PageFingerprint>)` | 页面间亲和度：共享源码文件数 + 共享反引号术语数 | src/knowledge/crosspage/index.ts:24 |
| buildInputs | method | `(topics: TopicDefinition[], feedback?: string)` | 确定性组装规划输入（全部真实数据，无臆造字段） | src/knowledge/outline-planner.ts:70 |

**待确认**：本批 4 个接口（`Claim`、`GenerationOutcome`、`OrderInfo`、`StreamOutcome`）在数据中均只给出名称、docstring 与位置，未提供字段列表，因此无法描述其完整数据契约，需要接口体声明作为补充证据。

## 关键概念（第2批·mcp/core）

### mcp 模块：codebase-memory 客户端响应适配

该组符号位于 `src/mcp/codebase-memory-client.ts`，职责是把 codebase-memory MCP 服务返回的「列式表」响应统一转换为前端/调用方消费的对象数组或扁平节点数组。`asObjects` 是基础兼容层，负责在旧版对象数组与新版列式表两种响应形态之间做归一化；`adaptArchitecture` 与 `adaptTrace` 是面向具体 MCP 工具（get_architecture、trace_path）的专用适配器。

| 名称 | 类型 | 签名 | 说明 | 所属文件 |
| --- | --- | --- | --- | --- |
| `asObjects` | function | `(raw: Record<string, unknown>, key: string)` | 兼容两种形态：旧版对象数组 / 新版列式表（来自 docstring） | src/mcp/codebase-memory-client.ts:35 |
| `adaptArchitecture` | function | `(raw: Record<string, any>)` | get_architecture 列式表 → ArchitectureData 对象数组（来自 docstring） | src/mcp/codebase-memory-client.ts:45 |
| `adaptTrace` | function | `(raw: Record<string, any>)` | trace_path 分组列式表 → 扁平 TraceNode[]（来自 docstring） | src/mcp/codebase-memory-client.ts:92 |

从三者关系看，`adaptArchitecture`/`adaptTrace` 的输出类型（`ArchitectureData`、`TraceNode`）与 `asObjects` 的列式表归一化职责互补：前者处理「行→对象」的字段映射，后者处理「列式/对象数组」的形态判定。这一分层为**推断**，依据是两个专用适配器与通用兼容函数共处同一文件、且 docstring 均以「某 MCP 工具返回结构 → 目标结构」的转换句式描述（src/mcp/codebase-memory-client.ts:35、:45、:92）。

### core 模块：源文件依赖扫描

该组符号位于 `src/core/scanner.ts`，职责是从已扫描的源文件中提取真实被引用的依赖包名。

| 名称 | 类型 | 签名 | 说明 | 所属文件 |
| --- | --- | --- | --- | --- |
| `collectImportedPackages` | method | `(files: ScannedFile[])` | 扫描源文件，提取所有 import 语句引用的包名。只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。覆盖 ES import / require / 动态 import，以及 CSS `@import "pkg"`（tailwind 插件类依赖的常见引入方式，如 tw-animate-css）。（来自 docstring） | src/core/scanner.ts:238 |

该方法是「死依赖过滤」链路中产生实际使用证据的一环：入参为 `ScannedFile[]`，输出为被 import 的包名集合（输出形态由 docstring 描述确定，未在数据中给出显式返回类型）。其覆盖范围包含 ES import、require、动态 import 三类 JS/TS 语法及 CSS `@import "pkg"`，后者用于捕获 tailwind 插件类依赖（如 docstring 举例的 tw-animate-css）。

**待确认**
- 上述四个符号的调用方未被数据覆盖（本批未提供调用边），因此无法给出调用关系表；需补充引用点后确认它们在扫描/适配流程中的接入位置。
- `collectImportedPackages` 的类型标记为 `method`，但其所属类/对象在本批数据中未给出，需补充宿主声明。
## Related

- 同目录：[calls.md](calls.md) · [classes.md](classes.md)
- 互补职责：[calls.md](../07-reference/calls.md)
- 共享 3 个源文件、共享 15 个符号：[api.md](../03-interface/api.md)
- 共享 3 个源文件、共享 14 个符号：[modules.md](../02-architecture/modules.md)
- 共享 4 个源文件、共享 9 个符号：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)
