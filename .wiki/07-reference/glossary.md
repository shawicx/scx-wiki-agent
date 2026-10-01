# 核心概念

<details>
<summary>Relevant source files</summary>

- src/core/scanner.ts
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
- src/knowledge/wiki-builder.ts
</details>

| 名称 | 类型 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| Claim | interface |  | 单个声明：raw = 反引号内原文（改写定位），chain = 完整点链（优先核验），name = 末段标识符（回退核验/探测） | src/knowledge/claim-verifier.ts:22 |
| GenerationOutcome | interface |  | 带续写统计的一节/一页生成结果 | src/knowledge/generator/shared.ts:22 |
| OrderInfo | interface |  | // 3. 符号排序键与调用点行 | src/knowledge/dataflow/index.ts:148 |
| StreamOutcome | interface |  | 单轮流式生成的产出与终止原因 | src/knowledge/generator/shared.ts:15 |
| adaptArchitecture | function | (raw: Record<string, any>) | get_architecture 列式表 → ArchitectureData 对象数组 | src/mcp/codebase-memory-client.ts:45 |
| adaptTrace | function | (raw: Record<string, any>) | trace_path 分组列式表 → 扁平 TraceNode[] | src/mcp/codebase-memory-client.ts:92 |
| addBulletList | method | (items: string[]) | Add a bullet list. | src/knowledge/wiki-builder.ts:50 |
| addCodeBlock | method | (language: string, code: string) | Add a fenced code block with an optional language hint. | src/knowledge/wiki-builder.ts:35 |
| addNewline | method | () | Add an empty line. | src/knowledge/wiki-builder.ts:56 |
| addParagraph | method | (text: string) | Add a plain paragraph. | src/knowledge/wiki-builder.ts:29 |
| addSection | method | (title: string, content: string) | Add a second-level section: `## title` +（content 非空时）`\ \ content` | src/knowledge/wiki-builder.ts:17 |
| addSubSection | method | (title: string, content: string) | Add a third-level sub-section: `### title` +（content 非空时）`\ \ content` | src/knowledge/wiki-builder.ts:23 |
| addTable | method | (headers: string[], rows: string[][]) | Add a markdown table from headers and rows. | src/knowledge/wiki-builder.ts:41 |
| addTitle | method | (title: string) | Add a top-level title: `# title` | src/knowledge/wiki-builder.ts:11 |
| appendSourceFallback | function | (deps: ContextDeps, existing: Array<{ name: string }>) | 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。 找到的名字记入 fallbackSymbolNames（供断言校验 universe 回填）。 | src/knowledge/context/shared.ts:288 |
| archSnapshot | function | (deps: ContextDeps) | 架构快照（与 context/architecture.ts 同缓存位，避免循环依赖的本文件内联版） | src/knowledge/context/intent-ranking.ts:17 |
| asObjects | function | (raw: Record<string, unknown>, key: string) | 兼容两种形态：旧版对象数组 / 新版列式表 | src/mcp/codebase-memory-client.ts:35 |
| build | method | () | Join all sections with newlines and return the final document. | src/knowledge/wiki-builder.ts:62 |
| buildArchitectureSections | function | (ctx: ArchitectureContext) | 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 | src/knowledge/generator/structure.ts:15 |
| buildByName | method | (page: string, plannedPages?: string[]) | 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 | src/knowledge/context/index.ts:99 |
| buildEdges | function | (deps: ContextDeps, packages: PkgInfo[]) | 包间依赖边聚合（from → to: import 计数 + 是否声明） | src/knowledge/context/workspaces.ts:106 |
| buildGlossarySections | function | (ctx: GlossaryContext) | 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化）， 贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节。 | src/knowledge/generator/structure.ts:229 |
| buildInputs | method | (topics: TopicDefinition[], feedback?: string) | 确定性组装规划输入（全部真实数据，无臆造字段） | src/knowledge/outline-planner.ts:70 |
| buildModulesSections | function | (ctx: ModulesContext) | 模块页确定性节表：组织方式概述 → 模块详解（≤4 个/批）→ 其他模块汇总 | src/knowledge/generator/structure.ts:118 |
| chainCandidates | function | (chain: string) | 点链的核验候选序列：全串 → 去首段 → … → 末段（qualified 优先，回退到短名） | src/knowledge/claim-verifier.ts:106 |
| churnEvidence | method | (limit: number) | 高频变更信号（troubleshooting 维护风险 / decisions 热点） | src/knowledge/intent/provider.ts:170 |
| collectDataFlowShapeEvidence | function | (deps: ContextDeps, facts: TransitionFacts[]) | 数据形态证据采集：一次查询批量取参与者符号事实（签名/返回类型/函数体范围） 与本地类型定义节点，交 data-flow-shape 纯函数模块做确定性组装。 | src/knowledge/context/data-flow.ts:86 |
| collectImportedPackages | method | (files: ScannedFile[]) | 扫描源文件，提取所有 import 语句引用的包名。 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。 覆盖 ES import / require / 动态 import，以及 CSS `@import \"pkg\"… | src/core/scanner.ts:192 |
| collectMatches | function | (line: string, re: RegExp, cb: (name: string) => void) | 重置全局正则 lastIndex 后逐命中回调（全局正则在行级复用） | src/knowledge/tauri-ipc.ts:138 |
| computeAffinity | function | (\n  fingerprints: ReadonlyMap<string, PageFingerprint>,\n) | 页面间亲和度：共享源码文件数 + 共享反引号术语数 | src/knowledge/crosspage/index.ts:24 |

## 本页确定知道的事实

- 核心符号 30 个（图谱检出，按 类 → 方法 → 函数 → 接口 排序）
- 带 docstring 说明的符号 30 个，说明列为第一段确定性摘要
## Related

- 同目录：[calls.md](calls.md) · [classes.md](classes.md)
- 互补职责：[calls.md](../07-reference/calls.md)
- 共享 4 个源文件：[modules.md](../02-architecture/modules.md)
- 共享 3 个源文件：[overview.md](../01-overview/overview.md)
- 共享 3 个源文件：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)
