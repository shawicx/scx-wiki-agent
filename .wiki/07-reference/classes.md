# Classes

<details>
<summary>Relevant source files</summary>

- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/services/wiki-service.ts
</details>

> ⚠️ **待确认**：MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现（证据不足，禁止猜测；请人工补充后移除本标记）

## WikiContextBuilder

源文件：`src/knowledge/wiki-context-builder.ts:64`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-context-builder.WikiContextBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n    private detector: ConfigDetector,\n  )` |  | src/knowledge/wiki-context-builder.ts:65 |
| setIntentProvider |  | `(provider: IntentEvidenceProvider)` |  | src/knowledge/wiki-context-builder.ts:82 |
| setTopics |  | `(topics: TopicDefinition[])` |  | src/knowledge/wiki-context-builder.ts:86 |
| setOutlineChapters |  | `(chapters: OutlineChapter[])` |  | src/knowledge/wiki-context-builder.ts:90 |
| buildByName |  | `(page: string, plannedPages?: string[])` | /** 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 */ | src/knowledge/wiki-context-builder.ts:95 |
| dispatchContext |  | `(page: string, plannedPages?: string[])` |  | src/knowledge/wiki-context-builder.ts:101 |
| enrichIfThinEvidence |  | `(page: string, ctx: unknown)` | /**\n   * 证据补强（DeepWiki「二次扩展检索」的图谱版）：\n   * LLM 路径的 structure 页证据文件低于下限时，从图谱补一批高复杂度真实符号，\n   * 只保留扫描清单内的文件路径。图谱查无的热点/入口名回落源码正则探测\n   * （mcp 对 .vue/部分 Rust 索引不全，避免 LLM 把真实符号标成「待确认」）。\n   */ | src/knowledge/wiki-context-builder.ts:133 |
| appendSourceFallback |  | `(existing: Array<{ name: string }>)` | /**\n   * 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。\n   * 找到的名字记入 fallbackSymbolNames（供断言校验 universe 回填）。\n   */ | src/knowledge/wiki-context-builder.ts:168 |
| getKnownFiles |  | `()` |  | src/knowledge/wiki-context-builder.ts:182 |
| prepareIntentModules |  | `(pkgNames: string[])` | /** 模块级意图证据预聚合（构建内幂等）：候选文件按体积降序作重要性代理，\n *  提供方内部截 GIT_FILE_CAP 控住子进程成本 */ | src/knowledge/wiki-context-builder.ts:191 |
| buildOverviewContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:201 |
| exampleFilesForLanguage |  | `(language: string)` | /** 语言名 → 扫描清单内真实文件样本（≤3 个，优先生产代码） */ | src/knowledge/wiki-context-builder.ts:246 |
| buildDepUsage |  | `()` | /**\n   * 技术栈依赖的使用证据（overview/onboarding/troubleshooting 等元数据页用）。\n   * 依赖名本身有 package.json 声明实据；用途证据分三级：生产 import 点 /\n   * 测试文件 import 点 / scripts 命令引用（如 vitest 仅由 `vitest run` 触发）。\n   * usageKind ≠ none 的依赖严禁被写成「声明未用」——防止把测试/脚本型工具\n   * 误标成死依赖（R5 噪音大头）。\n   */ | src/knowledge/wiki-context-builder.ts:274 |
| declaredPackageDeps |  | `()` |  | src/knowledge/wiki-context-builder.ts:303 |
| getDepNames |  | `()` | /** 依赖名全集（声明名 + techStack 探测名）：断言校验 universe 回填用。\n   *  正文反引号里的依赖名有 package.json/import 双重实据，不该被标「待确认」 */ | src/knowledge/wiki-context-builder.ts:320 |
| readRepoFileExcerpt |  | `(relPath: string, maxLen: number)` | /** 读仓库根下文本文件的前 N 字符（段落边界截断；不可读返回 undefined） */ | src/knowledge/wiki-context-builder.ts:328 |
| readPackageMeta |  | `()` | /** package.json 的 name/description（读取失败返回空串，诚实降级） */ | src/knowledge/wiki-context-builder.ts:341 |
| buildArchitectureContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:350 |
| filterLayers |  | `(layers: ArchitectureData['layers'], pkgNames: string[])` | /** 分层表消费侧过滤（延续「图谱边不可信」防线）：只保留锚定到真实包的行，\n *  拦上游把 .d.ts/空包名误判为 api 层的脏行；技术栈无 HTTP 框架时拦「HTTP route」误判 */ | src/knowledge/wiki-context-builder.ts:447 |
| buildDataFlowContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:458 |
| isAppEntryPoint |  | `(file: string)` | /** entry_points 消费端过滤：排除非代码文件与构建脚本（build.rs/deps.rs 是构建期代码，不是应用入口） */ | src/knowledge/wiki-context-builder.ts:498 |
| isTrustedCallEdge |  | `(callerFile: string, calleeFile: string, calleeName: string)` | /**\n   * 调用边可信性判定（图谱消费端防线，拦上游误建边）：\n   * 1. 语言域一致——caller/callee 文件必须同属一个语言域（ts/rust），排除跨语言\n   *    幽灵边（如 Rust run() 调 TS 前端函数）与非代码节点（tauri.conf.json 作被调方）；\n   * 2. 词法核验——caller 源码中必须出现 callee 名（拦 constructor→write 这类\n   *    把类成员定义误判为调用的边）。文件缺失/不可读时按可信处理 | src/knowledge/wiki-context-builder.ts:511 |
| getFallbackSymbolNames |  | `()` |  | src/knowledge/wiki-context-builder.ts:524 |
| edgeHasLexicalEvidence |  | `(callerFile: string, calleeName: string)` |  | src/knowledge/wiki-context-builder.ts:528 |
| buildCallChainFromEdges |  | `(entryName: string, entryFile: string)` | /**\n   * 基于 CALLS 边 BFS 构建真实调用链（修复伪线性化问题）。\n   * trace_path 返回扁平的 callee 列表（只有 hop 层级，无 caller→callee 边），\n   * 直接线性化会把并行分支误画成串行序列。\n   * 这里改用 Cypher 查精确的 CALLS 边，按 BFS 层级还原真实的 caller→callee 关系。\n   * frontier 用 name@file 双键，防止同名符号跨语言/跨文件互相污染。\n   */ | src/knowledge/wiki-context-builder.ts:552 |
| buildModulesContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:636 |
| moduleIntentPageExtra |  | `()` | /** modules 页的页级意图证据：仓库级文档小节（模块无关的「为什么」） */ | src/knowledge/wiki-context-builder.ts:715 |
| buildApiContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:721 |
| buildGlossaryContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:799 |
| buildOnboardingContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:834 |
| buildTroubleshootingContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:898 |
| topCallerAnchors |  | `()` | /**\n   * 高出边符号（调用方）锚点清单：采样 CALLS 边后在客户端聚合出边数排序。\n   * fan-in 热点是被调方（出边常为 0，立不出组）；调用方锚点才能铺开边表覆盖面。\n   */ | src/knowledge/wiki-context-builder.ts:934 |
| buildCallsContext |  | `()` | /**\n   * calls.md 数据源：调用边表（R2 边表优于时序图）。\n   * 用 Cypher 查 (a:Method|Function)-[:CALLS]->(b)，按入口分组。\n   * trace_path 不可靠（对 Method 返回空、无 file/line），改用 Cypher CALLS 边。\n   * 消费端防线：入口过滤（非代码/构建脚本不立组）+ name@file 双键 BFS（防同名污染）\n   * + isTrustedCallEdge（跨语言幽灵边与无词法佐证的边丢弃）。\n   * 覆盖面兜底：入口组不足时以高扇入 | src/knowledge/wiki-context-builder.ts:964 |
| collectCallEdges |  | `(\n    anchorName: string,\n    anchorFile: string,\n  )` | /**\n   * 单锚点（入口或热点）多层 CALLS 边采集。\n   * 组内按 caller->callee 去重（同一被调链在多个入口下重复出现是常态，\n   * 跨组全局去重会饿死后续入口组）；visited 按 name@file 双键去重——\n   * 同名函数（如 Rust 的 new/run）在不同文件是不同符号，按名去重会截断覆盖。\n   */ | src/knowledge/wiki-context-builder.ts:1047 |
| buildClassesContext |  | `()` | /**\n   * classes.md 数据源：类清单 + 每类方法表（降级适配）。\n   * MCP 无 INHERITS 边、Class 无 parent_class/is_abstract，故只做扁平类表。\n   * 方向是 (c:Class)-[:DEFINES_METHOD]->(m:Method)。\n   */ | src/knowledge/wiki-context-builder.ts:1105 |
| buildTopicContext |  | `(topicId: string)` | /**\n   * 主题页数据源：主题文件集的符号 + 文件间 CALLS 边 + 相关跨包边界。\n   * 文件清单来自 topics.json（确定性锁定），查询复用现有 Cypher 模式。\n   */ | src/knowledge/wiki-context-builder.ts:1150 |
| buildChapterPageContext |  | `(page: string)` | /**\n   * 章节页数据源：与主题页同一套图谱查询（符号/边/边界），\n   * 叠加 outline.json 锁定的章信息与写作简报（brief 驱动生成）。\n   */ | src/knowledge/wiki-context-builder.ts:1170 |
| fileEvidence |  | `(files: string[])` | /** 文件集的图谱证据：符号 + 文件间 CALLS 边 + 相关跨包边界（主题页/章节页共用） */ | src/knowledge/wiki-context-builder.ts:1193 |
| buildReadmeContext |  | `(plannedPages?: string[])` | /**\n   * README.md 数据源：文档索引（来自 PAGE_REGISTRY）+ 项目元数据（package.json）。\n   * README 是 wiki 总入口，索引表必须覆盖全部文档。\n   */ | src/knowledge/wiki-context-builder.ts:1255 |
| docTitleOf |  | `(relPath: string)` | /** 读 markdown 文件首个 # 标题（前 50 行内；失败返回 null） */ | src/knowledge/wiki-context-builder.ts:1325 |
| buildEnvironmentContext |  | `()` | /**\n   * environment.md 数据源：运行态信息（来自 ConfigDetector）。\n   * 包名/版本/运行时/Node 版本/包管理器/脚本命令/env 变量。\n   */ | src/knowledge/wiki-context-builder.ts:1342 |
| buildTestingContext |  | `()` | /**\n   * testing.md 数据源：测试框架/目录/夹具（来自 ConfigDetector）+ 运行命令。\n   */ | src/knowledge/wiki-context-builder.ts:1349 |
| buildConventionsContext |  | `()` | /**\n   * conventions.md 数据源：规约信息（来自 ConfigDetector）。\n   * Linter/EditorConfig/AGENTS.md 探测结果，诚实标注缺失项。\n   */ | src/knowledge/wiki-context-builder.ts:1362 |
| buildConstraintsContext |  | `()` | /**\n   * constraints.md 数据源：限制常量（ConfigDetector 源码扫描）+ 高复杂度函数（MCP）。\n   *\n   * 关键：MCP 的 complexity 仅在 Method/Function 节点可靠（Class/Interface 恒 0），\n   * 故 Cypher 显式限定 label IN ['Method', 'Function']，避免拉入噪声。\n   */ | src/knowledge/wiki-context-builder.ts:1372 |
| buildDecisionsContext |  | `()` | /**\n   * decisions.md 数据源：设计决策与演进（git 提交 + 文档小节证据锚定）。\n   * 只承载真实证据，无任何证据时返回 null（WikiService 剔除页面并给出原因），\n   * 规避旧版「自动推导条目伪装成决策记录」的失败模式。\n   */ | src/knowledge/wiki-context-builder.ts:1404 |
| buildCliContext |  | `()` | /**\n   * cli.md 数据源：命令注册（MCP entry_points + getCodeSnippet 解析 commander options）\n   * + 退出码（源码扫 process.exit(N)）。\n   *\n   * entry_points 即 CLI 命令入口；getCodeSnippet 读 register*Command 源码，\n   * 从 .option() 调用提取参数定义。\n   */ | src/knowledge/wiki-context-builder.ts:1433 |
| commandDescription |  | `(entryName: string)` | /** 命令入口的真实描述：docstring 优先，缺失时从 commander 源码 .command('name', 'desc') 提取 */ | src/knowledge/wiki-context-builder.ts:1463 |
| parseCommanderDescription |  | `(source: string)` | /** 从 commander 源码提取命令描述：`.command('name', 'desc')` 双参式 → 链式 `.description('desc')` */ | src/knowledge/wiki-context-builder.ts:1474 |
| parseCommanderOptions |  | `(source: string)` | /** 从 commander 源码解析 .option('flag', 'description') 调用 */ | src/knowledge/wiki-context-builder.ts:1482 |
| extractExitCodes |  | `(absPath: string, relPath: string)` | /** 从源码逐行提取 process.exit(N) 调用 */ | src/knowledge/wiki-context-builder.ts:1493 |
| buildTechStackContext |  | `()` | /**\n   * tech-stack.md 数据源：严格区分已用/未用依赖（R3 拒绝编造用途）。\n   * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。\n   * 复用 scanner 的死依赖过滤逻辑，并追踪每个依赖的 import 位置。\n   */ | src/knowledge/wiki-context-builder.ts:1518 |
| collectImportFiles |  | `(declaredDeps: Set<string>, scope: 'prod' | 'test' = 'prod')` | /** 扫描源码 import，返回 依赖名 → import 它的文件列表。\n   *  scope：'prod' 仅生产代码（默认）；'test' 仅测试文件（测试型工具的使用证据）。\n   *  覆盖 .vue SFC 的 <script> import、动态 import() 与 .css 的 @import（与 FileScanner 同口径） */ | src/knowledge/wiki-context-builder.ts:1563 |
| detectBuildTool |  | `(devDeps: Record<string, string>)` |  | src/knowledge/wiki-context-builder.ts:1587 |
| safeGetSnippet |  | `(qualifiedName: string)` | /**\n   * 容错地获取代码片段。getCodeSnippet 失败或无结果时返回 null，不抛错。\n   */ | src/knowledge/wiki-context-builder.ts:1599 |
| languagesForFiles |  | `(files: string[])` | /** 文件清单的语言域分布（模块多语言时供 LLM 分别说明职责域） */ | src/knowledge/wiki-context-builder.ts:1610 |
| labelToSymbolType |  | `(label: string)` | /** MCP 节点标签 → SymbolType */ | src/knowledge/wiki-context-builder.ts:1620 |

## WikiPageGenerator

源文件：`src/knowledge/wiki-page-generator.ts:105`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-page-generator.WikiPageGenerator`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    modelName?: string,\n    baseURL?: string,\n    apiKey?: string,\n    private onNotice?: (notice: PageGenNotice) => void,\n    private settings?: GeneratorSettings,\n  )` |  | src/knowledge/wiki-page-generator.ts:108 |
| hasModel |  | `()` |  | src/knowledge/wiki-page-generator.ts:132 |
| plan |  | `(systemPrompt: string, userPrompt: string)` | /** 规划类调用的原始文本（章节树 planner 复用模型与续写能力；不做 sanitize） */ | src/knowledge/wiki-page-generator.ts:137 |
| generateByName |  | `(page: string, ctx: any, onChunk: (text: string) => void)` | /** 按页面名派发 LLM 生成（供 PageRegistry 调用） */ | src/knowledge/wiki-page-generator.ts:144 |
| generateOverview |  | `(ctx: OverviewContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:167 |
| generateArchitecture |  | `(ctx: ArchitectureContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:211 |
| buildArchitectureSections |  | `(ctx: ArchitectureContext)` | /** 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 */ | src/knowledge/wiki-page-generator.ts:216 |
| generateDataFlow |  | `(ctx: DataFlowContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:302 |
| generateModules |  | `(ctx: ModulesContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:335 |
| buildModulesSections |  | `(ctx: ModulesContext)` | /** 模块页确定性节表：组织方式概述 → 模块详解（≤4 个/批）→ 其他模块汇总 */ | src/knowledge/wiki-page-generator.ts:340 |
| generateApi |  | `(ctx: ApiContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:429 |
| generateOnboarding |  | `(ctx: OnboardingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:489 |
| generateTroubleshooting |  | `(ctx: TroubleshootingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:521 |
| generateGlossary |  | `(ctx: GlossaryContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:551 |
| buildGlossarySections |  | `(ctx: GlossaryContext)` | /**\n   * 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化），\n   * 贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节。\n   */ | src/knowledge/wiki-page-generator.ts:559 |
| generateTopic |  | `(ctx: TopicContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:625 |
| generateChapterPage |  | `(ctx: ChapterPageContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:664 |
| generateTesting |  | `(ctx: TestingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:705 |
| generateConstraints |  | `(ctx: ConstraintsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:720 |
| generateEnvironment |  | `(ctx: EnvironmentContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:736 |
| generateTechStack |  | `(ctx: TechStackContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:759 |
| generateConventions |  | `(ctx: ConventionsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:783 |
| generateCliPage |  | `(ctx: CliContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:804 |
| generateDecisions |  | `(ctx: DecisionsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:823 |
| generate |  | `(onChunk: (text: string) => void, config: PageConfig)` |  | src/knowledge/wiki-page-generator.ts:880 |
| generateSectioned |  | `(onChunk: (text: string) => void, sections: PageConfig[])` | /**\n   * 分节生成：按确定性节表逐节生成（串行），每节独立获得输出预算与数据切片，\n   * 并自动继承断流续写能力。任一节为空则整页判失败（返回 ''，交由降级路径）。\n   */ | src/knowledge/wiki-page-generator.ts:893 |
| generateWithContinuation |  | `(\n    onChunk: (text: string) => void,\n    config: PageConfig,\n  )` | /** 单次生成 + 断流续写循环；返回内容与续写统计 */ | src/knowledge/wiki-page-generator.ts:914 |
| streamOnce |  | `(\n    onChunk: (text: string) => void,\n    config: PageConfig,\n    prefix?: string,\n  )` | /**\n   * 单轮流式生成。携带 prefix 时以 messages 形式发起续写：\n   * 原始页面数据 + 已生成的安全前缀 + 续写指令。\n   */ | src/knowledge/wiki-page-generator.ts:953 |

## WikiService

源文件：`src/services/wiki-service.ts:65`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.wiki-service.WikiService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` |  | src/services/wiki-service.ts:66 |
| buildWiki |  | `(wikiDir: string, options?: WikiBuildOptions)` |  | src/services/wiki-service.ts:71 |
| resolvePages |  | `(requested: string[] | undefined, topicPages: string[], chapterPages: string[])` | /**\n   * 解析 --pages 参数，校验页名合法性。\n   *\n   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）\n   *   + 按 projectType 激活的 surface 层（Tier2）。\n   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。\n   */ | src/services/wiki-service.ts:376 |
| getSymbolUniverse |  | `(fallback?: ReadonlySet<string>)` |  | src/services/wiki-service.ts:405 |
| planOutline |  | `(\n    generator: WikiPageGenerator,\n    topics: TopicDefinition[],\n    knownFiles: Set<string>,\n  )` | /**\n   * 章节树规划：LLM 提议 → 校验器裁决；净树为空且存在剔除时，\n   * 携剔除原因反馈重试一次（仍空则返回首轮产物，交由正常校验路径降级）。\n   * 输出不可解析返回 null。\n   */ | src/services/wiki-service.ts:423 |
| outlineKnown |  | `(knownFiles: Set<string>, outlineRaw: unknown)` | /** 组装章节树校验参考集：模块来自架构包，符号来自 outline 引用文件\n   *  （图谱有界查询 + 源码正则回落——图谱漏采的 brief 符号免于 W3「查无实据」误剔） */ | src/services/wiki-service.ts:451 |
| cleanupLegacyFlatFiles |  | `(wikiDir: string, pages: string[])` | /**\n   * 清理旧版扁平输出（wiki 根下的 ${page}.md）。\n   * 只删除本工具拥有的页面文件；编号目录接管后这些扁平文件成为陈旧残留。\n   * readme 特例：旧 'readme.md' 让位于 'README.md'。\n   * 用目录条目精确比对文件名：大小写不敏感文件系统上 existsSync('readme.md')\n   * 会误命中 'README.md'，导致每次构建都误删并重写 README。\n   */ | src/services/wiki-service.ts:484 |
| cleanupRetiredPages |  | `(wikiDir: string)` | /** 清理已退休页面路径的残留文件（改名/下线登记于 RETIRED_WIKI_PATHS）；清空的宿主目录一并移除 */ | src/services/wiki-service.ts:505 |
| cleanupStaleTopicPages |  | `(wikiDir: string, pages: string[])` | /** 清理 08-topics 下未列入本次计划的主题文件（目录为工具所有） */ | src/services/wiki-service.ts:524 |
| cleanupStaleChapterPages |  | `(wikiDir: string, pages: string[])` | /** 清理 09-chapters 下未列入本次计划的章节页残留；清空的章目录与章节根目录一并移除（目录为工具所有） */ | src/services/wiki-service.ts:538 |
| removeEmptyOwnedDirs |  | `(wikiDir: string)` | /** 清理后扫描：清空的工具编号目录一并移除（update 模式下页面全部停写/剔除后的残留空目录） */ | src/services/wiki-service.ts:572 |
| cleanupStaleNumberedDirFiles |  | `(wikiDir: string, pages: string[])` | /**\n   * 编号目录治理（update 模式路径；.wiki 为工具独占目录，full 模式已整目录重建）：\n   * - 工具所有的编号目录（PAGE_REGISTRY 声明 + 08/09，后两者由专属清理负责，此处跳过）：\n   *   目录内文件名落在注册页名空间（ALL_PAGE_NAMES）但未列入本次计划的 .md 视为\n   *   旧版产物残留（如旧版章节页 01-overview/architecture.md），清理；\n   *   页名空间之外的文件一并清理（目录为工具 | src/services/wiki-service.ts:596 |
| generatePage |  | `(\n    page: string,\n    pageContext: unknown,\n    fallback: WikiFallbackBuilder,\n    generator: WikiPageGenerator,\n    noLlm: boolean,\n    onChunk: (filename: string, text: string) => void,\n    gate?: (content: string) => boolean,\n  )` |  | src/services/wiki-service.ts:629 |
| printBuildReport |  | `(\n    written: Array<{ page: string; relPath: string; source: string; status: PageStatus }>,\n    skipped: Array<{ page: string; reason: string }>,\n    reports: PageQualityReport[],\n    legacyRemoved: string[],\n    continuations: Array<{ page: string; rounds: number; truncated: boolean }>,\n    sectionedPages: Array<{ page: string; sections: number; continuedSections: number; truncated: boolean }>,\n    llmDropped: Array<{ page: string; reason: string }>,\n    outline: OutlineReport | null,\n    claimS` | /**\n   * 构建报告（对应 project-wiki「完成后清单」）：\n   * 已写页面（新增/更新分计 + 生成路径统计）、update 模式变更摘要、\n   * 跳过页面及原因、锚点核验统计、告警汇总。\n   */ | src/services/wiki-service.ts:665 |
## Related

- 同目录：[calls.md](calls.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
