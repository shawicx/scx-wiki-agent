# Classes

<details>
<summary>Relevant source files</summary>

- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/services/wiki-service.ts
</details>

> ⚠️ **待确认**：MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现（证据不足，禁止猜测；请人工补充后移除本标记）

## WikiContextBuilder

源文件：`src/knowledge/wiki-context-builder.ts:59`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-context-builder.WikiContextBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n    private detector: ConfigDetector,\n  )` |  | src/knowledge/wiki-context-builder.ts:60 |
| setTopics |  | `(topics: TopicDefinition[])` |  | src/knowledge/wiki-context-builder.ts:74 |
| setOutlineChapters |  | `(chapters: OutlineChapter[])` |  | src/knowledge/wiki-context-builder.ts:78 |
| buildByName |  | `(page: string, plannedPages?: string[])` | /** 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 */ | src/knowledge/wiki-context-builder.ts:83 |
| dispatchContext |  | `(page: string, plannedPages?: string[])` |  | src/knowledge/wiki-context-builder.ts:89 |
| enrichIfThinEvidence |  | `(page: string, ctx: unknown)` | /**\n   * 证据补强（DeepWiki「二次扩展检索」的图谱版）：\n   * LLM 路径的 structure 页证据文件低于下限时，从图谱补一批高复杂度真实符号，\n   * 只保留扫描清单内的文件路径。图谱查无的热点/入口名回落源码正则探测\n   * （mcp 对 .vue/部分 Rust 索引不全，避免 LLM 把真实符号标成「待确认」）。\n   */ | src/knowledge/wiki-context-builder.ts:120 |
| appendSourceFallback |  | `(existing: Array<{ name: string }>)` | /**\n   * 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。\n   * 找到的名字记入 fallbackSymbolNames（供断言校验 universe 回填）。\n   */ | src/knowledge/wiki-context-builder.ts:154 |
| getKnownFiles |  | `()` |  | src/knowledge/wiki-context-builder.ts:168 |
| buildOverviewContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:175 |
| buildDepUsage |  | `()` | /**\n   * 技术栈依赖的 import 调用点证据（overview/troubleshooting 等元数据页用）。\n   * 依赖名本身有 package.json 声明 + 真实 import 点双重实据，防止 R5 纪律下\n   * LLM 把会话层核心依赖（如 rxjs）反向标成「无调用点证据/待确认」。\n   */ | src/knowledge/wiki-context-builder.ts:217 |
| declaredPackageDeps |  | `()` |  | src/knowledge/wiki-context-builder.ts:227 |
| getDepNames |  | `()` | /** 依赖名全集（声明名 + techStack 探测名）：断言校验 universe 回填用。\n   *  正文反引号里的依赖名有 package.json/import 双重实据，不该被标「待确认」 */ | src/knowledge/wiki-context-builder.ts:244 |
| readRepoFileExcerpt |  | `(relPath: string, maxLen: number)` | /** 读仓库根下文本文件的前 N 字符（段落边界截断；不可读返回 undefined） */ | src/knowledge/wiki-context-builder.ts:252 |
| readPackageMeta |  | `()` | /** package.json 的 name/description（读取失败返回空串，诚实降级） */ | src/knowledge/wiki-context-builder.ts:265 |
| buildArchitectureContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:274 |
| buildDataFlowContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:343 |
| isAppEntryPoint |  | `(file: string)` | /** entry_points 消费端过滤：排除非代码文件与构建脚本（build.rs/deps.rs 是构建期代码，不是应用入口） */ | src/knowledge/wiki-context-builder.ts:366 |
| isTrustedCallEdge |  | `(callerFile: string, calleeFile: string, calleeName: string)` | /**\n   * 调用边可信性判定（图谱消费端防线，拦上游误建边）：\n   * 1. 语言域一致——caller/callee 文件必须同属一个语言域（ts/rust），排除跨语言\n   *    幽灵边（如 Rust run() 调 TS 前端函数）与非代码节点（tauri.conf.json 作被调方）；\n   * 2. 词法核验——caller 源码中必须出现 callee 名（拦 constructor→write 这类\n   *    把类成员定义误判为调用的边）。文件缺失/不可读时按可信处理 | src/knowledge/wiki-context-builder.ts:379 |
| getFallbackSymbolNames |  | `()` |  | src/knowledge/wiki-context-builder.ts:392 |
| edgeHasLexicalEvidence |  | `(callerFile: string, calleeName: string)` |  | src/knowledge/wiki-context-builder.ts:396 |
| buildCallChainFromEdges |  | `(entryName: string, entryFile: string)` | /**\n   * 基于 CALLS 边 BFS 构建真实调用链（修复伪线性化问题）。\n   * trace_path 返回扁平的 callee 列表（只有 hop 层级，无 caller→callee 边），\n   * 直接线性化会把并行分支误画成串行序列。\n   * 这里改用 Cypher 查精确的 CALLS 边，按 BFS 层级还原真实的 caller→callee 关系。\n   * frontier 用 name@file 双键，防止同名符号跨语言/跨文件互相污染。\n   */ | src/knowledge/wiki-context-builder.ts:420 |
| buildModulesContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:504 |
| buildApiContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:565 |
| buildGlossaryContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:643 |
| buildOnboardingContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:678 |
| buildTroubleshootingContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:723 |
| buildCallsContext |  | `()` | /**\n   * calls.md 数据源：调用边表（R2 边表优于时序图）。\n   * 用 Cypher 查 (a:Method|Function)-[:CALLS]->(b)，按入口分组。\n   * trace_path 不可靠（对 Method 返回空、无 file/line），改用 Cypher CALLS 边。\n   * 消费端防线：入口过滤（非代码/构建脚本不立组）+ name@file 双键 BFS（防同名污染）\n   * + isTrustedCallEdge（跨语言幽灵边与无词法佐证的边丢弃）。\n   * 覆盖面兜底：入口组不足时以高扇入 | src/knowledge/wiki-context-builder.ts:757 |
| collectCallEdges |  | `(\n    anchorName: string,\n    anchorFile: string,\n  )` | /**\n   * 单锚点（入口或热点）2 层 CALLS 边采集。\n   * 组内按 caller->callee 去重（同一被调链在多个入口下重复出现是常态，\n   * 跨组全局去重会饿死后续入口组——旧版仅覆盖 2 个入口的根因）。\n   */ | src/knowledge/wiki-context-builder.ts:826 |
| buildClassesContext |  | `()` | /**\n   * classes.md 数据源：类清单 + 每类方法表（降级适配）。\n   * MCP 无 INHERITS 边、Class 无 parent_class/is_abstract，故只做扁平类表。\n   * 方向是 (c:Class)-[:DEFINES_METHOD]->(m:Method)。\n   */ | src/knowledge/wiki-context-builder.ts:882 |
| buildTopicContext |  | `(topicId: string)` | /**\n   * 主题页数据源：主题文件集的符号 + 文件间 CALLS 边 + 相关跨包边界。\n   * 文件清单来自 topics.json（确定性锁定），查询复用现有 Cypher 模式。\n   */ | src/knowledge/wiki-context-builder.ts:927 |
| buildChapterPageContext |  | `(page: string)` | /**\n   * 章节页数据源：与主题页同一套图谱查询（符号/边/边界），\n   * 叠加 outline.json 锁定的章信息与写作简报（brief 驱动生成）。\n   */ | src/knowledge/wiki-context-builder.ts:939 |
| fileEvidence |  | `(files: string[])` | /** 文件集的图谱证据：符号 + 文件间 CALLS 边 + 相关跨包边界（主题页/章节页共用） */ | src/knowledge/wiki-context-builder.ts:961 |
| buildReadmeContext |  | `(plannedPages?: string[])` | /**\n   * README.md 数据源：文档索引（来自 PAGE_REGISTRY）+ 项目元数据（package.json）。\n   * README 是 wiki 总入口，索引表必须覆盖全部文档。\n   */ | src/knowledge/wiki-context-builder.ts:1023 |
| docTitleOf |  | `(relPath: string)` | /** 读 markdown 文件首个 # 标题（前 50 行内；失败返回 null） */ | src/knowledge/wiki-context-builder.ts:1093 |
| buildEnvironmentContext |  | `()` | /**\n   * environment.md 数据源：运行态信息（来自 ConfigDetector）。\n   * 包名/版本/运行时/Node 版本/包管理器/脚本命令/env 变量。\n   */ | src/knowledge/wiki-context-builder.ts:1110 |
| buildTestingContext |  | `()` | /**\n   * testing.md 数据源：测试框架/目录/夹具（来自 ConfigDetector）+ 运行命令。\n   */ | src/knowledge/wiki-context-builder.ts:1117 |
| buildConventionsContext |  | `()` | /**\n   * conventions.md 数据源：规约信息（来自 ConfigDetector）。\n   * Linter/EditorConfig/AGENTS.md 探测结果，诚实标注缺失项。\n   */ | src/knowledge/wiki-context-builder.ts:1130 |
| buildConstraintsContext |  | `()` | /**\n   * constraints.md 数据源：限制常量（ConfigDetector 源码扫描）+ 高复杂度函数（MCP）。\n   *\n   * 关键：MCP 的 complexity 仅在 Method/Function 节点可靠（Class/Interface 恒 0），\n   * 故 Cypher 显式限定 label IN ['Method', 'Function']，避免拉入噪声。\n   */ | src/knowledge/wiki-context-builder.ts:1140 |
| buildCliContext |  | `()` | /**\n   * cli.md 数据源：命令注册（MCP entry_points + getCodeSnippet 解析 commander options）\n   * + 退出码（源码扫 process.exit(N)）。\n   *\n   * entry_points 即 CLI 命令入口；getCodeSnippet 读 register*Command 源码，\n   * 从 .option() 调用提取参数定义。\n   */ | src/knowledge/wiki-context-builder.ts:1166 |
| commandDescription |  | `(entryName: string)` | /** 命令入口的真实描述：docstring 优先，缺失时从 commander 源码 .command('name', 'desc') 提取 */ | src/knowledge/wiki-context-builder.ts:1196 |
| parseCommanderDescription |  | `(source: string)` | /** 从 commander 源码提取命令描述：`.command('name', 'desc')` 双参式 → 链式 `.description('desc')` */ | src/knowledge/wiki-context-builder.ts:1207 |
| parseCommanderOptions |  | `(source: string)` | /** 从 commander 源码解析 .option('flag', 'description') 调用 */ | src/knowledge/wiki-context-builder.ts:1215 |
| extractExitCodes |  | `(absPath: string, relPath: string)` | /** 从源码逐行提取 process.exit(N) 调用 */ | src/knowledge/wiki-context-builder.ts:1226 |
| buildTechStackContext |  | `()` | /**\n   * tech-stack.md 数据源：严格区分已用/未用依赖（R3 拒绝编造用途）。\n   * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。\n   * 复用 scanner 的死依赖过滤逻辑，并追踪每个依赖的 import 位置。\n   */ | src/knowledge/wiki-context-builder.ts:1251 |
| collectImportFiles |  | `(declaredDeps: Set<string>)` | /** 扫描源码 import，返回 依赖名 → import 它的文件列表（仅生产代码）。\n   *  覆盖 .vue SFC 的 <script> import、动态 import() 与 .css 的 @import（与 FileScanner 同口径） */ | src/knowledge/wiki-context-builder.ts:1290 |
| detectBuildTool |  | `(devDeps: Record<string, string>)` |  | src/knowledge/wiki-context-builder.ts:1314 |
| safeGetSnippet |  | `(qualifiedName: string)` | /**\n   * 容错地获取代码片段。getCodeSnippet 失败或无结果时返回 null，不抛错。\n   */ | src/knowledge/wiki-context-builder.ts:1326 |
| languagesForFiles |  | `(files: string[])` | /** 文件清单的语言域分布（模块多语言时供 LLM 分别说明职责域） */ | src/knowledge/wiki-context-builder.ts:1337 |
| labelToSymbolType |  | `(label: string)` | /** MCP 节点标签 → SymbolType */ | src/knowledge/wiki-context-builder.ts:1347 |

## WikiPageGenerator

源文件：`src/knowledge/wiki-page-generator.ts:93`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-page-generator.WikiPageGenerator`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    modelName?: string,\n    baseURL?: string,\n    apiKey?: string,\n    private onNotice?: (notice: PageGenNotice) => void,\n    private settings?: GeneratorSettings,\n  )` |  | src/knowledge/wiki-page-generator.ts:96 |
| hasModel |  | `()` |  | src/knowledge/wiki-page-generator.ts:120 |
| plan |  | `(systemPrompt: string, userPrompt: string)` | /** 规划类调用的原始文本（章节树 planner 复用模型与续写能力；不做 sanitize） */ | src/knowledge/wiki-page-generator.ts:125 |
| generateByName |  | `(page: string, ctx: any, onChunk: (text: string) => void)` | /** 按页面名派发 LLM 生成（供 PageRegistry 调用） */ | src/knowledge/wiki-page-generator.ts:132 |
| generateOverview |  | `(ctx: OverviewContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:154 |
| generateArchitecture |  | `(ctx: ArchitectureContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:197 |
| buildArchitectureSections |  | `(ctx: ArchitectureContext)` | /** 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 */ | src/knowledge/wiki-page-generator.ts:202 |
| generateDataFlow |  | `(ctx: DataFlowContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:285 |
| generateModules |  | `(ctx: ModulesContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:318 |
| buildModulesSections |  | `(ctx: ModulesContext)` | /** 模块页确定性节表：组织方式概述 → 模块详解（≤4 个/批）→ 其他模块汇总 */ | src/knowledge/wiki-page-generator.ts:323 |
| generateApi |  | `(ctx: ApiContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:409 |
| generateOnboarding |  | `(ctx: OnboardingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:469 |
| generateTroubleshooting |  | `(ctx: TroubleshootingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:499 |
| generateGlossary |  | `(ctx: GlossaryContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:528 |
| buildGlossarySections |  | `(ctx: GlossaryContext)` | /**\n   * 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化），\n   * 贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节。\n   */ | src/knowledge/wiki-page-generator.ts:536 |
| generateTopic |  | `(ctx: TopicContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:602 |
| generateChapterPage |  | `(ctx: ChapterPageContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:640 |
| generateTesting |  | `(ctx: TestingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:679 |
| generateConstraints |  | `(ctx: ConstraintsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:694 |
| generateEnvironment |  | `(ctx: EnvironmentContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:710 |
| generateTechStack |  | `(ctx: TechStackContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:733 |
| generateConventions |  | `(ctx: ConventionsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:756 |
| generateCliPage |  | `(ctx: CliContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:777 |
| generate |  | `(onChunk: (text: string) => void, config: PageConfig)` |  | src/knowledge/wiki-page-generator.ts:817 |
| generateSectioned |  | `(onChunk: (text: string) => void, sections: PageConfig[])` | /**\n   * 分节生成：按确定性节表逐节生成（串行），每节独立获得输出预算与数据切片，\n   * 并自动继承断流续写能力。任一节为空则整页判失败（返回 ''，交由降级路径）。\n   */ | src/knowledge/wiki-page-generator.ts:830 |
| generateWithContinuation |  | `(\n    onChunk: (text: string) => void,\n    config: PageConfig,\n  )` | /** 单次生成 + 断流续写循环；返回内容与续写统计 */ | src/knowledge/wiki-page-generator.ts:851 |
| streamOnce |  | `(\n    onChunk: (text: string) => void,\n    config: PageConfig,\n    prefix?: string,\n  )` | /**\n   * 单轮流式生成。携带 prefix 时以 messages 形式发起续写：\n   * 原始页面数据 + 已生成的安全前缀 + 续写指令。\n   */ | src/knowledge/wiki-page-generator.ts:890 |

## WikiFallbackBuilder

源文件：`src/knowledge/wiki-fallback-builder.ts:30`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-fallback-builder.WikiFallbackBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| buildByName |  | `(page: string, ctx: any)` | /** 按页面名派发规则生成（供 PageRegistry 调用） */ | src/knowledge/wiki-fallback-builder.ts:32 |
| buildOverview |  | `(ctx: OverviewContext)` |  | src/knowledge/wiki-fallback-builder.ts:57 |
| buildArchitecture |  | `(ctx: ArchitectureContext)` |  | src/knowledge/wiki-fallback-builder.ts:89 |
| buildDataFlow |  | `(ctx: DataFlowContext)` |  | src/knowledge/wiki-fallback-builder.ts:134 |
| buildModules |  | `(ctx: ModulesContext)` |  | src/knowledge/wiki-fallback-builder.ts:168 |
| buildApi |  | `(ctx: ApiContext)` |  | src/knowledge/wiki-fallback-builder.ts:216 |
| buildGlossary |  | `(ctx: GlossaryContext)` |  | src/knowledge/wiki-fallback-builder.ts:271 |
| buildOnboarding |  | `(ctx: OnboardingContext)` |  | src/knowledge/wiki-fallback-builder.ts:293 |
| buildTroubleshooting |  | `(ctx: TroubleshootingContext)` |  | src/knowledge/wiki-fallback-builder.ts:340 |
| buildCalls |  | `(ctx: CallsContext)` | /**\n   * calls.md：调用边表（R2 边表优于时序图）。\n   * 纯规则生成，不使用 sequenceDiagram。\n   */ | src/knowledge/wiki-fallback-builder.ts:395 |
| buildClasses |  | `(ctx: ClassesContext)` | /**\n   * classes.md：类层次与多态（降级适配）。\n   * MCP 无 INHERITS 边，只做\"类清单 + 每类方法表\"，诚实标注数据局限。\n   */ | src/knowledge/wiki-fallback-builder.ts:452 |
| buildReadme |  | `(ctx: ReadmeContext)` | /**\n   * README.md：导航索引（wiki 总入口）。\n   * 按编号目录分组索引（project-wiki「总入口：使用方式/阅读路径/核心导航」），\n   * 索引表只列本次产出的文档，链接相对 wiki 根。\n   */ | src/knowledge/wiki-fallback-builder.ts:498 |
| buildEnvironment |  | `(ctx: EnvironmentContext)` | /**\n   * environment.md：运行态信息（包名/版本/运行时/脚本/env 变量）。\n   * 纯规则生成，数据来自 ConfigDetector 探测的实际配置文件。\n   */ | src/knowledge/wiki-fallback-builder.ts:557 |
| buildTesting |  | `(ctx: TestingContext)` | /**\n   * testing.md：测试框架/配置/目录/夹具/运行命令。\n   * 纯规则生成，诚实标注未检测到的项。\n   */ | src/knowledge/wiki-fallback-builder.ts:595 |
| buildConventions |  | `(ctx: ConventionsContext)` | /**\n   * conventions.md：规约文档（AI 头号参考）。\n   * 诚实标注工具链检测结果：有 lint 则列规则，无则明确提示需人工补充。\n   * 从 AGENTS.md 提取关键规约段落。\n   */ | src/knowledge/wiki-fallback-builder.ts:617 |
| buildConstraints |  | `(ctx: ConstraintsContext)` | /**\n   * constraints.md：项目边界与代价。\n   * 限制常量（源码 MAX/LIMIT/TIMEOUT）+ 高复杂度函数表（complexity > 3）。\n   */ | src/knowledge/wiki-fallback-builder.ts:660 |
| buildCli |  | `(ctx: CliContext)` | /**\n   * cli.md：CLI 命令参考。\n   * 命令表（含 file:line）+ 每命令参数表（commander .option 解析）+ 退出码表。\n   */ | src/knowledge/wiki-fallback-builder.ts:692 |
| buildTechStack |  | `(ctx: TechStackContext)` | /**\n   * tech-stack.md：技术栈（R3 拒绝编造用途）。\n   * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。\n   */ | src/knowledge/wiki-fallback-builder.ts:738 |
| buildTopic |  | `(ctx: TopicContext)` | /**\n   * 主题页：仓库专属跨模块协作面（图谱推导）。\n   * 规则模板：文件清单 + 符号表 + CALLS 边表 + 跨包边界。\n   */ | src/knowledge/wiki-fallback-builder.ts:792 |
| buildChapterPage |  | `(ctx: ChapterPageContext)` | /** 章节页规则模板：简报 + 覆盖文件 + 关键符号 + 协作边表 + 跨模块边界 */ | src/knowledge/wiki-fallback-builder.ts:834 |

## WikiService

源文件：`src/services/wiki-service.ts:39`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.wiki-service.WikiService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` |  | src/services/wiki-service.ts:40 |
| buildWiki |  | `(wikiDir: string, options?: WikiBuildOptions)` |  | src/services/wiki-service.ts:45 |
| resolvePages |  | `(requested: string[] | undefined, topicPages: string[], chapterPages: string[])` | /**\n   * 解析 --pages 参数，校验页名合法性。\n   *\n   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）\n   *   + 按 projectType 激活的 surface 层（Tier2）。\n   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。\n   */ | src/services/wiki-service.ts:254 |
| getSymbolUniverse |  | `(fallback?: ReadonlySet<string>)` |  | src/services/wiki-service.ts:283 |
## Related

- 同目录：[calls.md](calls.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
