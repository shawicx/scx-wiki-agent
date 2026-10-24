# 类

<details>
<summary>Relevant source files</summary>

- src/core/scanner.ts
- src/knowledge/config-detector/detector.ts
- src/knowledge/context/index.ts
- src/knowledge/fallback/index.ts
- src/knowledge/generator/index.ts
- src/knowledge/intent/provider.ts
- src/knowledge/outline-planner.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-builder.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki/service.ts
- src/services/wiki/verification.ts
</details>

> ⚠️ **待确认**：MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现（证据不足，禁止猜测；请人工补充后移除本标记）

## CodebaseMemoryClient

源文件：`src/mcp/codebase-memory-client.ts:170`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.mcp.codebase-memory-client.CodebaseMemoryClient`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(repoPath: string, binaryPath?: string)` | — | src/mcp/codebase-memory-client.ts:178 |
| ensureIndexed |  | `(mode: 'fast' | 'moderate' | 'full' = 'moderate'): : IndexResult` | 确保图谱已索引（幂等） | src/mcp/codebase-memory-client.ts:185 |
| getArchitecture |  | `(): : ArchitectureData` | 架构概览（实例级 memoize：一次 build 只跑一次子进程） | src/mcp/codebase-memory-client.ts:194 |
| tracePath |  | `( functionName: string, direction: 'inbound' | 'outbound' | 'both' = 'both', depth = 6, ): : TraceResult` | 双向调用链追踪。**experimental**：生产管线未用（CALLS 走 queryGraph），仅测试/调试。 | src/mcp/codebase-memory-client.ts:206 |
| getCodeSnippet |  | `(qualifiedName: string): : SnippetData` | 代码片段+元数据 | src/mcp/codebase-memory-client.ts:222 |
| queryGraph |  | `(cypher: string, maxRows = 100): : QueryResult` | Cypher 查询 | src/mcp/codebase-memory-client.ts:231 |
| searchCode |  | `(pattern: string, limit = 20): : { totalGrepMatches: number; files: string[] }` | 词法搜索存在性探测（grep + 图谱增强的 files 模式）。 默认字面量匹配（regex=false）；totalGrepMatches > 0 即字面量在仓库中存在 （含 import/注释/配置中的出现），适合断言核验的兜底通道。 | src/mcp/codebase-memory-client.ts:247 |
| searchCodeMatches |  | `(pattern: string, limit = 20): : Array<{ file: string; line: number }>` | 词法搜索的 (file, line) 命中清单（compact 模式；断言核验的证据分类通道）： 图谱符号内命中 + 符号外原始命中合并；无命中空数组，老版 binary 抛错（fail-open）。 | src/mcp/codebase-memory-client.ts:265 |
| exec |  | `(tool: string, args: Record<string, unknown>): : unknown` | // --- 内部方法 --- | src/mcp/codebase-memory-client.ts:304 |
| parseJsonOutput |  | `(raw: string): : unknown` | 解析子进程 stdout。 MCP 的 info 日志（logfmt 或 JSON 行）可能泄漏到 stdout，因此从末尾向前 找最后一个**完整的**顶层 JSON 对象/数组：按括号配对扫描（字符串感知， 支持多行 pretty-pr… | src/mcp/codebase-memory-client.ts:330 |
| toProjectName |  | `(repoPath: string): : string` | 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`）。 必须与 MCP 侧 repo_path 派生规则**逐字对齐**（掺哈希/改名 → project not found，实测）。已知局限（MCP 侧解决）：`:`/`… | src/mcp/codebase-memory-client.ts:352 |
| findBinary |  | `(): : string` | — | src/mcp/codebase-memory-client.ts:356 |

## ConfigDetector

源文件：`src/knowledge/config-detector/detector.ts:46`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.config-detector.detector.ConfigDetector`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(private rootDir: string)` | — | src/knowledge/config-detector/detector.ts:49 |
| setSourceFiles |  | `(files: string[]): : void` | 兼容入口：预设全量源文件，内部仍按生产/测试口径拆分 | src/knowledge/config-detector/detector.ts:52 |
| setSourceClassification |  | `(input: { production: string[]; test: string[] }): : void` | 生产构建路径使用的显式分类入口（与 FileScanner 的 scope 同口径） | src/knowledge/config-detector/detector.ts:57 |
| ensureSourceClassification |  | `(): : { production: string[]; test: string[] }` | 懒加载源文件分类：未预设则自动扫描常见生产/测试目录 | src/knowledge/config-detector/detector.ts:62 |
| getSourceFiles |  | `(scope: 'production' | 'test' | 'all' = 'all'): : string[]` | — | src/knowledge/config-detector/detector.ts:68 |
| detectEnvironment |  | `(): : EnvironmentInfo` | — | src/knowledge/config-detector/detector.ts:75 |
| detectConventions |  | `(): : ConventionsInfo` | — | src/knowledge/config-detector/detector.ts:85 |
| readPackageJsonLoose |  | `(): : { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string>; } | null` | 读取 package.json（容错），供依赖/脚本反推 | src/knowledge/config-detector/detector.ts:121 |
| detectTesting |  | `(): : TestingInfo` | — | src/knowledge/config-detector/detector.ts:136 |
| detectConstraints |  | `(): : ConstraintsInfo` | — | src/knowledge/config-detector/detector.ts:224 |
| extractEnvVars |  | `(files: string[]): : EnvVarEvidence[]` | 从指定源码提取 process.env.XXX 引用（跳过注释行） | src/knowledge/config-detector/detector.ts:229 |
| extractConstants |  | `(files: string[]): : ConstantEvidence[]` | — | src/knowledge/config-detector/detector.ts:261 |
| detectTestOnlyDeps |  | `( productionFiles: string[], testFiles: string[], ): : Array<{ name: string; version: string; importFiles: string[] }>` | — | src/knowledge/config-detector/detector.ts:298 |
| collectImportMap |  | `(files: string[]): : Map<string, string[]>` | — | src/knowledge/config-detector/detector.ts:326 |

## FileScanner

源文件：`src/core/scanner.ts:92`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.core.scanner.FileScanner`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string, extraIgnoredDirs?: string[])` | — | src/core/scanner.ts:96 |
| loadGitignore |  | `(): : void` | — | src/core/scanner.ts:106 |
| isIgnored |  | `(relPath: string): : boolean` | — | src/core/scanner.ts:118 |
| scan |  | `(): : ScanResult` | — | src/core/scanner.ts:126 |
| walkDirectory |  | `(dir: string): : ScannedFile[]` | — | src/core/scanner.ts:159 |
| shouldSkipDir |  | `(dirName: string): : boolean` | — | src/core/scanner.ts:206 |
| detectTechStack |  | `(productionFiles: ScannedFile[], testFiles: ScannedFile[]): : { techStack: string[]; testTechStack: string[] }` | — | src/core/scanner.ts:216 |
| collectImportedPackages |  | `(files: ScannedFile[]): : Set<string>` | 扫描源文件，提取所有 import 语句引用的包名。 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。 覆盖 ES import / require / 动态 import，以及 CSS `@import \"pkg\"… | src/core/scanner.ts:251 |
| detectProjectType |  | `(techStack: string[]): : ProjectType` | — | src/core/scanner.ts:277 |
| looksLikeLibrary |  | `(): : boolean` | package.json 发布形态判定：exports 字段（显式）或 main+types 无 bin（隐式） | src/core/scanner.ts:311 |
| workspaceHasPackages |  | `(relPath: string): : boolean` | pnpm-workspace.yaml 是否声明了 packages（无该字段的审批型配置不算 workspace） | src/core/scanner.ts:324 |
| detectSourceDirs |  | `(files: ScannedFile[]): : string[]` | — | src/core/scanner.ts:333 |

## IntentEvidenceProvider

源文件：`src/knowledge/intent/provider.ts:34`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.intent.provider.IntentEvidenceProvider`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(private scanResult: ScanResult, opts?: IntentProviderOptions)` | — | src/knowledge/intent/provider.ts:57 |
| fileComments |  | `(files: string[]): : IntentEvidence[]` | 指定文件集的注释证据（file-header / symbol-comment / why-marker / const-comment） | src/knowledge/intent/provider.ts:67 |
| constComments |  | `(files: string[]): : IntentEvidence[]` | 限制常量注释（constraints 页：常量「防什么」的直接证据） | src/knowledge/intent/provider.ts:76 |
| whyMarkers |  | `(limit: number): : IntentEvidence[]` | 仓库级 why-marker 采样（troubleshooting 页：真实风险信号） | src/knowledge/intent/provider.ts:81 |
| commentsForFile |  | `(rel: string): : IntentEvidence[]` | — | src/knowledge/intent/provider.ts:91 |
| gitForFile |  | `(rel: string): : FileGitInfo | null` | 单文件 git 聚合（缓存）。窗口截断时先 --reverse 精查真首提交，失败则 first=null + firstTruncated（绝不把窗口最旧冒称「首次提交」）。 | src/knowledge/intent/provider.ts:110 |
| rootCommit |  | `(): : GitCommitRef | null` | 真·仓库首提交（rev-list --max-parents=0；shallow 返回 null 走降级口径） | src/knowledge/intent/provider.ts:134 |
| repoGitSubjects |  | `(): : GitCommitRef[]` | 仓库级近期提交（依赖引入决策的证据池） | src/knowledge/intent/provider.ts:145 |
| depCommitEvidence |  | `(deps: string[]): : IntentEvidence[]` | 依赖相关提交主题（tech-stack 选型理由 / decisions 依赖引入决策） | src/knowledge/intent/provider.ts:158 |
| churnEvidence |  | `(limit: number): : IntentEvidence[]` | 高频变更信号（troubleshooting 维护风险 / decisions 热点） | src/knowledge/intent/provider.ts:173 |
| fileChurnCounts |  | `(): : Map<string, number>` | 全仓 churn 计数（--name-only 批量一次，构建内缓存；fail-open 空 Map）。 供意图候选排序：比逐文件 log 便宜，且能排序全部文件而非截断后的 30 个。 | src/knowledge/intent/provider.ts:183 |
| noteCandidateStats |  | `(stats: IntentCandidateStats): : void` | 候选统计登记/读取（context 层排序后写入；构建报告观测「小核心文件被排除」类回归） | src/knowledge/intent/provider.ts:193 |
| candidateStats |  | `(): : IntentCandidateStats | null` | — | src/knowledge/intent/provider.ts:197 |
| prepareModules |  | `(pkgNames: string[], candidateFiles: string[]): : void` | 预聚合模块级证据（一次性）：注释 + git 主题 + 测试行为。 candidateFiles 由调用方按重要性多信号评分排序（fan-in/入口/boundary/测试配对/ docs 提及/churn，见 intent/ranking… | src/knowledge/intent/provider.ts:206 |
| moduleIntent |  | `(module: string): : IntentEvidence[] | undefined` | — | src/knowledge/intent/provider.ts:241 |
| gitTimeline |  | `(): : ModuleGitInfo[]` | — | src/knowledge/intent/provider.ts:246 |
| hotFileChurn |  | `(limit: number): : FileChurnInfo[]` | — | src/knowledge/intent/provider.ts:250 |
| intentForFiles |  | `(files: string[]): : IntentEvidence[]` | 主题文件集证据：注释 + 各文件首末提交（页预算封顶；测试行为留在 testing 证据域） | src/knowledge/intent/provider.ts:257 |
| overviewIntent |  | `(entryFiles: string[]): : IntentEvidence[]` | // --- overview：仓库级证据 --- | src/knowledge/intent/provider.ts:269 |
| docEvidence |  | `(): : IntentEvidence[]` | // --- 文档小节 --- | src/knowledge/intent/provider.ts:293 |
| testSpecs |  | `(): : IntentEvidence[]` | // --- 测试意图 --- | src/knowledge/intent/provider.ts:313 |
| readSource |  | `(rel: string): : string | null` | // --- 内部 --- | src/knowledge/intent/provider.ts:328 |
| loadGitCache |  | `(): : void` | // --- git 磁盘缓存（HEAD 一致时整批复用；HEAD 变化重挖） --- | src/knowledge/intent/provider.ts:341 |
| saveGitCache |  | `(): : void` | — | src/knowledge/intent/provider.ts:356 |

## OutlinePlanner

源文件：`src/knowledge/outline-planner.ts:42`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.outline-planner.OutlinePlanner`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `( private client: CodebaseMemoryClient, private scanResult: ScanResult, )` | — | src/knowledge/outline-planner.ts:43 |
| plan |  | `( generator: WikiPageGenerator, topics: TopicDefinition[], feedback?: string, ): : Promise<OutlineFileData | null>` | 提议章节树。feedback 非空时为带剔除原因的反馈重试。 LLM 输出不可解析返回 null（不抛异常）。 | src/knowledge/outline-planner.ts:52 |
| buildInputs |  | `(topics: TopicDefinition[], feedback?: string): : Record<string, unknown>` | 确定性组装规划输入（全部真实数据，无臆造字段） | src/knowledge/outline-planner.ts:70 |
| readPackageDescription |  | `(): : string` | — | src/knowledge/outline-planner.ts:131 |
| readReadmeExcerpt |  | `(): : string` | — | src/knowledge/outline-planner.ts:141 |

## ScanService

源文件：`src/services/scan-service.ts:3`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.scan-service.ScanService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `(rootDir: string, extraIgnoredDirs?: string[])` | — | src/services/scan-service.ts:7 |
| scan |  | `(): : ScanResult` | — | src/services/scan-service.ts:12 |

## TopicDiscovery

源文件：`src/knowledge/topic-discovery.ts:86`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.topic-discovery.TopicDiscovery`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `( private client: CodebaseMemoryClient, private scanResult: ScanResult, )` | — | src/knowledge/topic-discovery.ts:87 |
| discover |  | `(): : TopicDefinition[]` | — | src/knowledge/topic-discovery.ts:92 |
| hasSubstantiveMember |  | `(files: string[]): : boolean` | 至少一个成员文件含实质实现（非纯 re-export 壳；读失败按非壳处理，宁漏勿误） | src/knowledge/topic-discovery.ts:103 |
| fromClusters |  | `(arch: ArchitectureData): : TopicDefinition[]` | — | src/knowledge/topic-discovery.ts:117 |
| topicDefinition |  | `( cluster: ArchitectureData['clusters'][number], files: string[], pkgs: string[], usedIds: Set<string>, usedTitles: Set<string>, ): : TopicDefinition | null` | 主题命名（语义优先级，标题撞名时逐级退避）： - cluster.label 为语义文本时直接用作标题（目录回声除外——双端仓库的簇 label 常是 \"android\"/\"macos\" 这类平台目录名，与成员路径段同名即判回声）；… | src/knowledge/topic-discovery.ts:153 |
| symbolPairTitle |  | `(topNodes: string[]): : { title: string; idBase: string } | null` | 簇内前两个 PascalCase 类型符号 → 协作面命名（id 用 slug；不足两个返回 null） | src/knowledge/topic-discovery.ts:194 |
| moduleTokensForFiles |  | `(files: string[]): : string[]` | 从主题文件提取模块语义段：剔除通用目录段与 sourceDirs 后，按文件频次排名； 与已选段同链共现的祖先/后代段跳过（frontends 与其子目录 xterm 只取其一）。 | src/knowledge/topic-discovery.ts:205 |
| fromBoundaries |  | `(arch: ArchitectureData): : TopicDefinition | null` | — | src/knowledge/topic-discovery.ts:233 |
| filesForSymbols |  | `(names: string[]): : string[]` | 符号名 → 扫描清单内的生产文件路径（去重，过滤测试路径） | src/knowledge/topic-discovery.ts:251 |
| packagesForFiles |  | `(files: string[], arch: ArchitectureData): : Set<string>` | — | src/knowledge/topic-discovery.ts:266 |

## VerificationHub

源文件：`src/services/wiki/verification.ts:20`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.wiki.verification.VerificationHub`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `( private client: CodebaseMemoryClient, private scanResult: ScanResult, )` | — | src/services/wiki/verification.ts:28 |
| getSymbolIndex |  | `(scope: 'all' | 'production' = 'all'): : SymbolIndex` | 图谱符号索引（断言校验一级核验；按页面作用域缓存）。 names/qualified/files 一次查询同源构建：qualified 供点链声明后缀匹配 （消灭 qualified 假阴性），files 供同名歧义统计。 producti… | src/services/wiki/verification.ts:38 |
| fingerprintEntry |  | `( raw: string, head: string, confirmedAt: string, hashOf: (file: string) => string | null, ): : ConfirmedEntry` | claim 原文 → v2 指纹条目：末段名在符号索引（production 优先，all 兜底） 唯一命中时存文件 + 内容哈希（文件不变则跨提交长期有效）；歧义名 （0/多文件：依赖名、跨文件同名、纯词法命中）无稳定指纹，files 置… | src/services/wiki/verification.ts:78 |
| probeClaimEvidence |  | `(name: string, scopeFiles: ReadonlySet<string>): : ProbeEvidenceKind | null` | 断言核验三级通道（词法证据分类）：search_code compact 命中 (file, line) 后读取命中行原文——纯注释/配置行不算功能实据（mention），其余（代码/ import/调用/定义行）算实据（usage）。作用… | src/services/wiki/verification.ts:103 |
| searchMatchesCached |  | `(name: string): : Array<{ file: string; line: number }>` | search_code 命中缓存：同名 claim 在多页出现时只起一个子进程（build 内图谱不变，命中集恒定） | src/services/wiki/verification.ts:117 |
| readSourceLine |  | `(file: string, lineNo: number): : string | null` | 源码行缓存（断言核验的命中行分类用；读失败缓存 null → fail-open） | src/services/wiki/verification.ts:127 |
| readSourceFile |  | `(file: string): : string | null` | 整文件读取（文档锚点 heading 解析用；复用行缓存） | src/services/wiki/verification.ts:142 |
| outlineKnown |  | `(knownFiles: Set<string>, outlineRaw: unknown): : OutlineKnown` | 组装章节树校验参考集：模块来自架构包，符号来自 outline 引用文件 （图谱有界查询 + 源码正则回落——图谱漏采的 brief 符号免于 W3「查无实据」误剔） | src/services/wiki/verification.ts:152 |

## WikiBuilder

源文件：`src/knowledge/wiki-builder.ts:7`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.wiki-builder.WikiBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| addTitle |  | `(title: string): : this` | Add a top-level title: `# title` | src/knowledge/wiki-builder.ts:11 |
| addSection |  | `(title: string, content: string): : this` | Add a second-level section: `## title` +（content 非空时）`\ \ content` | src/knowledge/wiki-builder.ts:17 |
| addSubSection |  | `(title: string, content: string): : this` | Add a third-level sub-section: `### title` +（content 非空时）`\ \ content` | src/knowledge/wiki-builder.ts:23 |
| addParagraph |  | `(text: string): : this` | Add a plain paragraph. | src/knowledge/wiki-builder.ts:29 |
| addCodeBlock |  | `(language: string, code: string): : this` | Add a fenced code block with an optional language hint. | src/knowledge/wiki-builder.ts:35 |
| addTable |  | `(headers: string[], rows: string[][]): : this` | Add a markdown table from headers and rows. | src/knowledge/wiki-builder.ts:41 |
| addBulletList |  | `(items: string[]): : this` | Add a bullet list. | src/knowledge/wiki-builder.ts:50 |
| addNewline |  | `(): : this` | Add an empty line. | src/knowledge/wiki-builder.ts:56 |
| build |  | `(): : string` | Join all sections with newlines and return the final document. | src/knowledge/wiki-builder.ts:62 |

## WikiContextBuilder

源文件：`src/knowledge/context/index.ts:110`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.context.WikiContextBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `( client: CodebaseMemoryClient, scanResult: ScanResult, detector: ConfigDetector, )` | — | src/knowledge/context/index.ts:113 |
| setIntentProvider |  | `(provider: IntentEvidenceProvider): : void` | — | src/knowledge/context/index.ts:121 |
| setTopics |  | `(topics: TopicDefinition[]): : void` | — | src/knowledge/context/index.ts:125 |
| setOutlineChapters |  | `(chapters: OutlineChapter[]): : void` | — | src/knowledge/context/index.ts:129 |
| buildByName |  | `(page: string, plannedPages?: string[]): : unknown` | 按页面名派发上下文构建（供 PageRegistry 调用）。plannedPages 用于 readme 索引只列本次产出的页面 | src/knowledge/context/index.ts:134 |
| dispatchContext |  | `(page: string, plannedPages?: string[]): : unknown` | — | src/knowledge/context/index.ts:140 |
| enrichIfThinEvidence |  | `(page: string, ctx: unknown): : unknown` | 证据补强（DeepWiki「二次扩展检索」的图谱版）： LLM 路径的 structure 页证据文件低于下限时，从图谱补一批高复杂度真实符号， 只保留扫描清单内的文件路径。图谱查无的热点/入口名回落源码正则探测 （mcp 对 .vue/部… | src/knowledge/context/index.ts:153 |
| getDepNames |  | `(): : Set<string>` | — | src/knowledge/context/index.ts:157 |
| getFallbackSymbolNames |  | `(): : Set<string>` | — | src/knowledge/context/index.ts:161 |
| buildOverviewContext |  | `(): : OverviewContext` | — | src/knowledge/context/index.ts:165 |
| buildArchitectureContext |  | `(): : ArchitectureContext` | — | src/knowledge/context/index.ts:169 |
| buildDataFlowContext |  | `(): : DataFlowContext` | — | src/knowledge/context/index.ts:173 |
| buildModulesContext |  | `(): : ModulesContext` | — | src/knowledge/context/index.ts:177 |
| buildApiContext |  | `(): : ApiContext` | — | src/knowledge/context/index.ts:181 |
| buildOnboardingContext |  | `(): : OnboardingContext` | — | src/knowledge/context/index.ts:185 |
| buildTroubleshootingContext |  | `(): : TroubleshootingContext` | — | src/knowledge/context/index.ts:189 |
| buildGlossaryContext |  | `(): : GlossaryContext` | — | src/knowledge/context/index.ts:193 |
| buildCallsContext |  | `(): : CallsContext` | — | src/knowledge/context/index.ts:197 |
| buildClassesContext |  | `(): : ClassesContext` | — | src/knowledge/context/index.ts:201 |
| buildReadmeContext |  | `(plannedPages?: string[]): : ReadmeContext` | — | src/knowledge/context/index.ts:205 |
| buildEnvironmentContext |  | `(): : EnvironmentContext` | — | src/knowledge/context/index.ts:209 |
| buildTestingContext |  | `(): : TestingContext` | — | src/knowledge/context/index.ts:213 |
| buildConventionsContext |  | `(): : ConventionsContext` | — | src/knowledge/context/index.ts:217 |
| buildConstraintsContext |  | `(): : ConstraintsContext` | — | src/knowledge/context/index.ts:221 |
| buildDecisionsContext |  | `(): : DecisionsContext | null` | — | src/knowledge/context/index.ts:225 |
| buildCliContext |  | `(): : CliContext` | — | src/knowledge/context/index.ts:229 |
| buildTechStackContext |  | `(): : TechStackContext` | — | src/knowledge/context/index.ts:233 |
| buildTopicContext |  | `(topicId: string): : TopicContext | null` | — | src/knowledge/context/index.ts:237 |
| buildChapterPageContext |  | `(page: string): : ChapterPageContext | null` | — | src/knowledge/context/index.ts:241 |

## WikiFallbackBuilder

源文件：`src/knowledge/fallback/index.ts:88`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.fallback.WikiFallbackBuilder`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| buildByName |  | `(page: string, ctx: any): : string` | 按页面名派发规则生成（供 PageRegistry 调用）；未注册页返回空串（上游 null-context 已拦截） | src/knowledge/fallback/index.ts:90 |
| buildOverview |  | `(ctx: OverviewContext): : string` | — | src/knowledge/fallback/index.ts:96 |
| buildArchitecture |  | `(ctx: ArchitectureContext): : string` | — | src/knowledge/fallback/index.ts:100 |
| buildDataFlow |  | `(ctx: DataFlowContext): : string` | — | src/knowledge/fallback/index.ts:104 |
| buildModules |  | `(ctx: ModulesContext): : string` | — | src/knowledge/fallback/index.ts:108 |
| buildApi |  | `(ctx: ApiContext): : string` | — | src/knowledge/fallback/index.ts:112 |
| buildGlossary |  | `(ctx: GlossaryContext): : string` | — | src/knowledge/fallback/index.ts:116 |
| buildOnboarding |  | `(ctx: OnboardingContext): : string` | — | src/knowledge/fallback/index.ts:120 |
| buildTroubleshooting |  | `(ctx: TroubleshootingContext): : string` | — | src/knowledge/fallback/index.ts:124 |
| buildCalls |  | `(ctx: CallsContext): : string` | — | src/knowledge/fallback/index.ts:128 |
| buildClasses |  | `(ctx: ClassesContext): : string` | — | src/knowledge/fallback/index.ts:132 |
| buildReadme |  | `(ctx: ReadmeContext): : string` | — | src/knowledge/fallback/index.ts:136 |
| buildEnvironment |  | `(ctx: EnvironmentContext): : string` | — | src/knowledge/fallback/index.ts:140 |
| buildTesting |  | `(ctx: TestingContext): : string` | — | src/knowledge/fallback/index.ts:144 |
| buildConventions |  | `(ctx: ConventionsContext): : string` | — | src/knowledge/fallback/index.ts:148 |
| buildConstraints |  | `(ctx: ConstraintsContext): : string` | — | src/knowledge/fallback/index.ts:152 |
| buildDecisions |  | `(ctx: DecisionsContext): : string` | — | src/knowledge/fallback/index.ts:156 |
| buildCli |  | `(ctx: CliContext): : string` | — | src/knowledge/fallback/index.ts:160 |
| buildTechStack |  | `(ctx: TechStackContext): : string` | — | src/knowledge/fallback/index.ts:164 |
| buildPublicApi |  | `(ctx: PublicApiContext): : string` | — | src/knowledge/fallback/index.ts:168 |
| buildRoutes |  | `(ctx: RoutesContext): : string` | — | src/knowledge/fallback/index.ts:172 |
| buildComponents |  | `(ctx: ComponentsContext): : string` | — | src/knowledge/fallback/index.ts:176 |
| buildState |  | `(ctx: StateContext): : string` | — | src/knowledge/fallback/index.ts:180 |
| buildRouting |  | `(ctx: RoutingContext): : string` | — | src/knowledge/fallback/index.ts:184 |
| buildWorkspaces |  | `(ctx: WorkspacesContext): : string` | — | src/knowledge/fallback/index.ts:188 |
| buildPackageBoundaries |  | `(ctx: PackageBoundariesContext): : string` | — | src/knowledge/fallback/index.ts:192 |
| buildDbSchema |  | `(ctx: DbSchemaContext): : string` | — | src/knowledge/fallback/index.ts:196 |
| buildTopic |  | `(ctx: TopicContext): : string` | — | src/knowledge/fallback/index.ts:200 |
| buildChapterPage |  | `(ctx: ChapterPageContext): : string` | — | src/knowledge/fallback/index.ts:204 |

## WikiPageGenerator

源文件：`src/knowledge/generator/index.ts:92`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.knowledge.generator.WikiPageGenerator`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `( modelName?: string, baseURL?: string, apiKey?: string, onNotice?: (notice: PageGenNotice) => void, settings?: GeneratorSettings, )` | — | src/knowledge/generator/index.ts:95 |
| hasModel |  | `(): : boolean` | — | src/knowledge/generator/index.ts:119 |
| plan |  | `(systemPrompt: string, userPrompt: string): : Promise<string>` | 规划类调用的原始文本（章节树 planner 复用模型与续写能力；不做 sanitize） | src/knowledge/generator/index.ts:124 |
| generateByName |  | `(page: string, ctx: any, onChunk: (text: string) => void): : Promise<string>` | 按页面名派发 LLM 生成（供 PageRegistry 调用）；未注册页返回空串走上层降级 | src/knowledge/generator/index.ts:131 |
| generateOverview |  | `(ctx: OverviewContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:138 |
| generateArchitecture |  | `(ctx: ArchitectureContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:142 |
| generateDataFlow |  | `(ctx: DataFlowContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:146 |
| generateModules |  | `(ctx: ModulesContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:150 |
| generateApi |  | `(ctx: ApiContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:154 |
| generateOnboarding |  | `(ctx: OnboardingContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:158 |
| generateTroubleshooting |  | `(ctx: TroubleshootingContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:162 |
| generateGlossary |  | `(ctx: GlossaryContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:166 |
| generatePublicApi |  | `(ctx: PublicApiContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:170 |
| generateRoutes |  | `(ctx: RoutesContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:174 |
| generateComponents |  | `(ctx: ComponentsContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:178 |
| generateStatePage |  | `(ctx: StateContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:182 |
| generateRouting |  | `(ctx: RoutingContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:186 |
| generateWorkspaces |  | `(ctx: WorkspacesContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:190 |
| generatePackageBoundaries |  | `(ctx: PackageBoundariesContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:194 |
| generateDbSchema |  | `(ctx: DbSchemaContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:198 |
| generateTopic |  | `(ctx: TopicContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:202 |
| generateChapterPage |  | `(ctx: ChapterPageContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:206 |
| generateTesting |  | `(ctx: TestingContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:210 |
| generateConstraints |  | `(ctx: ConstraintsContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:214 |
| generateDecisions |  | `(ctx: DecisionsContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:218 |
| generateEnvironment |  | `(ctx: EnvironmentContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:222 |
| generateTechStack |  | `(ctx: TechStackContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:226 |
| generateConventions |  | `(ctx: ConventionsContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:230 |
| generateCliPage |  | `(ctx: CliContext, onChunk: (text: string) => void): : Promise<string>` | — | src/knowledge/generator/index.ts:234 |

## WikiService

源文件：`src/services/wiki/service.ts:49`  限定名：`Users-scx-Documents-code-scx-wiki-agent.src.services.wiki.service.WikiService`

| 方法 | 可见性 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| constructor |  | `( private client: CodebaseMemoryClient, private scanResult: ScanResult, )` | — | src/services/wiki/service.ts:52 |
| buildWiki |  | `(wikiDir: string, options?: WikiBuildOptions): : Promise<string[]>` | — | src/services/wiki/service.ts:59 |
| safeGraphLanguages |  | `(): : Array<{ language: string; file_count: number }> | undefined` | 图谱语言覆盖（fail-open：查询失败返回 undefined 不占报告行） | src/services/wiki/service.ts:322 |
| planOutline |  | `( generator: WikiPageGenerator, topics: TopicDefinition[], knownFiles: Set<string>, ): : Promise<OutlineFileData | null>` | — | src/services/wiki/service.ts:330 |

## 本页确定知道的事实

- 检出类 13 个，成员方法共 187 个
- 带 docstring 说明的方法 64 个

## 未知项

- 图谱无 INHERITS 边：继承树与多态实现未检出
- 123 个方法无 docstring，说明列为确定性摘要缺失（以签名与锚点为准）
## Related

- 同目录：[calls.md](calls.md) · [glossary.md](glossary.md)
- 共享 5 个源文件：[decisions.md](../04-design/decisions.md)
- 共享 3 个源文件：[overview.md](../01-overview/overview.md)
- 共享 3 个源文件：[onboarding.md](../05-guides/onboarding.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
