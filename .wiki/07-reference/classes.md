# Classes

<details>
<summary>Relevant source files</summary>

- src/core/scanner.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki-service.ts
- tests/fixtures/nestjs-project/src/user.controller.ts
- tests/fixtures/sample-project/src/user.service.ts
</details>

> ⚠️ **待确认**：MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现（证据不足，禁止猜测；请人工补充后移除本标记）

## WikiContextBuilder

源文件：`src/knowledge/wiki-context-builder.ts:49`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-context-builder.WikiContextBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n    private detector: ConfigDetector,\n  )` |  | src/knowledge/wiki-context-builder.ts:50 |
| buildByName |  | `(page: string, plannedPages?: string[])` | /** 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 */ | src/knowledge/wiki-context-builder.ts:59 |
| dispatchContext |  | `(page: string, plannedPages?: string[])` |  | src/knowledge/wiki-context-builder.ts:65 |
| enrichIfThinEvidence |  | `(page: string, ctx: unknown)` | /**\n   * 证据补强（DeepWiki「二次扩展检索」的图谱版）：\n   * LLM 路径的 structure 页证据文件低于下限时，从图谱补一批高复杂度真实符号，\n   * 只保留扫描清单内的文件路径。\n   */ | src/knowledge/wiki-context-builder.ts:94 |
| getKnownFiles |  | `()` |  | src/knowledge/wiki-context-builder.ts:121 |
| buildOverviewContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:128 |
| buildArchitectureContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:152 |
| buildDataFlowContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:207 |
| buildCallChainFromEdges |  | `(entryName: string, entryFile: string)` | /**\n   * 基于 CALLS 边 BFS 构建真实调用链（修复伪线性化问题）。\n   * trace_path 返回扁平的 callee 列表（只有 hop 层级，无 caller→callee 边），\n   * 直接线性化会把并行分支误画成串行序列。\n   * 这里改用 Cypher 查精确的 CALLS 边，按 BFS 层级还原真实的 caller→callee 关系。\n   */ | src/knowledge/wiki-context-builder.ts:234 |
| buildModulesContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:311 |
| buildApiContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:370 |
| buildGlossaryContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:434 |
| buildOnboardingContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:466 |
| buildTroubleshootingContext |  | `()` |  | src/knowledge/wiki-context-builder.ts:503 |
| buildCallsContext |  | `()` | /**\n   * calls.md 数据源：调用边表（R2 边表优于时序图）。\n   * 用 Cypher 查 (a:Method|Function)-[:CALLS]->(b)，按入口分组。\n   * trace_path 不可靠（对 Method 返回空、无 file/line），改用 Cypher CALLS 边。\n   */ | src/knowledge/wiki-context-builder.ts:517 |
| buildClassesContext |  | `()` | /**\n   * classes.md 数据源：类清单 + 每类方法表（降级适配）。\n   * MCP 无 INHERITS 边、Class 无 parent_class/is_abstract，故只做扁平类表。\n   * 方向是 (c:Class)-[:DEFINES_METHOD]->(m:Method)。\n   */ | src/knowledge/wiki-context-builder.ts:585 |
| buildReadmeContext |  | `(plannedPages?: string[])` | /**\n   * README.md 数据源：文档索引（来自 PAGE_REGISTRY）+ 项目元数据（package.json）。\n   * README 是 wiki 总入口，索引表必须覆盖全部文档。\n   */ | src/knowledge/wiki-context-builder.ts:629 |
| buildEnvironmentContext |  | `()` | /**\n   * environment.md 数据源：运行态信息（来自 ConfigDetector）。\n   * 包名/版本/运行时/Node 版本/包管理器/脚本命令/env 变量。\n   */ | src/knowledge/wiki-context-builder.ts:665 |
| buildTestingContext |  | `()` | /**\n   * testing.md 数据源：测试框架/目录/夹具（来自 ConfigDetector）+ 运行命令。\n   */ | src/knowledge/wiki-context-builder.ts:672 |
| buildConventionsContext |  | `()` | /**\n   * conventions.md 数据源：规约信息（来自 ConfigDetector）。\n   * Linter/EditorConfig/AGENTS.md 探测结果，诚实标注缺失项。\n   */ | src/knowledge/wiki-context-builder.ts:685 |
| buildConstraintsContext |  | `()` | /**\n   * constraints.md 数据源：限制常量（ConfigDetector 源码扫描）+ 高复杂度函数（MCP）。\n   *\n   * 关键：MCP 的 complexity 仅在 Method/Function 节点可靠（Class/Interface 恒 0），\n   * 故 Cypher 显式限定 label IN ['Method', 'Function']，避免拉入噪声。\n   */ | src/knowledge/wiki-context-builder.ts:695 |
| buildCliContext |  | `()` | /**\n   * cli.md 数据源：命令注册（MCP entry_points + getCodeSnippet 解析 commander options）\n   * + 退出码（源码扫 process.exit(N)）。\n   *\n   * entry_points 即 CLI 命令入口；getCodeSnippet 读 register*Command 源码，\n   * 从 .option() 调用提取参数定义。\n   */ | src/knowledge/wiki-context-builder.ts:721 |
| parseCommanderOptions |  | `(source: string)` | /** 从 commander 源码解析 .option('flag', 'description') 调用 */ | src/knowledge/wiki-context-builder.ts:750 |
| extractExitCodes |  | `(absPath: string, relPath: string)` | /** 从源码逐行提取 process.exit(N) 调用 */ | src/knowledge/wiki-context-builder.ts:761 |
| buildTechStackContext |  | `()` | /**\n   * tech-stack.md 数据源：严格区分已用/未用依赖（R3 拒绝编造用途）。\n   * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。\n   * 复用 scanner 的死依赖过滤逻辑，并追踪每个依赖的 import 位置。\n   */ | src/knowledge/wiki-context-builder.ts:786 |
| collectImportFiles |  | `(declaredDeps: Set<string>)` | /** 扫描源码 import，返回 依赖名 → import 它的文件列表 */ | src/knowledge/wiki-context-builder.ts:824 |
| detectBuildTool |  | `(devDeps: Record<string, string>)` |  | src/knowledge/wiki-context-builder.ts:846 |
| detectPackageManager |  | `()` |  | src/knowledge/wiki-context-builder.ts:855 |
| buildDecisionsContext |  | `()` | /**\n   * decisions.md 数据源：ADR 架构决策记录。\n   * MCP manage_adr 当前无持久化 ADR，降级为从图谱真实证据（分层/边界/技术栈）自动推导。\n   */ | src/knowledge/wiki-context-builder.ts:865 |
| generateAdrEntries |  | `()` | /**\n   * 从图谱证据推导 ADR 条目（泛化实现，不针对特定项目写死文案）。\n   * 证据来源：getArchitecture 的 layers/boundaries + scanner 技术栈（已按 import 过滤，R3）。\n   * 自动推导条目状态一律 proposed，由页面级「待确认」说明兜底。\n   */ | src/knowledge/wiki-context-builder.ts:874 |
| safeGetSnippet |  | `(qualifiedName: string)` | /**\n   * 容错地获取代码片段。getCodeSnippet 失败或无结果时返回 null，不抛错。\n   */ | src/knowledge/wiki-context-builder.ts:929 |
| labelToSymbolType |  | `(label: string)` | /** MCP 节点标签 → SymbolType */ | src/knowledge/wiki-context-builder.ts:940 |

## CodebaseMemoryClient

源文件：`src/mcp/codebase-memory-client.ts:119`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.mcp.codebase-memory-client.CodebaseMemoryClient`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(repoPath: string, binaryPath?: string)` |  | src/mcp/codebase-memory-client.ts:124 |
| ensureIndexed |  | `(mode: 'fast' | 'moderate' | 'full' = 'moderate')` | /** 确保图谱已索引（幂等） */ | src/mcp/codebase-memory-client.ts:131 |
| getArchitecture |  | `()` | /** 架构概览 */ | src/mcp/codebase-memory-client.ts:140 |
| tracePath |  | `(\n    functionName: string,\n    direction: 'inbound' | 'outbound' | 'both' = 'both',\n    depth = 6,\n  )` | /** 双向调用链追踪 */ | src/mcp/codebase-memory-client.ts:150 |
| getCodeSnippet |  | `(qualifiedName: string)` | /** 代码片段+元数据 */ | src/mcp/codebase-memory-client.ts:166 |
| queryGraph |  | `(cypher: string, maxRows = 100)` | /** Cypher 查询 */ | src/mcp/codebase-memory-client.ts:175 |
| exec |  | `(tool: string, args: Record<string, unknown>)` | // --- 内部方法 --- | src/mcp/codebase-memory-client.ts:188 |
| parseJsonOutput |  | `(raw: string)` | /**\n   * 解析子进程 stdout。\n   * MCP 的 info 日志（`level=info msg=...`）可能泄漏到 stdout，\n   * 因此从末尾向前找最后一个完整的 JSON 对象。\n   */ | src/mcp/codebase-memory-client.ts:211 |
| toProjectName |  | `(repoPath: string)` | /** 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`） */ | src/mcp/codebase-memory-client.ts:227 |
| findBinary |  | `()` |  | src/mcp/codebase-memory-client.ts:231 |

## ScanService

源文件：`src/services/scan-service.ts:3`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.scan-service.ScanService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string)` |  | src/services/scan-service.ts:6 |
| scan |  | `()` |  | src/services/scan-service.ts:10 |

## WikiPageGenerator

源文件：`src/knowledge/wiki-page-generator.ts:23`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-page-generator.WikiPageGenerator`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(modelName?: string, baseURL?: string, apiKey?: string)` |  | src/knowledge/wiki-page-generator.ts:26 |
| hasModel |  | `()` |  | src/knowledge/wiki-page-generator.ts:44 |
| generateByName |  | `(page: string, ctx: any, onChunk: (text: string) => void)` | /** 按页面名派发 LLM 生成（供 PageRegistry 调用） */ | src/knowledge/wiki-page-generator.ts:49 |
| generateOverview |  | `(ctx: OverviewContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:66 |
| generateArchitecture |  | `(ctx: ArchitectureContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:102 |
| generateDataFlow |  | `(ctx: DataFlowContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:146 |
| generateModules |  | `(ctx: ModulesContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:180 |
| generateApi |  | `(ctx: ApiContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:226 |
| generateOnboarding |  | `(ctx: OnboardingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:266 |
| generateTroubleshooting |  | `(ctx: TroubleshootingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:294 |
| generateGlossary |  | `(ctx: GlossaryContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:317 |
| generateDecisions |  | `(ctx: DecisionsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:347 |
| generateTesting |  | `(ctx: TestingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:368 |
| generateConstraints |  | `(ctx: ConstraintsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:384 |
| generate |  | `(onChunk: (text: string) => void, config: PageConfig)` |  | src/knowledge/wiki-page-generator.ts:423 |

## UserService

源文件：`tests/fixtures/sample-project/src/user.service.ts:1`  限定名：`Users-scx-Documents-code-scx-wiki-agent.tests.fixtures.sample-project.src.user.service.UserService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| createUser |  | `(name: string)` |  | tests/fixtures/sample-project/src/user.service.ts:2 |
| deleteUser |  | `(id: string)` |  | tests/fixtures/sample-project/src/user.service.ts:6 |

## WikiFallbackBuilder

源文件：`src/knowledge/wiki-fallback-builder.ts:28`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-fallback-builder.WikiFallbackBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| buildByName |  | `(page: string, ctx: any)` | /** 按页面名派发规则生成（供 PageRegistry 调用） */ | src/knowledge/wiki-fallback-builder.ts:30 |
| buildOverview |  | `(ctx: OverviewContext)` |  | src/knowledge/wiki-fallback-builder.ts:54 |
| buildArchitecture |  | `(ctx: ArchitectureContext)` |  | src/knowledge/wiki-fallback-builder.ts:81 |
| buildDataFlow |  | `(ctx: DataFlowContext)` |  | src/knowledge/wiki-fallback-builder.ts:126 |
| buildModules |  | `(ctx: ModulesContext)` |  | src/knowledge/wiki-fallback-builder.ts:160 |
| buildApi |  | `(ctx: ApiContext)` |  | src/knowledge/wiki-fallback-builder.ts:208 |
| buildGlossary |  | `(ctx: GlossaryContext)` |  | src/knowledge/wiki-fallback-builder.ts:237 |
| buildOnboarding |  | `(ctx: OnboardingContext)` |  | src/knowledge/wiki-fallback-builder.ts:259 |
| buildTroubleshooting |  | `(ctx: TroubleshootingContext)` |  | src/knowledge/wiki-fallback-builder.ts:306 |
| buildCalls |  | `(ctx: CallsContext)` | /**\n   * calls.md：调用边表（R2 边表优于时序图）。\n   * 纯规则生成，不使用 sequenceDiagram。\n   */ | src/knowledge/wiki-fallback-builder.ts:329 |
| buildClasses |  | `(ctx: ClassesContext)` | /**\n   * classes.md：类层次与多态（降级适配）。\n   * MCP 无 INHERITS 边，只做\"类清单 + 每类方法表\"，诚实标注数据局限。\n   */ | src/knowledge/wiki-fallback-builder.ts:368 |
| buildReadme |  | `(ctx: ReadmeContext)` | /**\n   * README.md：导航索引（wiki 总入口）。\n   * 按编号目录分组索引（project-wiki「总入口：使用方式/阅读路径/核心导航」），\n   * 索引表只列本次产出的文档，链接相对 wiki 根。\n   */ | src/knowledge/wiki-fallback-builder.ts:414 |
| buildEnvironment |  | `(ctx: EnvironmentContext)` | /**\n   * environment.md：运行态信息（包名/版本/运行时/脚本/env 变量）。\n   * 纯规则生成，数据来自 ConfigDetector 探测的实际配置文件。\n   */ | src/knowledge/wiki-fallback-builder.ts:464 |
| buildTesting |  | `(ctx: TestingContext)` | /**\n   * testing.md：测试框架/配置/目录/夹具/运行命令。\n   * 纯规则生成，诚实标注未检测到的项。\n   */ | src/knowledge/wiki-fallback-builder.ts:502 |
| buildConventions |  | `(ctx: ConventionsContext)` | /**\n   * conventions.md：规约文档（AI 头号参考）。\n   * 诚实标注工具链检测结果：有 lint 则列规则，无则明确提示需人工补充。\n   * 从 AGENTS.md 提取关键规约段落。\n   */ | src/knowledge/wiki-fallback-builder.ts:524 |
| buildConstraints |  | `(ctx: ConstraintsContext)` | /**\n   * constraints.md：项目边界与代价。\n   * 限制常量（源码 MAX/LIMIT/TIMEOUT）+ 高复杂度函数表（complexity > 3）。\n   */ | src/knowledge/wiki-fallback-builder.ts:567 |
| buildCli |  | `(ctx: CliContext)` | /**\n   * cli.md：CLI 命令参考。\n   * 命令表（含 file:line）+ 每命令参数表（commander .option 解析）+ 退出码表。\n   */ | src/knowledge/wiki-fallback-builder.ts:599 |
| buildTechStack |  | `(ctx: TechStackContext)` | /**\n   * tech-stack.md：技术栈（R3 拒绝编造用途）。\n   * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。\n   */ | src/knowledge/wiki-fallback-builder.ts:645 |
| buildDecisions |  | `(ctx: DecisionsContext)` | /**\n   * decisions.md：ADR 架构决策记录。\n   * 每条 ADR：编号+状态+背景+决策+后果+相关文件（R1 锚点、R4 结构化）。\n   */ | src/knowledge/wiki-fallback-builder.ts:699 |

## FileScanner

源文件：`src/core/scanner.ts:37`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.core.scanner.FileScanner`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string)` |  | src/core/scanner.ts:41 |
| loadGitignore |  | `()` |  | src/core/scanner.ts:47 |
| isIgnored |  | `(relPath: string)` |  | src/core/scanner.ts:59 |
| scan |  | `()` |  | src/core/scanner.ts:67 |
| walkDirectory |  | `(dir: string)` |  | src/core/scanner.ts:84 |
| shouldSkipDir |  | `(dirName: string)` |  | src/core/scanner.ts:129 |
| detectTechStack |  | `(files: ScannedFile[])` |  | src/core/scanner.ts:139 |
| collectImportedPackages |  | `(files: ScannedFile[])` | /**\n   * 扫描源文件，提取所有 import 语句引用的包名。\n   * 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。\n   */ | src/core/scanner.ts:170 |
| detectProjectType |  | `(files: ScannedFile[], techStack: string[])` |  | src/core/scanner.ts:198 |
| detectSourceDirs |  | `(files: ScannedFile[])` |  | src/core/scanner.ts:222 |

## WikiService

源文件：`src/services/wiki-service.ts:28`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.wiki-service.WikiService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` |  | src/services/wiki-service.ts:29 |
| buildWiki |  | `(wikiDir: string, options?: WikiBuildOptions)` |  | src/services/wiki-service.ts:34 |
| resolvePages |  | `(requested?: string[])` | /**\n   * 解析 --pages 参数，校验页名合法性。\n   *\n   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）\n   *   + 按 projectType 激活的 surface 层（Tier2）。\n   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。\n   */ | src/services/wiki-service.ts:137 |
| cleanupLegacyFlatFiles |  | `(wikiDir: string, pages: string[])` | /**\n   * 清理旧版扁平输出（wiki 根下的 ${page}.md）。\n   * 只删除本工具拥有的页面文件；编号目录接管后这些扁平文件成为陈旧残留。\n   * readme 特例：旧 'readme.md' 让位于 'README.md'。\n   * 用目录条目精确比对文件名：大小写不敏感文件系统上 existsSync('readme.md')\n   * 会误命中 'README.md'，导致每次构建都误删并重写 README。\n   */ | src/services/wiki-service.ts:166 |
| cleanupRetiredPages |  | `(wikiDir: string)` | /** 清理已退休页面路径的残留文件（改名/下线登记于 RETIRED_WIKI_PATHS） */ | src/services/wiki-service.ts:187 |
| generatePage |  | `(\n    page: string,\n    pageContext: unknown,\n    fallback: WikiFallbackBuilder,\n    generator: WikiPageGenerator,\n    noLlm: boolean,\n    onChunk: (filename: string, text: string) => void,\n    gate?: (content: string) => boolean,\n  )` |  | src/services/wiki-service.ts:199 |
| printBuildReport |  | `(\n    written: Array<{ page: string; relPath: string; source: string; status: PageStatus }>,\n    skipped: Array<{ page: string; reason: string }>,\n    reports: PageQualityReport[],\n    legacyRemoved: string[],\n  )` | /**\n   * 构建报告（对应 project-wiki「完成后清单」）：\n   * 已写页面（新增/更新分计 + 生成路径统计）、update 模式变更摘要、\n   * 跳过页面及原因、锚点核验统计、告警汇总。\n   */ | src/services/wiki-service.ts:231 |

## UserController

源文件：`tests/fixtures/nestjs-project/src/user.controller.ts:5`  限定名：`Users-scx-Documents-code-scx-wiki-agent.tests.fixtures.nestjs-project.src.user.controller.UserController`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(private readonly userService: UserService)` |  | tests/fixtures/nestjs-project/src/user.controller.ts:6 |
| createUser |  | `(@Body() dto: CreateUserDto)` |  | tests/fixtures/nestjs-project/src/user.controller.ts:9 |
| getUser |  | `(@Param('id') id: string)` |  | tests/fixtures/nestjs-project/src/user.controller.ts:14 |
## Related

- 同目录：[calls.md](calls.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
