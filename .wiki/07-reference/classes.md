# Classes

<details>
<summary>Relevant source files</summary>

- src/core/scanner.ts
- src/knowledge/config-detector.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki-service.ts
</details>

> ⚠️ **待确认**：MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现（证据不足，禁止猜测；请人工补充后移除本标记）

## ConfigDetector

源文件：`src/knowledge/config-detector.ts:56`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.config-detector.ConfigDetector`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(private rootDir: string)` |  | src/knowledge/config-detector.ts:59 |
| setSourceFiles |  | `(files: string[])` | /** 预设源文件绝对路径列表（供 env/常量探测复用，避免重复扫描） */ | src/knowledge/config-detector.ts:62 |
| getSourceFiles |  | `()` | /** 懒加载源文件列表：未预设则扫描 KNOWN_SOURCE_DIRS 下的代码文件 */ | src/knowledge/config-detector.ts:67 |
| walkCodeFiles |  | `(dir: string, acc: string[])` |  | src/knowledge/config-detector.ts:80 |
| detectEnvironment |  | `()` |  | src/knowledge/config-detector.ts:103 |
| detectConventions |  | `()` |  | src/knowledge/config-detector.ts:154 |
| readPackageJsonLoose |  | `()` | /** 读取 package.json（容错），供依赖/脚本反推 */ | src/knowledge/config-detector.ts:180 |
| detectTesting |  | `()` |  | src/knowledge/config-detector.ts:195 |
| detectConstraints |  | `()` |  | src/knowledge/config-detector.ts:257 |
| extractEnvVars |  | `()` | /** 从源码提取 process.env.XXX 引用（跳过注释行） */ | src/knowledge/config-detector.ts:283 |

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

## WikiBuilder

源文件：`src/knowledge/wiki-builder.ts:7`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-builder.WikiBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| addTitle |  | `(title: string)` | /** Add a top-level title: `# title` */ | src/knowledge/wiki-builder.ts:11 |
| addSection |  | `(title: string, content: string)` | /** Add a second-level section: `## title` +（content 非空时）`\\n\\ncontent` */ | src/knowledge/wiki-builder.ts:17 |
| addSubSection |  | `(title: string, content: string)` | /** Add a third-level sub-section: `### title` +（content 非空时）`\\n\\ncontent` */ | src/knowledge/wiki-builder.ts:23 |
| addParagraph |  | `(text: string)` | /** Add a plain paragraph. */ | src/knowledge/wiki-builder.ts:29 |
| addCodeBlock |  | `(language: string, code: string)` | /** Add a fenced code block with an optional language hint. */ | src/knowledge/wiki-builder.ts:35 |
| addTable |  | `(headers: string[], rows: string[][])` | /** Add a markdown table from headers and rows. */ | src/knowledge/wiki-builder.ts:41 |
| addBulletList |  | `(items: string[])` | /** Add a bullet list. */ | src/knowledge/wiki-builder.ts:50 |
| addNewline |  | `()` | /** Add an empty line. */ | src/knowledge/wiki-builder.ts:56 |
| build |  | `()` | /** Join all sections with newlines and return the final document. */ | src/knowledge/wiki-builder.ts:62 |

## TopicDiscovery

源文件：`src/knowledge/topic-discovery.ts:35`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.topic-discovery.TopicDiscovery`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` |  | src/knowledge/topic-discovery.ts:36 |
| discover |  | `()` |  | src/knowledge/topic-discovery.ts:41 |
| fromClusters |  | `(arch: ArchitectureData)` |  | src/knowledge/topic-discovery.ts:51 |
| topicTitle |  | `(cluster: ArchitectureData['clusters'][number])` | /**\n   * 标题规则：label 是目录路径（或落在 sourceDirs）时无区分度，\n   * 改用聚类首个主导符号命名（确定性，无 LLM）。\n   */ | src/knowledge/topic-discovery.ts:75 |
| fromBoundaries |  | `(arch: ArchitectureData)` |  | src/knowledge/topic-discovery.ts:84 |
| filesForSymbols |  | `(names: string[])` | /** 符号名 → 扫描清单内的生产文件路径（去重，过滤测试路径） */ | src/knowledge/topic-discovery.ts:101 |
| packagesForFiles |  | `(files: string[], arch: ArchitectureData)` |  | src/knowledge/topic-discovery.ts:116 |

## ScanService

源文件：`src/services/scan-service.ts:3`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.scan-service.ScanService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string)` |  | src/services/scan-service.ts:6 |
| scan |  | `()` |  | src/services/scan-service.ts:10 |

## WikiService

源文件：`src/services/wiki-service.ts:30`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.wiki-service.WikiService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` |  | src/services/wiki-service.ts:31 |
| buildWiki |  | `(wikiDir: string, options?: WikiBuildOptions)` |  | src/services/wiki-service.ts:36 |
| resolvePages |  | `(requested: string[] | undefined, topicPages: string[])` | /**\n   * 解析 --pages 参数，校验页名合法性。\n   *\n   * 默认页面集 = 全部非 surface 页面（Tier0 结构层 + Tier1 运行规约层）\n   *   + 按 projectType 激活的 surface 层（Tier2）。\n   * surface 页面（cli/routes/components/...）只在对应项目类型下默认生成。\n   */ | src/services/wiki-service.ts:150 |
| cleanupLegacyFlatFiles |  | `(wikiDir: string, pages: string[])` | /**\n   * 清理旧版扁平输出（wiki 根下的 ${page}.md）。\n   * 只删除本工具拥有的页面文件；编号目录接管后这些扁平文件成为陈旧残留。\n   * readme 特例：旧 'readme.md' 让位于 'README.md'。\n   * 用目录条目精确比对文件名：大小写不敏感文件系统上 existsSync('readme.md')\n   * 会误命中 'README.md'，导致每次构建都误删并重写 README。\n   */ | src/services/wiki-service.ts:179 |
| cleanupRetiredPages |  | `(wikiDir: string)` | /** 清理已退休页面路径的残留文件（改名/下线登记于 RETIRED_WIKI_PATHS） */ | src/services/wiki-service.ts:200 |
| cleanupStaleTopicPages |  | `(wikiDir: string, pages: string[])` | /** 清理 08-topics 下未列入本次计划的主题文件（目录为工具所有） */ | src/services/wiki-service.ts:213 |
| generatePage |  | `(\n    page: string,\n    pageContext: unknown,\n    fallback: WikiFallbackBuilder,\n    generator: WikiPageGenerator,\n    noLlm: boolean,\n    onChunk: (filename: string, text: string) => void,\n    gate?: (content: string) => boolean,\n  )` |  | src/services/wiki-service.ts:226 |
| printBuildReport |  | `(\n    written: Array<{ page: string; relPath: string; source: string; status: PageStatus }>,\n    skipped: Array<{ page: string; reason: string }>,\n    reports: PageQualityReport[],\n    legacyRemoved: string[],\n  )` | /**\n   * 构建报告（对应 project-wiki「完成后清单」）：\n   * 已写页面（新增/更新分计 + 生成路径统计）、update 模式变更摘要、\n   * 跳过页面及原因、锚点核验统计、告警汇总。\n   */ | src/services/wiki-service.ts:258 |

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

## WikiPageGenerator

源文件：`src/knowledge/wiki-page-generator.ts:25`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-page-generator.WikiPageGenerator`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(modelName?: string, baseURL?: string, apiKey?: string)` |  | src/knowledge/wiki-page-generator.ts:28 |
| hasModel |  | `()` |  | src/knowledge/wiki-page-generator.ts:46 |
| generateByName |  | `(page: string, ctx: any, onChunk: (text: string) => void)` | /** 按页面名派发 LLM 生成（供 PageRegistry 调用） */ | src/knowledge/wiki-page-generator.ts:51 |
| generateOverview |  | `(ctx: OverviewContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:69 |
| generateArchitecture |  | `(ctx: ArchitectureContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:107 |
| generateDataFlow |  | `(ctx: DataFlowContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:151 |
| generateModules |  | `(ctx: ModulesContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:185 |
| generateApi |  | `(ctx: ApiContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:231 |
| generateOnboarding |  | `(ctx: OnboardingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:271 |
| generateTroubleshooting |  | `(ctx: TroubleshootingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:300 |
| generateGlossary |  | `(ctx: GlossaryContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:329 |
| generateTopic |  | `(ctx: TopicContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:359 |
| generateDecisions |  | `(ctx: DecisionsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:397 |
| generateTesting |  | `(ctx: TestingContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:418 |
| generateConstraints |  | `(ctx: ConstraintsContext, onChunk: (text: string) => void)` |  | src/knowledge/wiki-page-generator.ts:434 |
| generate |  | `(onChunk: (text: string) => void, config: PageConfig)` |  | src/knowledge/wiki-page-generator.ts:473 |

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
| buildGlossary |  | `(ctx: GlossaryContext)` |  | src/knowledge/wiki-fallback-builder.ts:245 |
| buildOnboarding |  | `(ctx: OnboardingContext)` |  | src/knowledge/wiki-fallback-builder.ts:267 |
| buildTroubleshooting |  | `(ctx: TroubleshootingContext)` |  | src/knowledge/wiki-fallback-builder.ts:314 |
| buildCalls |  | `(ctx: CallsContext)` | /**\n   * calls.md：调用边表（R2 边表优于时序图）。\n   * 纯规则生成，不使用 sequenceDiagram。\n   */ | src/knowledge/wiki-fallback-builder.ts:369 |
| buildClasses |  | `(ctx: ClassesContext)` | /**\n   * classes.md：类层次与多态（降级适配）。\n   * MCP 无 INHERITS 边，只做\"类清单 + 每类方法表\"，诚实标注数据局限。\n   */ | src/knowledge/wiki-fallback-builder.ts:408 |
| buildReadme |  | `(ctx: ReadmeContext)` | /**\n   * README.md：导航索引（wiki 总入口）。\n   * 按编号目录分组索引（project-wiki「总入口：使用方式/阅读路径/核心导航」），\n   * 索引表只列本次产出的文档，链接相对 wiki 根。\n   */ | src/knowledge/wiki-fallback-builder.ts:454 |
| buildEnvironment |  | `(ctx: EnvironmentContext)` | /**\n   * environment.md：运行态信息（包名/版本/运行时/脚本/env 变量）。\n   * 纯规则生成，数据来自 ConfigDetector 探测的实际配置文件。\n   */ | src/knowledge/wiki-fallback-builder.ts:504 |
| buildTesting |  | `(ctx: TestingContext)` | /**\n   * testing.md：测试框架/配置/目录/夹具/运行命令。\n   * 纯规则生成，诚实标注未检测到的项。\n   */ | src/knowledge/wiki-fallback-builder.ts:542 |
| buildConventions |  | `(ctx: ConventionsContext)` | /**\n   * conventions.md：规约文档（AI 头号参考）。\n   * 诚实标注工具链检测结果：有 lint 则列规则，无则明确提示需人工补充。\n   * 从 AGENTS.md 提取关键规约段落。\n   */ | src/knowledge/wiki-fallback-builder.ts:564 |
| buildConstraints |  | `(ctx: ConstraintsContext)` | /**\n   * constraints.md：项目边界与代价。\n   * 限制常量（源码 MAX/LIMIT/TIMEOUT）+ 高复杂度函数表（complexity > 3）。\n   */ | src/knowledge/wiki-fallback-builder.ts:607 |
| buildCli |  | `(ctx: CliContext)` | /**\n   * cli.md：CLI 命令参考。\n   * 命令表（含 file:line）+ 每命令参数表（commander .option 解析）+ 退出码表。\n   */ | src/knowledge/wiki-fallback-builder.ts:639 |
| buildTechStack |  | `(ctx: TechStackContext)` | /**\n   * tech-stack.md：技术栈（R3 拒绝编造用途）。\n   * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。\n   */ | src/knowledge/wiki-fallback-builder.ts:685 |
| buildTopic |  | `(ctx: TopicContext)` | /**\n   * 主题页：仓库专属跨模块协作面（图谱推导）。\n   * 规则模板：文件清单 + 符号表 + CALLS 边表 + 跨包边界。\n   */ | src/knowledge/wiki-fallback-builder.ts:739 |
| buildDecisions |  | `(ctx: DecisionsContext)` | /**\n   * decisions.md：ADR 架构决策记录。\n   * 每条 ADR：编号+状态+背景+决策+后果+相关文件（R1 锚点、R4 结构化）。\n   */ | src/knowledge/wiki-fallback-builder.ts:784 |

## WikiContextBuilder

源文件：`src/knowledge/wiki-context-builder.ts:52`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-context-builder.WikiContextBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n    private detector: ConfigDetector,\n  )` |  | src/knowledge/wiki-context-builder.ts:53 |
## Related

- 同目录：[calls.md](calls.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
