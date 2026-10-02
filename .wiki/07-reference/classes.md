# 类

<details>
<summary>Relevant source files</summary>

- src/knowledge/config-detector/detector.ts
- src/knowledge/context/index.ts
- src/knowledge/generator/index.ts
- src/knowledge/topic-discovery.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki/service.ts
- src/services/wiki/verification.ts
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

## ConfigDetector

源文件：`src/knowledge/config-detector/detector.ts:46`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.config-detector.detector.ConfigDetector`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(private rootDir: string)` | — | src/knowledge/config-detector/detector.ts:49 |
| setSourceFiles |  | `(files: string[])` | 兼容入口：预设全量源文件，内部仍按生产/测试口径拆分 | src/knowledge/config-detector/detector.ts:52 |
| setSourceClassification |  | `(input: { production: string[]; test: string[] })` | 生产构建路径使用的显式分类入口（与 FileScanner 的 scope 同口径） | src/knowledge/config-detector/detector.ts:57 |
| ensureSourceClassification |  | `()` | 懒加载源文件分类：未预设则自动扫描常见生产/测试目录 | src/knowledge/config-detector/detector.ts:62 |
| getSourceFiles |  | `(scope: 'production' | 'test' | 'all' = 'all')` | — | src/knowledge/config-detector/detector.ts:68 |
| detectEnvironment |  | `()` | — | src/knowledge/config-detector/detector.ts:75 |
| detectConventions |  | `()` | — | src/knowledge/config-detector/detector.ts:85 |
| readPackageJsonLoose |  | `()` | 读取 package.json（容错），供依赖/脚本反推 | src/knowledge/config-detector/detector.ts:121 |
| detectTesting |  | `()` | — | src/knowledge/config-detector/detector.ts:136 |
| detectConstraints |  | `()` | — | src/knowledge/config-detector/detector.ts:224 |
| extractEnvVars |  | `(files: string[])` | 从指定源码提取 process.env.XXX 引用（跳过注释行） | src/knowledge/config-detector/detector.ts:229 |
| extractConstants |  | `(files: string[])` | — | src/knowledge/config-detector/detector.ts:260 |
| detectTestOnlyDeps |  | `(\n    productionFiles: string[],\n    testFiles: string[],\n  )` | — | src/knowledge/config-detector/detector.ts:297 |
| collectImportMap |  | `(files: string[])` | — | src/knowledge/config-detector/detector.ts:325 |

## ScanService

源文件：`src/services/scan-service.ts:3`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.scan-service.ScanService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string)` | — | src/services/scan-service.ts:6 |
| scan |  | `()` | — | src/services/scan-service.ts:10 |

## WikiService

源文件：`src/services/wiki/service.ts:62`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.wiki.service.WikiService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` | — | src/services/wiki/service.ts:65 |
| buildWiki |  | `(wikiDir: string, options?: WikiBuildOptions)` | — | src/services/wiki/service.ts:72 |
| safeGraphLanguages |  | `()` | 图谱语言覆盖（fail-open：查询失败返回 undefined 不占报告行） | src/services/wiki/service.ts:322 |
| planOutline |  | `(\n    generator: WikiPageGenerator,\n    topics: TopicDefinition[],\n    knownFiles: Set<string>,\n  )` | — | src/services/wiki/service.ts:330 |

## TopicDiscovery

源文件：`src/knowledge/topic-discovery.ts:59`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.topic-discovery.TopicDiscovery`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` | — | src/knowledge/topic-discovery.ts:60 |
| discover |  | `()` | — | src/knowledge/topic-discovery.ts:65 |
| fromClusters |  | `(arch: ArchitectureData)` | — | src/knowledge/topic-discovery.ts:75 |
| topicDefinition |  | `(\n    cluster: ArchitectureData['clusters'][number],\n    files: string[],\n    pkgs: string[],\n    usedIds: Set<string>,\n  )` | 主题命名（语义优先级）： - cluster.label 为语义文本时直接用作标题； - 模块复合命名：主题文件目录段（剔通用段）按频次取前几个合成 「A · B · C 跨模块协作」——单个主导符号（如 refreshMirror）不描述… | src/knowledge/topic-discovery.ts:106 |
| moduleTokensForFiles |  | `(files: string[])` | 从主题文件提取模块语义段：剔除通用目录段与 sourceDirs 后，按文件频次排名； 与已选段同链共现的祖先/后代段跳过（frontends 与其子目录 xterm 只取其一）。 | src/knowledge/topic-discovery.ts:134 |
| fromBoundaries |  | `(arch: ArchitectureData)` | — | src/knowledge/topic-discovery.ts:162 |
| filesForSymbols |  | `(names: string[])` | 符号名 → 扫描清单内的生产文件路径（去重，过滤测试路径） | src/knowledge/topic-discovery.ts:179 |
| packagesForFiles |  | `(files: string[], arch: ArchitectureData)` | — | src/knowledge/topic-discovery.ts:194 |

## VerificationHub

源文件：`src/services/wiki/verification.ts:20`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.wiki.verification.VerificationHub`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(\n    private client: CodebaseMemoryClient,\n    private scanResult: ScanResult,\n  )` | — | src/services/wiki/verification.ts:26 |
| getSymbolIndex |  | `(scope: 'all' | 'production' = 'all')` | 图谱符号索引（断言校验一级核验；按页面作用域缓存）。 names/qualified/files 一次查询同源构建：qualified 供点链声明后缀匹配 （消灭 qualified 假阴性），files 供同名歧义统计。 producti… | src/services/wiki/verification.ts:36 |
| fingerprintEntry |  | `(\n    raw: string,\n    head: string,\n    confirmedAt: string,\n    hashOf: (file: string) => string | null,\n  )` | claim 原文 → v2 指纹条目：末段名在符号索引（production 优先，all 兜底） 唯一命中时存文件 + 内容哈希（文件不变则跨提交长期有效）；歧义名 （0/多文件：依赖名、跨文件同名、纯词法命中）无稳定指纹，files 置… | src/services/wiki/verification.ts:76 |
| probeClaimEvidence |  | `(name: string, scopeFiles: ReadonlySet<string>)` | 断言核验三级通道（词法证据分类）：search_code compact 命中 (file, line) 后读取命中行原文——纯注释/配置行不算功能实据（mention），其余（代码/ import/调用/定义行）算实据（usage）。作用… | src/services/wiki/verification.ts:101 |
| readSourceLine |  | `(file: string, lineNo: number)` | 源码行缓存（断言核验的命中行分类用；读失败缓存 null → fail-open） | src/services/wiki/verification.ts:115 |
| readSourceFile |  | `(file: string)` | 整文件读取（文档锚点 heading 解析用；复用行缓存） | src/services/wiki/verification.ts:130 |
| outlineKnown |  | `(knownFiles: Set<string>, outlineRaw: unknown)` | 组装章节树校验参考集：模块来自架构包，符号来自 outline 引用文件 （图谱有界查询 + 源码正则回落——图谱漏采的 brief 符号免于 W3「查无实据」误剔） | src/services/wiki/verification.ts:140 |

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
| generateStatePage |  | `(ctx: StateContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:174 |
| generateRouting |  | `(ctx: RoutingContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:178 |
| generateWorkspaces |  | `(ctx: WorkspacesContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:182 |
| generatePackageBoundaries |  | `(ctx: PackageBoundariesContext, onChunk: (text: string) => void)` | — | src/knowledge/generator/index.ts:186 |

## 本页确定知道的事实

- 检出类 8 个，成员方法共 95 个
- 带 docstring 说明的方法 29 个

## 未知项

- 图谱无 INHERITS 边：继承树与多态实现未检出
- 66 个方法无 docstring，说明列为确定性摘要缺失（以签名与锚点为准）
## Related

- 同目录：[calls.md](calls.md) · [glossary.md](glossary.md)
- 共享 3 个源文件：[decisions.md](../04-design/decisions.md)
- 共享 1 个源文件、共享 1 个符号：[api.md](../03-interface/api.md)
- 共享 1 个源文件：[tech-stack.md](../01-overview/tech-stack.md)
- 总入口：[README](../README.md)
