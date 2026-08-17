# 调用关系边表

> 遵守 R2（边表优于时序图）：按命令入口分组列出真实调用边；行号锚点来自当前源码（git HEAD 含已暂存改动）。

## 入口 0：进程启动

| 调用方 | 被调用方 | 锚点 |
| --- | --- | --- |
| （node 执行） | `createProgram` | `src/bin.ts:3` |
| `createProgram` | `registerInitCommand` / `registerScanCommand` / `registerBuildCommand` | `src/cli/index.ts:19-21` |

## 入口 1：`scan` 命令

| 调用方 | 被调用方 | 锚点 |
| --- | --- | --- |
| `registerScanCommand`（action） | `new ScanService(root)` → `service.scan()` | `src/cli/commands/scan.ts:12-13` |
| `ScanService.scan` | `new FileScanner(rootDir)` → `scanner.scan()` | `src/services/scan-service.ts:11-12` |
| `FileScanner.scan` | `walkDirectory` / `detectTechStack` / `detectProjectType` / `detectSourceDirs` | `src/core/scanner.ts`（scan 方法内顺序调用） |
| `FileScanner.detectTechStack` | `collectImportedPackages`（死依赖过滤） | `src/core/scanner.ts` |

## 入口 2：`build` 命令（核心链）

### 装配段

| 调用方 | 被调用方 | 锚点 |
| --- | --- | --- |
| `registerBuildCommand`（action） | `new FileScanner(root)` → `scanner.scan()` | `src/cli/commands/build.ts:40-41` |
| 同上 | `new CodebaseMemoryClient(root, options.mcpBinary)` | `src/cli/commands/build.ts:43` |
| 同上 | `new WikiService(client, scanResult)` | `src/cli/commands/build.ts:44` |
| 同上 | `service.buildWiki(wikiDir, buildOptions)` | `src/cli/commands/build.ts:45` |
| 错误路径 | `process.exit(1)` | `src/cli/commands/build.ts:53` |

### WikiService 管线段

| 调用方 | 被调用方 | 锚点 |
| --- | --- | --- |
| `WikiService.buildWiki` | `client.ensureIndexed('moderate')` | `src/services/wiki-service.ts:23` |
| 同上 | `this.resolvePages(...)` | `src/services/wiki-service.ts:26` |
| 同上 | `new ConfigDetector(rootDir)` + `setSourceFiles(...)` | `src/services/wiki-service.ts:30-31` |
| 同上 | `new WikiContextBuilder` / `new WikiFallbackBuilder` / `new WikiPageGenerator` | `src/services/wiki-service.ts:33-35` |
| 同上 | `this.generatePage(...)`（循环逐页）→ `writeFileSync` | `src/services/wiki-service.ts:43-47` |
| `WikiService.generatePage` | `ctx.buildByName(page)`（context 构建） | `src/services/wiki-service.ts:90` |
| 同上 | `generator.generateByName(page, ctx, ...)`（LLM 路径） | `src/services/wiki-service.ts:97` |
| 同上 | `sanitizeWikiOutput(content, page)` | `src/services/wiki-service.ts:100` |
| 同上（降级） | `fallback.buildByName(page, ctx)`（两处：noLlm/无模型、LLM 失败或空输出） | `src/services/wiki-service.ts:94,105` |
| `WikiService.resolvePages` | `tier2PagesFor(projectType)` | `src/knowledge/page-registry.ts:tier2PagesFor` |

### MCP 客户端段（所有图谱查询的必经之路）

| 调用方 | 被调用方 | 锚点 |
| --- | --- | --- |
| `CodebaseMemoryClient` 各公开方法 | `this.exec(tool, args)` | `src/mcp/codebase-memory-client.ts:36-93` |
| `exec` | `execFileSync(binaryPath, ['cli', tool, json], { timeout: 120000, maxBuffer: 100MB })` | `src/mcp/codebase-memory-client.ts:97` |
| `exec` | `parseJsonOutput(raw)`（从末尾向前找完整 JSON） | `src/mcp/codebase-memory-client.ts:102,118` |
| `exec`（错误路径） | ENOENT → 抛「codebase-memory-mcp 未安装」错误 | `src/mcp/codebase-memory-client.ts:104-108` |
| 构造函数 | `findBinary()`（env `CODEBASE_MEMORY_MCP_BINARY` → PATH）/ `toProjectName()`（路径→项目标识） | `src/mcp/codebase-memory-client.ts:31-32,134-139` |

### 上下文构建段（WikiContextBuilder 的图谱查询）

| 调用方 | 被调用方 | 锚点 |
| --- | --- | --- |
| `buildOverviewContext` / `buildArchitectureContext` / `buildDataFlowContext` 等 | `client.getArchitecture()` | `src/knowledge/wiki-context-builder.ts:78,102,157,251,297,463,491,505` |
| `buildArchitectureContext` / `buildModulesContext` / `buildCallsContext` 等 | `client.queryGraph(Cypher)` | `src/knowledge/wiki-context-builder.ts:105,254,311,341,384,400,422,519,523,574...` |
| `buildDataFlowContext` | `buildCallChainFromEdges`（BFS 还原 CALLS 边，MAX_DEPTH=3 / MAX_NODES=25） | `src/knowledge/wiki-context-builder.ts:161,174` |
| `buildApiContext` / `buildBusinessContext` | `safeGetSnippet(qn)` → `getCodeSnippet`（容错 null） | `src/knowledge/wiki-context-builder.ts:301,321,368` |
| `buildCliContext` | `parseCommanderOptions`（正则提取 .option()）+ `extractExitCodes`（扫 process.exit） | `src/knowledge/wiki-context-builder.ts` |
| `buildTechStackContext` | `collectImportFiles`（依赖→import 位置映射） | `src/knowledge/wiki-context-builder.ts` |
| `buildDecisionsContext` | `generateAdrEntries`（图谱模式→ADR，`fromMcp: false`） | `src/knowledge/wiki-context-builder.ts` |

### LLM 生成段

| 调用方 | 被调用方 | 锚点 |
| --- | --- | --- |
| `WikiPageGenerator` 构造 | `createOpenAI(options)`（baseURL/apiKey；仅 baseURL 时 apiKey 默认 `'ollama'`） | `src/knowledge/wiki-page-generator.ts:27-36` |
| `generateByName` → 各 generate* | `this.generate(onChunk, config)` | `src/knowledge/wiki-page-generator.ts:416` |
| `generate` | `streamText({ model, system: ANTI_HALLUCINATION + prompt, maxOutputTokens, providerOptions })` | `src/knowledge/wiki-page-generator.ts:416-426` |
| 同上 | `result.fullStream` 迭代：`text-delta` 累积并回调 `onChunk`；`reasoning-delta` 单独累积 | `src/knowledge/wiki-page-generator.ts:433-437` |
| 同上（降级） | text 为空且 reasoning 非空 → 返回 reasoning（思考模型兼容） | `src/knowledge/wiki-page-generator.ts` |

## 全局高扇入符号（改这些要评估影响面）

| 符号 | 被谁依赖 | 说明 |
| --- | --- | --- |
| `FileScanner.scan` | scan/build 两条命令链 | 所有数据的人口 |
| `CodebaseMemoryClient.exec` | 客户端全部 7 个公开方法 | 子进程调用唯一出口 |
| `WikiService.generatePage` | buildWiki 逐页循环 | 双路径分叉点 |
| `buildByName`（三个 builder 各一） | WikiService | 页面派发契约 |
| `WikiBuilder.addSection` 等 | fallback builder 全部页面模板 | Markdown 组装基础 |

## Related

- Code: `src/services/wiki-service.ts` · `src/mcp/codebase-memory-client.ts`
- Docs: [data-flow](../02-architecture/data-flow.md) · [architecture](../02-architecture/architecture.md) · [page-registry](../04-design/page-registry.md)
