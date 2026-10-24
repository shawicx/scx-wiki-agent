# 核心概念

<details>
<summary>Relevant source files</summary>

- src/knowledge/claim-verifier.ts
- src/knowledge/config-detector/package-manager.ts
- src/knowledge/context/frontend.ts
- src/knowledge/context/intent-ranking.ts
- src/knowledge/context/shared.ts
- src/knowledge/context/workspaces.ts
- src/knowledge/dataflow/index.ts
- src/knowledge/fallback/index.ts
- src/knowledge/generator/shared.ts
- src/knowledge/generator/structure.ts
- src/knowledge/ghost-links.ts
- src/knowledge/intent/provider.ts
- src/knowledge/outline-planner.ts
- src/knowledge/tauri-ipc.ts
- src/knowledge/wiki-builder.ts
</details>

| 名称 | 类型 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| Claim | interface | - | 单个声明：raw = 反引号内原文（改写定位），chain = 完整点链（优先核验），name = 末段标识符（回退核验/探测） | src/knowledge/claim-verifier.ts:22 |
| GenerationOutcome | interface | - | 带续写统计的一节/一页生成结果 | src/knowledge/generator/shared.ts:22 |
| NativeManifestHit | interface | - | 单个目录的原生运行态探测结果（packageName/version 仅部分清单可提取） | src/knowledge/config-detector/package-manager.ts:95 |
| OrderInfo | interface | - | // 3. 符号排序键与调用点行 | src/knowledge/dataflow/index.ts:148 |
| StreamOutcome | interface | - | 单轮流式生成的产出与终止原因 | src/knowledge/generator/shared.ts:15 |
| adaptArchitecture | function | (raw: Record<string, any>): : ArchitectureData | get_architecture 列式表 → ArchitectureData 对象数组 | src/mcp/codebase-memory-client.ts:45 |
| adaptTrace | function | (raw: Record<string, any>): : TraceResult | trace_path 分组列式表 → 扁平 TraceNode[] | src/mcp/codebase-memory-client.ts:92 |
| addBulletList | method | (items: string[]): : this | Add a bullet list. | src/knowledge/wiki-builder.ts:50 |
| addCodeBlock | method | (language: string, code: string): : this | Add a fenced code block with an optional language hint. | src/knowledge/wiki-builder.ts:35 |
| addNewline | method | (): : this | Add an empty line. | src/knowledge/wiki-builder.ts:56 |
| addParagraph | method | (text: string): : this | Add a plain paragraph. | src/knowledge/wiki-builder.ts:29 |
| addSection | method | (title: string, content: string): : this | Add a second-level section: `## title` +（content 非空时）`\ \ content` | src/knowledge/wiki-builder.ts:17 |
| addSubSection | method | (title: string, content: string): : this | Add a third-level sub-section: `### title` +（content 非空时）`\ \ content` | src/knowledge/wiki-builder.ts:23 |
| addTable | method | (headers: string[], rows: string[][]): : this | Add a markdown table from headers and rows. | src/knowledge/wiki-builder.ts:41 |
| addTitle | method | (title: string): : this | Add a top-level title: `# title` | src/knowledge/wiki-builder.ts:11 |
| appendSourceFallback | function | (deps: ContextDeps, existing: Array<{ name: string }>): : SupplementalSymbol[] | 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。 找到的名字记入 fallbackSymbolNames（供断言校验 universe 回填）。 | src/knowledge/context/shared.ts:288 |
| archSnapshot | function | (deps: ContextDeps): : ArchitectureData | 架构快照（与 context/architecture.ts 同缓存位，避免循环依赖的本文件内联版） | src/knowledge/context/intent-ranking.ts:17 |
| asObjects | function | (raw: Record<string, unknown>, key: string): : Array<Record<string, unknown>> | 兼容两种形态：旧版对象数组 / 新版列式表 | src/mcp/codebase-memory-client.ts:35 |
| balancedSlice | function | (src: string, start: number, open: string, close: string): : string | null | 从 start 起取平衡的开闭符内容（不平衡返回 null） | src/knowledge/context/frontend.ts:50 |
| blankCallGenerics | function | (src: string): : string | 平衡（≤2 层）尖括号泛型实参段空白化：`invoke<Array<{…}>>('cmd')` / `listen<Payload>('evt')` 的泛型段替换为等长空白（保留换行），使行号反查仍然精确。 | src/knowledge/tauri-ipc.ts:55 |
| build | method | (): : string | Join all sections with newlines and return the final document. | src/knowledge/wiki-builder.ts:62 |
| buildArchitectureSections | function | (ctx: ArchitectureContext): : PageConfig[] | 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 | src/knowledge/generator/structure.ts:15 |
| buildByName | method | (page: string, ctx: any): : string | 按页面名派发规则生成（供 PageRegistry 调用）；未注册页返回空串（上游 null-context 已拦截） | src/knowledge/fallback/index.ts:90 |
| buildEdges | function | (deps: ContextDeps, packages: PkgInfo[]): : WorkspacesContext['edges'] | 包间依赖边聚合（from → to: import 计数 + 是否声明） | src/knowledge/context/workspaces.ts:106 |
| buildGlossarySections | function | (ctx: GlossaryContext): : PageConfig[] | 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化）， 贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节。 | src/knowledge/generator/structure.ts:233 |
| buildInputs | method | (topics: TopicDefinition[], feedback?: string): : Record<string, unknown> | 确定性组装规划输入（全部真实数据，无臆造字段） | src/knowledge/outline-planner.ts:70 |
| buildModulesSections | function | (ctx: ModulesContext): : PageConfig[] | 模块页确定性节表：组织方式概述 → 模块详解（≤4 个/批）→ 其他模块汇总 | src/knowledge/generator/structure.ts:120 |
| candidateNames | function | (plannedPaths: ReadonlySet<string>): : Set<string> | 计算剥离用的候选名集合（注册页名 + 主题/章节页文件名形态） | src/knowledge/ghost-links.ts:17 |
| chainCandidates | function | (chain: string): : string[] | 点链的核验候选序列：全串 → 去首段 → … → 末段（qualified 优先，回退到短名） | src/knowledge/claim-verifier.ts:106 |
| churnEvidence | method | (limit: number): : IntentEvidence[] | 高频变更信号（troubleshooting 维护风险 / decisions 热点） | src/knowledge/intent/provider.ts:173 |

## 本页确定知道的事实

- 核心符号 30 个（图谱检出，按 类 → 方法 → 函数 → 接口 排序）
- 带 docstring 说明的符号 30 个，说明列为第一段确定性摘要
## Related

- 同目录：[calls.md](calls.md) · [classes.md](classes.md)
- 互补职责：[calls.md](../07-reference/calls.md)
- 共享 2 个源文件：[overview.md](../01-overview/overview.md)
- 共享 2 个源文件：[onboarding.md](../05-guides/onboarding.md)
- 共享 2 个源文件：[troubleshooting.md](../05-guides/troubleshooting.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
