# 模块详解

> 按依赖自上而下排列；「核心符号」列的方法/类均可在对应文件中定位。

## cli/ — 命令注册层

- **职责**：定义三个 Commander 命令，解析选项后调用 services 层；不含业务逻辑。
- **文件与符号**：

| 文件 | 核心符号 | 职责 |
| --- | --- | --- |
| `src/bin.ts` | — | 可执行入口，`createProgram().parse(process.argv)` |
| `src/cli/index.ts` | `createProgram` | 注册三个子命令，program version 0.1.0 |
| `src/cli/commands/init.ts` | `registerInitCommand` | 创建 `.scx-wiki-agent/cache/` 与 `.wiki/`（幂等） |
| `src/cli/commands/scan.ts` | `registerScanCommand` | 调 `ScanService.scan()` 并打印结果 |
| `src/cli/commands/build.ts` | `registerBuildCommand` | 装配 scanner + MCP client + WikiService，流式打印生成内容 |
| `src/cli/utils.ts` | `findProjectRoot` | 向上查找含 package.json 的目录（当前无调用方，见 limitations） |
| `src/cli/commands/types.ts` | `CommandOptions` | 选项类型 |

## services/ — 编排层

| 文件 | 核心符号 | 职责 |
| --- | --- | --- |
| `src/services/scan-service.ts` | `ScanService` | 对 `FileScanner` 的薄封装（构造注入 rootDir） |
| `src/services/wiki-service.ts` | `WikiService` | 生成管线编排：`ensureIndexed` → `resolvePages`（Tier2 按项目类型激活）→ 逐页生成（LLM→回退→清理）→ 写盘 |

`WikiService` 是理解生成流程的最佳入口：`buildWiki()` 约 40 行串起全部组件；`generatePage()` 实现 LLM 失败自动降级 fallback。

## knowledge/ — Wiki 生成核心（6 个模块）

| 文件 | 核心符号 | 职责 |
| --- | --- | --- |
| `src/knowledge/page-registry.ts` | `PAGE_REGISTRY`、`tier2PagesFor`、`ALL_PAGE_NAMES` | 18 个页面描述符（name/tier/answer）+ 按项目类型激活表层页 |
| `src/knowledge/config-detector.ts` | `ConfigDetector`（`detectEnvironment` / `detectConventions` / `detectTesting` / `detectConstraints`） | 检测式配置探测：package.json、lockfile、linter、测试框架、源码 env 变量与限制常量 |
| `src/knowledge/wiki-context-builder.ts` | `WikiContextBuilder`（`buildByName` + 20 个 build*Context） | 图谱查询 → 每页上下文对象；含 Cypher 查询、BFS 调用链、commander 选项解析、退出码扫描 |
| `src/knowledge/wiki-page-generator.ts` | `WikiPageGenerator`（`generateByName` + 10 个 generate*）、`ANTI_HALLUCINATION` | LLM 路径：中文 system prompt + JSON 数据 → `streamText` 流式输出；含思考模型 reasoning 回退 |
| `src/knowledge/wiki-fallback-builder.ts` | `WikiFallbackBuilder`（`buildByName` + 20 个 build*） | 纯规则路径：全部 18 页 + business/design-decisions 共 20 个 case 的 Markdown 模板 |
| `src/knowledge/wiki-output-sanitizer.ts` | `sanitizeWikiOutput`、`stripPreamble`、`stripCodeFences` | LLM 输出确定性清理（寒暄前导语 / markdown 围栏），R2 违规告警 |
| `src/knowledge/wiki-builder.ts` | `WikiBuilder` | 流式构造 Markdown 的 fluent 工具（addTitle/addSection/addTable...） |
| `src/knowledge/types.ts` | 20+ Context 接口、`WikiBuildOptions` | 每页上下文类型 + 生成选项 |

## mcp/ — 知识图谱客户端

| 文件 | 核心符号 | 职责 |
| --- | --- | --- |
| `src/mcp/codebase-memory-client.ts` | `CodebaseMemoryClient`（`ensureIndexed` / `getArchitecture` / `tracePath` / `getCodeSnippet` / `searchGraph` / `queryGraph` / `detectChanges`） | `execFileSync` 调用 `codebase-memory-mcp cli <tool> <json>`，解析 stdout JSON（从末尾向前找最后完整 JSON，容忍 info 日志泄漏） |
| `src/mcp/types.ts` | `ArchitectureData`、`SnippetData`、`QueryResult` 等 | MCP 7 个工具的返回类型（基于实测注释） |

## core/ — 扫描与领域类型

| 文件 | 核心符号 | 职责 |
| --- | --- | --- |
| `src/core/scanner.ts` | `FileScanner`、`ScanResult`、`ProjectType` | 目录遍历（gitignore + IGNORED_DIRS 过滤）、技术栈检测（只保留被实际 import 的依赖）、项目类型打分（backend/frontend/cli/agent/desktop/monorepo） |
| `src/core/types.ts` | `SymbolType`、`RelationType`、`Language` 等 | 领域类型（注意：Document/Chunk/Symbol 等接口是旧索引管线的遗留类型，当前无生产代码使用，见 limitations） |

## shared/ — 常量与工具

| 文件 | 核心符号 | 职责 |
| --- | --- | --- |
| `src/shared/constants.ts` | `WIKI_DIR`、`AGENT_DIR`、`IGNORED_DIRS`、`SUPPORTED_EXTENSIONS` | 目录与扩展名常量（`.wiki` 与 `.scx-wiki-agent` 自排除） |
| `src/shared/utils.ts` | `getFileLanguage`、`relativePath`、`computeHash`、`generateId` | 工具函数（`computeHash`/`generateId` 当前无调用方，遗留） |

## Related

- Code: `src/services/wiki-service.ts` · `src/knowledge/wiki-context-builder.ts` · `src/core/scanner.ts`
- Docs: [architecture](architecture.md) · [page-registry](../04-design/page-registry.md) · [calls](../07-reference/calls.md)
