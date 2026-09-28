# Classes

<details>
<summary>Relevant source files</summary>

- src/core/scanner.ts
- src/knowledge/config-detector.ts
- src/knowledge/intent-evidence.ts
- src/knowledge/outline-planner.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
</details>

> ⚠️ **待确认**：MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现（证据不足，禁止猜测；请人工补充后移除本标记）

## ScanService

源文件：`src/services/scan-service.ts:3`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.scan-service.ScanService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string)` |  | src/services/scan-service.ts:6 |
| scan |  | `()` |  | src/services/scan-service.ts:10 |

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

## ConfigDetector

源文件：`src/knowledge/config-detector.ts:56`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.config-detector.ConfigDetector`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(private rootDir: string)` |  | src/knowledge/config-detector.ts:59 |
| setSourceFiles |  | `(files: string[])` | /** 预设源文件绝对路径列表（供 env/常量探测复用，避免重复扫描） */ | src/knowledge/config-detector.ts:62 |
| getSourceFiles |  | `()` | /** 懒加载源文件列表：未预设则扫描 KNOWN_SOURCE_DIRS 下的代码文件 */ | src/knowledge/config-detector.ts:67 |
| walkCodeFiles |  | `(dir: string, acc: string[])` |  | src/knowledge/config-detector.ts:80 |
| detectEnvironment |  | `()` |  | src/knowledge/config-detector.ts:103 |
| detectConventions |  | `()` |  | src/knowledge/config-detector.ts:157 |
| readPackageJsonLoose |  | `()` | /** 读取 package.json（容错），供依赖/脚本反推 */ | src/knowledge/config-detector.ts:193 |
| detectTesting |  | `()` |  | src/knowledge/config-detector.ts:208 |
| detectConstraints |  | `()` |  | src/knowledge/config-detector.ts:278 |
| extractEnvVars |  | `()` | /** 从源码提取 process.env.XXX 引用（跳过注释行） */ | src/knowledge/config-detector.ts:304 |

## OutlinePlanner

源文件：`src/knowledge/outline-planner.ts:42`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.outline-planner.OutlinePlanner`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` |  | src/knowledge/outline-planner.ts:43 |
| plan |  | `(\n    generator: WikiPageGenerator,\n    topics: TopicDefinition[],\n    feedback?: string,\n  )` | /**\n   * 提议章节树。feedback 非空时为带剔除原因的反馈重试。\n   * LLM 输出不可解析返回 null（不抛异常）。\n   */ | src/knowledge/outline-planner.ts:52 |
| buildInputs |  | `(topics: TopicDefinition[], feedback?: string)` | /** 确定性组装规划输入（全部真实数据，无臆造字段） */ | src/knowledge/outline-planner.ts:70 |
| readPackageDescription |  | `()` |  | src/knowledge/outline-planner.ts:133 |
| readReadmeExcerpt |  | `()` |  | src/knowledge/outline-planner.ts:143 |

## TopicDiscovery

源文件：`src/knowledge/topic-discovery.ts:59`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.topic-discovery.TopicDiscovery`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` |  | src/knowledge/topic-discovery.ts:60 |
| discover |  | `()` |  | src/knowledge/topic-discovery.ts:65 |
| fromClusters |  | `(arch: ArchitectureData)` |  | src/knowledge/topic-discovery.ts:75 |
| topicDefinition |  | `(\n    cluster: ArchitectureData['clusters'][number],\n    files: string[],\n    pkgs: string[],\n    usedIds: Set<string>,\n  )` | /**\n   * 主题命名（语义优先级）：\n   * 1. cluster.label 为语义文本时直接用作标题；\n   * 2. 模块复合命名：主题文件目录段（剔通用段）按频次取前几个合成\n   *    「A · B · C 跨模块协作」——单个主导符号（如 refreshMirror）不描述\n   *    跨模块协作面，且可能与上下文符号清单脱节；模块名才是稳定语义锚；\n   * 3. 跨包名联合（packages 粒度更粗时的兑底）。\n   * id 用命名源的 keb | src/knowledge/topic-discovery.ts:106 |
| moduleTokensForFiles |  | `(files: string[])` | /**\n   * 从主题文件提取模块语义段：剔除通用目录段与 sourceDirs 后，按文件频次排名；\n   * 与已选段同链共现的祖先/后代段跳过（frontends 与其子目录 xterm 只取其一）。\n   */ | src/knowledge/topic-discovery.ts:134 |
| fromBoundaries |  | `(arch: ArchitectureData)` |  | src/knowledge/topic-discovery.ts:162 |
| filesForSymbols |  | `(names: string[])` | /** 符号名 → 扫描清单内的生产文件路径（去重，过滤测试路径） */ | src/knowledge/topic-discovery.ts:179 |
| packagesForFiles |  | `(files: string[], arch: ArchitectureData)` |  | src/knowledge/topic-discovery.ts:194 |

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
| searchCode |  | `(pattern: string)` | /**\n   * 词法搜索存在性探测（grep + 图谱增强的 files 模式）。\n   * 默认字面量匹配（regex=false）；totalGrepMatches > 0 即字面量在仓库中存在\n   * （含 import/注释/配置中的出现），适合断言核验的兜底通道。\n   */ | src/mcp/codebase-memory-client.ts:191 |
| exec |  | `(tool: string, args: Record<string, unknown>)` | // --- 内部方法 --- | src/mcp/codebase-memory-client.ts:207 |
| parseJsonOutput |  | `(raw: string)` | /**\n   * 解析子进程 stdout。\n   * MCP 的 info 日志（`level=info msg=...`）可能泄漏到 stdout，\n   * 因此从末尾向前找最后一个完整的 JSON 对象。\n   */ | src/mcp/codebase-memory-client.ts:230 |
| toProjectName |  | `(repoPath: string)` | /** 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`） */ | src/mcp/codebase-memory-client.ts:246 |
| findBinary |  | `()` |  | src/mcp/codebase-memory-client.ts:250 |

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
| collectImportedPackages |  | `(files: ScannedFile[])` | /**\n   * 扫描源文件，提取所有 import 语句引用的包名。\n   * 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。\n   * 覆盖 ES import / require / 动态 import，以及 CSS `@import \"pkg\"`\n   * （tailwind 插件类依赖的常见引入方式，如 tw-animate-css）。\n   */ | src/core/scanner.ts:172 |
| detectProjectType |  | `(files: ScannedFile[], techStack: string[])` |  | src/core/scanner.ts:198 |
| workspaceHasPackages |  | `(relPath: string)` | /** pnpm-workspace.yaml 是否声明了 packages（无该字段的审批型配置不算 workspace） */ | src/core/scanner.ts:225 |
| detectSourceDirs |  | `(files: ScannedFile[])` |  | src/core/scanner.ts:234 |

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

## IntentEvidenceProvider

源文件：`src/knowledge/intent-evidence.ts:203`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.intent-evidence.IntentEvidenceProvider`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(private scanResult: ScanResult, opts?: IntentProviderOptions)` |  | src/knowledge/intent-evidence.ts:220 |
| fileComments |  | `(files: string[])` | /** 指定文件集的注释证据（file-header / symbol-comment / why-marker / const-comment） */ | src/knowledge/intent-evidence.ts:229 |
| constComments |  | `(files: string[])` | /** 限制常量注释（constraints 页：常量「防什么」的直接证据） */ | src/knowledge/intent-evidence.ts:238 |
| whyMarkers |  | `(limit: number)` | /** 仓库级 why-marker 采样（troubleshooting 页：真实风险信号） */ | src/knowledge/intent-evidence.ts:243 |
| commentsForFile |  | `(rel: string)` |  | src/knowledge/intent-evidence.ts:253 |
| gitForFile |  | `(rel: string)` | /** 单文件 git 聚合（不可用/无提交返回 null；构建内缓存） */ | src/knowledge/intent-evidence.ts:365 |
| repoGitSubjects |  | `()` | /** 仓库级近期提交（依赖引入决策的证据池） */ | src/knowledge/intent-evidence.ts:387 |
| depCommitEvidence |  | `(deps: string[])` | /** 依赖相关提交主题（tech-stack 选型理由 / decisions 依赖引入决策） */ | src/knowledge/intent-evidence.ts:400 |
| churnEvidence |  | `(limit: number)` | /** 高频变更信号（troubleshooting 维护风险 / decisions 热点） */ | src/knowledge/intent-evidence.ts:420 |
## Related

- 同目录：[calls.md](calls.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
