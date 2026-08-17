# 符号与术语表

> 按功能分组（非字母序）；说明基于源码 docstring 与实现事实，无 docstring 处据实现描述。

## CLI 层

| 符号 | 类型 | 说明 | 位置 |
| --- | --- | --- | --- |
| `createProgram` | function | 构建 Commander program：name/description/version(0.1.0) + 注册三个子命令 | `src/cli/index.ts` |
| `registerInitCommand` | function | `init` 命令：幂等创建 `.scx-wiki-agent/cache/` 与 `.wiki/` | `src/cli/commands/init.ts` |
| `registerScanCommand` | function | `scan` 命令：调 ScanService 并打印扫描摘要 | `src/cli/commands/scan.ts` |
| `registerBuildCommand` | function | `build` 命令：装配 scanner/client/service，失败 `process.exit(1)` | `src/cli/commands/build.ts` |
| `findProjectRoot` | function | 向上查找含 package.json 的目录（当前无调用方） | `src/cli/utils.ts` |

## 服务层

| 符号 | 类型 | 说明 | 位置 |
| --- | --- | --- | --- |
| `ScanService` | class | FileScanner 薄封装 | `src/services/scan-service.ts` |
| `WikiService` | class | 生成管线编排：索引→页面集→装配 builders→逐页生成→写盘 | `src/services/wiki-service.ts` |
| `WikiService.buildWiki` | method | 主入口；返回生成的文件名列表 | 同上 |
| `WikiService.resolvePages` | method | 解析 `--pages`：默认=非 surface 页+Tier2；校验页名并告警 | 同上 |
| `WikiService.generatePage` | method | 单页双路径：LLM→清理；失败/无模型→fallback | 同上 |

## 知识层 — 注册与探测

| 符号 | 类型 | 说明 | 位置 |
| --- | --- | --- | --- |
| `PageDescriptor` | interface | 页面元数据（name/tier/answer），不持方法引用 | `src/knowledge/page-registry.ts` |
| `PageTier` | type | `'structure' \| 'operations' \| 'surface'` 三层模型 | 同上 |
| `PAGE_REGISTRY` | const | 18 个页面描述符，按生成顺序 | 同上 |
| `ALL_PAGE_NAMES` | const | 全部合法页名（--pages 校验用） | 同上 |
| `tier2PagesFor` | function | projectType → 应激活的表层页 | 同上 |
| `ConfigDetector` | class | 检测式配置探测（有则提取、无则标注缺失） | `src/knowledge/config-detector.ts` |
| `ConfigDetector.detectEnvironment` | method | 包名/版本/ESM/Node 版本/包管理器/scripts/env 变量 | 同上 |
| `ConfigDetector.detectConventions` | method | linter/editorconfig/AGENTS.md 探测 | 同上 |
| `ConfigDetector.detectTesting` | method | 测试框架/目录/夹具探测 | 同上 |
| `ConfigDetector.detectConstraints` | method | 源码限制常量（MAX/LIMIT/TIMEOUT...，跳过注释行） | 同上 |

## 知识层 — 生成管线

| 符号 | 类型 | 说明 | 位置 |
| --- | --- | --- | --- |
| `WikiContextBuilder` | class | 图谱→页面上下文；`buildByName` 按 20 个页名派发 | `src/knowledge/wiki-context-builder.ts` |
| `buildCallChainFromEdges` | method（私有） | BFS 查精确 CALLS 边还原调用链（修复 trace_path 线性化失真） | 同上 |
| `safeGetSnippet` | method（私有） | 容错获取代码片段，失败返回 null 不抛错 | 同上 |
| `parseCommanderOptions` | method（私有） | 从 register*Command 源码正则提取 `.option()` 定义 | 同上 |
| `WikiPageGenerator` | class | LLM 路径生成器；未传 modelName 时 model=null（恒走 fallback） | `src/knowledge/wiki-page-generator.ts` |
| `ANTI_HALLUCINATION` | 静态常量 | 四条铁律文本，前置到每个 system prompt | 同上 |
| `WikiFallbackBuilder` | class | 纯规则模板；20 个 build* case 覆盖全部注册页+遗留页 | `src/knowledge/wiki-fallback-builder.ts` |
| `sanitizeWikiOutput` | function | 清理 LLM 输出：寒暄前导语+整体围栏；data-flow 页 sequenceDiagram 告警 | `src/knowledge/wiki-output-sanitizer.ts` |
| `WikiBuilder` | class | 流式 Markdown fluent 构造器（addTitle/addSection/addTable...） | `src/knowledge/wiki-builder.ts` |

## MCP 客户端

| 符号 | 类型 | 说明 | 位置 |
| --- | --- | --- | --- |
| `CodebaseMemoryClient` | class | MCP 子进程客户端（无 SDK 依赖） | `src/mcp/codebase-memory-client.ts` |
| `ensureIndexed` | method | 幂等索引图谱（fast/moderate/full，默认 moderate） | 同上 |
| `getArchitecture` | method | 架构概览：packages/entry_points/hotspots/layers/clusters | 同上 |
| `tracePath` | method | 双向调用链（当前生产代码未使用，Cypher 替代） | 同上 |
| `queryGraph` | method | Cypher 查询（maxRows 默认 100） | 同上 |
| `getCodeSnippet` | method | 单符号源码+元数据 | 同上 |
| `parseJsonOutput` | method（私有） | stdout 从末尾向前找最后完整 JSON（容忍 info 日志） | 同上 |
| `toProjectName` | method（私有） | 仓库绝对路径→MCP 项目标识（`/`、`:` → `-`） | 同上 |

## 核心与共享

| 符号 | 类型 | 说明 | 位置 |
| --- | --- | --- | --- |
| `FileScanner` | class | 文件扫描 + 技术栈/项目类型/源目录检测 | `src/core/scanner.ts` |
| `ScanResult` | interface | rootDir/files/techStack/projectType/hasTypeScript/sourceDirs | 同上 |
| `ProjectType` | type | backend/frontend/cli/desktop/agent/monorepo/unknown | 同上 |
| `SymbolType` / `RelationType` | type | 符号与关系枚举（knowledge 层 Context 复用） | `src/core/types.ts` |
| `WIKI_DIR` / `AGENT_DIR` | const | `.wiki` / `.scx-wiki-agent`（自排除于扫描） | `src/shared/constants.ts` |
| `IGNORED_DIRS` / `SUPPORTED_EXTENSIONS` | const | 扫描过滤规则 | 同上 |
| `getFileLanguage` / `relativePath` | function | 扩展名→语言；跨平台相对路径 | `src/shared/utils.ts` |

## 术语

| 术语 | 含义 |
| --- | --- |
| **MCP** | 此仓库语境中特指 `codebase-memory-mcp` 外部知识图谱服务（非 Model Context Protocol） |
| **Tier / surface** | 页面三层模型：structure（事实层）/ operations（规约层）/ surface（按项目类型的表层入口） |
| **fallback** | 纯规则生成路径（WikiFallbackBuilder），LLM 不可用/失败/未覆盖页面时启用 |
| **R1–R4** | 反幻觉铁律：锚点强制 / 边表优于时序图 / 拒绝编造用途 / 结构化优先 |
| **hotspot** | 图谱中高扇入（fan_in）符号，视为项目核心 |
| **死依赖** | package.json 声明但源码 0 import 的依赖（detectTechStack 过滤） |
| **思考模型** | 默认把内容写进 reasoning 字段的 LLM（如 Qwen3/DeepSeek-v4），需关闭 thinking 或读 reasoning 回退 |

## Related

- Code: `src/knowledge/page-registry.ts` · `src/mcp/types.ts`
- Docs: [modules](../02-architecture/modules.md) · [calls](calls.md) · [page-registry](../04-design/page-registry.md)
