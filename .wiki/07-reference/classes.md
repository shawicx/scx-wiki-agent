# 类

<details>
<summary>Relevant source files</summary>

- src/core/scanner.ts
- src/knowledge/config-detector/detector.ts
- src/knowledge/context/index.ts
- src/knowledge/generator/index.ts
- src/knowledge/outline-planner.ts
- src/knowledge/wiki-builder.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
</details>

> ⚠️ **待确认**：MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现（证据不足，禁止猜测；请人工补充后移除本标记）

## WikiContextBuilder

源文件：`src/knowledge/context/index.ts:75`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.context.WikiContextBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    client: CodebaseMemoryClient,\n    scanResult: ScanResult,\n    detector: ConfigDetector,\n  )` | — | src/knowledge/context/index.ts:78 |
| setIntentProvider |  | `(provider: IntentEvidenceProvider)` | — | src/knowledge/context/index.ts:86 |
| setTopics |  | `(topics: TopicDefinition[])` | — | src/knowledge/context/index.ts:90 |
| setOutlineChapters |  | `(chapters: OutlineChapter[])` | — | src/knowledge/context/index.ts:94 |
| buildByName |  | `(page: string, plannedPages?: string[])` | 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 | src/knowledge/context/index.ts:99 |
| dispatchContext |  | `(page: string, plannedPages?: string[])` | — | src/knowledge/context/index.ts:105 |
| enrichIfThinEvidence |  | `(page: string, ctx: unknown)` | 证据补强（DeepWiki「二次扩展检索」的图谱版）： LLM 路径的 structure 页证据文件低于下限时，从图谱补一批高复杂度真实符号， 只保留扫描清单内的文件路径。图谱查无的热点/入口名回落源码正则探测 （mcp 对 .vue/部… | src/knowledge/context/index.ts:145 |
| getDepNames |  | `()` | — | src/knowledge/context/index.ts:149 |
| getFallbackSymbolNames |  | `()` | — | src/knowledge/context/index.ts:153 |
| buildOverviewContext |  | `()` | — | src/knowledge/context/index.ts:157 |
| buildArchitectureContext |  | `()` | — | src/knowledge/context/index.ts:161 |
| buildDataFlowContext |  | `()` | — | src/knowledge/context/index.ts:165 |
| buildModulesContext |  | `()` | — | src/knowledge/context/index.ts:169 |
| buildApiContext |  | `()` | — | src/knowledge/context/index.ts:173 |
| buildOnboardingContext |  | `()` | — | src/knowledge/context/index.ts:177 |
| buildTroubleshootingContext |  | `()` | — | src/knowledge/context/index.ts:181 |
| buildGlossaryContext |  | `()` | — | src/knowledge/context/index.ts:185 |
| buildCallsContext |  | `()` | — | src/knowledge/context/index.ts:189 |
| buildClassesContext |  | `()` | — | src/knowledge/context/index.ts:193 |
| buildReadmeContext |  | `(plannedPages?: string[])` | — | src/knowledge/context/index.ts:197 |
| buildEnvironmentContext |  | `()` | — | src/knowledge/context/index.ts:201 |
| buildTestingContext |  | `()` | — | src/knowledge/context/index.ts:205 |
| buildConventionsContext |  | `()` | — | src/knowledge/context/index.ts:209 |
| buildConstraintsContext |  | `()` | — | src/knowledge/context/index.ts:213 |
| buildDecisionsContext |  | `()` | — | src/knowledge/context/index.ts:217 |
| buildCliContext |  | `()` | — | src/knowledge/context/index.ts:221 |
| buildTechStackContext |  | `()` | — | src/knowledge/context/index.ts:225 |
| buildTopicContext |  | `(topicId: string)` | — | src/knowledge/context/index.ts:229 |
| buildChapterPageContext |  | `(page: string)` | — | src/knowledge/context/index.ts:233 |

## OutlinePlanner

源文件：`src/knowledge/outline-planner.ts:42`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.outline-planner.OutlinePlanner`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` | — | src/knowledge/outline-planner.ts:43 |
| plan |  | `(\n    generator: WikiPageGenerator,\n    topics: TopicDefinition[],\n    feedback?: string,\n  )` | 提议章节树。feedback 非空时为带剔除原因的反馈重试。 LLM 输出不可解析返回 null（不抛异常）。 | src/knowledge/outline-planner.ts:52 |
| buildInputs |  | `(topics: TopicDefinition[], feedback?: string)` | 确定性组装规划输入（全部真实数据，无臆造字段） | src/knowledge/outline-planner.ts:70 |
| readPackageDescription |  | `()` | — | src/knowledge/outline-planner.ts:131 |
| readReadmeExcerpt |  | `()` | — | src/knowledge/outline-planner.ts:141 |

## FileScanner

源文件：`src/core/scanner.ts:43`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.core.scanner.FileScanner`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string)` | — | src/core/scanner.ts:47 |
| loadGitignore |  | `()` | — | src/core/scanner.ts:53 |
| isIgnored |  | `(relPath: string)` | — | src/core/scanner.ts:65 |
| scan |  | `()` | — | src/core/scanner.ts:73 |
| walkDirectory |  | `(dir: string)` | — | src/core/scanner.ts:100 |
| shouldSkipDir |  | `(dirName: string)` | — | src/core/scanner.ts:147 |
| detectTechStack |  | `(productionFiles: ScannedFile[], testFiles: ScannedFile[])` | — | src/core/scanner.ts:157 |
| collectImportedPackages |  | `(files: ScannedFile[])` | 扫描源文件，提取所有 import 语句引用的包名。 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。 覆盖 ES import / require / 动态 import，以及 CSS `@import \"pkg\"… | src/core/scanner.ts:192 |
| detectProjectType |  | `(techStack: string[])` | — | src/core/scanner.ts:218 |
| looksLikeLibrary |  | `()` | package.json 发布形态判定：exports 字段（显式）或 main+types 无 bin（隐式） | src/core/scanner.ts:252 |
| workspaceHasPackages |  | `(relPath: string)` | pnpm-workspace.yaml 是否声明了 packages（无该字段的审批型配置不算 workspace） | src/core/scanner.ts:265 |
| detectSourceDirs |  | `(files: ScannedFile[])` | — | src/core/scanner.ts:274 |

## ScanService

源文件：`src/services/scan-service.ts:3`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.scan-service.ScanService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string)` | — | src/services/scan-service.ts:6 |
| scan |  | `()` | — | src/services/scan-service.ts:10 |

## ConfigDetector

源文件：`src/knowledge/config-detector/detector.ts:45`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.config-detector.detector.ConfigDetector`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(private rootDir: string)` | — | src/knowledge/config-detector/detector.ts:48 |
| setSourceFiles |  | `(files: string[])` | 兼容入口：预设全量源文件，内部仍按生产/测试口径拆分 | src/knowledge/config-detector/detector.ts:51 |
| setSourceClassification |  | `(input: { production: string[]; test: string[] })` | 生产构建路径使用的显式分类入口（与 FileScanner 的 scope 同口径） | src/knowledge/config-detector/detector.ts:56 |
| ensureSourceClassification |  | `()` | 懒加载源文件分类：未预设则自动扫描常见生产/测试目录 | src/knowledge/config-detector/detector.ts:61 |
| getSourceFiles |  | `(scope: 'production' | 'test' | 'all' = 'all')` | — | src/knowledge/config-detector/detector.ts:67 |
| detectEnvironment |  | `()` | — | src/knowledge/config-detector/detector.ts:74 |
| detectConventions |  | `()` | — | src/knowledge/config-detector/detector.ts:84 |
| readPackageJsonLoose |  | `()` | 读取 package.json（容错），供依赖/脚本反推 | src/knowledge/config-detector/detector.ts:120 |
| detectTesting |  | `()` | — | src/knowledge/config-detector/detector.ts:135 |
| detectConstraints |  | `()` | — | src/knowledge/config-detector/detector.ts:223 |
| extractEnvVars |  | `(files: string[])` | 从指定源码提取 process.env.XXX 引用（跳过注释行） | src/knowledge/config-detector/detector.ts:228 |
| extractConstants |  | `(files: string[])` | — | src/knowledge/config-detector/detector.ts:257 |
| detectTestOnlyDeps |  | `(\n    productionFiles: string[],\n    testFiles: string[],\n  )` | — | src/knowledge/config-detector/detector.ts:283 |
| collectImportMap |  | `(files: string[])` | — | src/knowledge/config-detector/detector.ts:311 |

## CodebaseMemoryClient

源文件：`src/mcp/codebase-memory-client.ts:119`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.mcp.codebase-memory-client.CodebaseMemoryClient`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(repoPath: string, binaryPath?: string)` | — | src/mcp/codebase-memory-client.ts:124 |
| ensureIndexed |  | `(mode: 'fast' | 'moderate' | 'full' = 'moderate')` | 确保图谱已索引（幂等） | src/mcp/codebase-memory-client.ts:131 |
| getArchitecture |  | `()` | 架构概览 | src/mcp/codebase-memory-client.ts:140 |
| tracePath |  | `(\n    functionName: string,\n    direction: 'inbound' | 'outbound' | 'both' = 'both',\n    depth = 6,\n  )` | 双向调用链追踪 | src/mcp/codebase-memory-client.ts:150 |
| getCodeSnippet |  | `(qualifiedName: string)` | 代码片段+元数据 | src/mcp/codebase-memory-client.ts:166 |
| queryGraph |  | `(cypher: string, maxRows = 100)` | Cypher 查询 | src/mcp/codebase-memory-client.ts:175 |
| searchCode |  | `(pattern: string, limit = 20)` | 词法搜索存在性探测（grep + 图谱增强的 files 模式）。 默认字面量匹配（regex=false）；totalGrepMatches > 0 即字面量在仓库中存在 （含 import/注释/配置中的出现），适合断言核验的兜底通道。 | src/mcp/codebase-memory-client.ts:191 |
| searchCodeMatches |  | `(pattern: string, limit = 20)` | 词法搜索的 (file, line) 命中清单（compact 模式）： 图谱符号内命中（rows[].matches 行号）+ 符号外原始命中（raw_matches.rows）合并。 断言核验的证据分类通道：调用方可读取命中行内容，区分… | src/mcp/codebase-memory-client.ts:211 |
| exec |  | `(tool: string, args: Record<string, unknown>)` | // --- 内部方法 --- | src/mcp/codebase-memory-client.ts:250 |
| parseJsonOutput |  | `(raw: string)` | 解析子进程 stdout。 MCP 的 info 日志（`level=info msg=...`）可能泄漏到 stdout， 因此从末尾向前找最后一个完整的 JSON 对象。 | src/mcp/codebase-memory-client.ts:273 |
| toProjectName |  | `(repoPath: string)` | 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`） | src/mcp/codebase-memory-client.ts:289 |
| findBinary |  | `()` | — | src/mcp/codebase-memory-client.ts:293 |

## WikiBuilder

源文件：`src/knowledge/wiki-builder.ts:7`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-builder.WikiBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| addTitle |  | `(title: string)` | Add a top-level title: `# title` | src/knowledge/wiki-builder.ts:11 |
| addSection |  | `(title: string, content: string)` | Add a second-level section: `## title` +（content 非空时）`\ \ content` | src/knowledge/wiki-builder.ts:17 |
| addSubSection |  | `(title: string, content: string)` | Add a third-level sub-section: `### title` +（content 非空时）`\ \ content` | src/knowledge/wiki-builder.ts:23 |
| addParagraph |  | `(text: string)` | Add a plain paragraph. | src/knowledge/wiki-builder.ts:29 |
| addCodeBlock |  | `(language: string, code: string)` | Add a fenced code block with an optional language hint. | src/knowledge/wiki-builder.ts:35 |
| addTable |  | `(headers: string[], rows: string[][])` | Add a markdown table from headers and rows. | src/knowledge/wiki-builder.ts:41 |
| addBulletList |  | `(items: string[])` | Add a bullet list. | src/knowledge/wiki-builder.ts:50 |
| addNewline |  | `()` | Add an empty line. | src/knowledge/wiki-builder.ts:56 |
| build |  | `()` | Join all sections with newlines and return the final document. | src/knowledge/wiki-builder.ts:62 |

## WikiPageGenerator

源文件：`src/knowledge/generator/index.ts:60`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.generator.WikiPageGenerator`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    modelName?: string,\n    baseURL?: string,\n    apiKey?: string,\n    onNotice?: (notice: PageGenNotice) => void,\n    settings?: GeneratorSettings,\n  )` | — | src/knowledge/generator/index.ts:63 |
| hasModel |  | `()` | — | src/knowledge/generator/index.ts:87 |
| plan |  | `(systemPrompt: string, userPrompt: string)` | 规划类调用的原始文本（章节树 planner 复用模型与续写能力；不做 sanitize） | src/knowledge/generator/index.ts:92 |
| generateByName |  | `(page: string, ctx: any, onChunk: (text: string) => void)` | 按页面名派发 LLM 生成（供 PageRegistry 调用） | src/knowledge/generator/index.ts:99 |
| generateOverview |  | `(ctx: OverviewContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:130 |
| generateArchitecture |  | `(ctx: ArchitectureContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:134 |
| generateDataFlow |  | `(ctx: DataFlowContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:138 |
| generateModules |  | `(ctx: ModulesContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:142 |
| generateApi |  | `(ctx: ApiContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:146 |
| generateOnboarding |  | `(ctx: OnboardingContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:150 |
| generateTroubleshooting |  | `(ctx: TroubleshootingContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:154 |
| generateGlossary |  | `(ctx: GlossaryContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:158 |
| generatePublicApi |  | `(ctx: PublicApiContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:162 |
| generateRoutes |  | `(ctx: RoutesContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:166 |
| generateComponents |  | `(ctx: ComponentsContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:170 |

## 本页确定知道的事实

- 检出类 8 个，成员方法共 98 个
- 带 docstring 说明的方法 33 个

## 未知项

- 图谱无 INHERITS 边：继承树与多态实现未检出
- 65 个方法无 docstring，说明列为确定性摘要缺失（以签名与锚点为准）
## Related

- 同目录：[calls.md](calls.md) · [glossary.md](glossary.md)
- 共享 2 个源文件、共享 5 个符号：[topic:topic-9.md](../08-topics/topic-9.md)
- 共享 3 个源文件：[decisions.md](../04-design/decisions.md)
- 共享 2 个源文件：[overview.md](../01-overview/overview.md)
- 总入口：[README](../README.md)
