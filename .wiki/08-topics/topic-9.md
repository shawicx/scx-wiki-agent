# registerBuildCommand 协作面

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/mcp/codebase-memory-client.ts
</details>

仓库专属主题（知识图谱聚类推导，横跨多个模块的协作面）。

## 覆盖文件

- `src/mcp/codebase-memory-client.ts`
- `src/core/scanner.ts`
- `src/cli/index.ts`
- `src/cli/commands/build.ts`
- `src/cli/commands/scan.ts`

## 关键符号

| 符号 | 类型 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- | --- |
| `adaptArchitecture` | function | `(raw: Record<string, any>)` | /** get_architecture 列式表 → ArchitectureData 对象数组 */ | src/mcp/codebase-memory-client.ts:45 |
| `adaptTrace` | function | `(raw: Record<string, any>)` | /** trace_path 分组列式表 → 扁平 TraceNode[] */ | src/mcp/codebase-memory-client.ts:92 |
| `asObjects` | function | `(raw: Record<string, unknown>, key: string)` | /** 兼容两种形态：旧版对象数组 / 新版列式表 */ | src/mcp/codebase-memory-client.ts:35 |
| `collectImportedPackages` | method | `(files: ScannedFile[])` | /**\n   * 扫描源文件，提取所有 import 语句引用的包名。\n   * 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。\n   * 覆盖 ES import / require / 动态 import，以及 CSS `@import \"pkg\"`\n   * （tailwind 插件类依赖的常见引入方式，如 tw-animate-css）。\n   */ | src/core/scanner.ts:172 |
| `ensureIndexed` | method | `(mode: 'fast' | 'moderate' | 'full' = 'moderate')` | /** 确保图谱已索引（幂等） */ | src/mcp/codebase-memory-client.ts:131 |
| `exec` | method | `(tool: string, args: Record<string, unknown>)` | // --- 内部方法 --- | src/mcp/codebase-memory-client.ts:207 |
| `getArchitecture` | method | `()` | /** 架构概览 */ | src/mcp/codebase-memory-client.ts:140 |
| `getCodeSnippet` | method | `(qualifiedName: string)` | /** 代码片段+元数据 */ | src/mcp/codebase-memory-client.ts:166 |
| `parseJsonOutput` | method | `(raw: string)` | /**\n   * 解析子进程 stdout。\n   * MCP 的 info 日志（`level=info msg=...`）可能泄漏到 stdout，\n   * 因此从末尾向前找最后一个完整的 JSON 对象。\n   */ | src/mcp/codebase-memory-client.ts:230 |
| `queryGraph` | method | `(cypher: string, maxRows = 100)` | /** Cypher 查询 */ | src/mcp/codebase-memory-client.ts:175 |
| `searchCode` | method | `(pattern: string)` | /**\n   * 词法搜索存在性探测（grep + 图谱增强的 files 模式）。\n   * 默认字面量匹配（regex=false）；totalGrepMatches > 0 即字面量在仓库中存在\n   * （含 import/注释/配置中的出现），适合断言核验的兜底通道。\n   */ | src/mcp/codebase-memory-client.ts:191 |
| `tableToObjects` | function | `(table: unknown)` | /** 列式表 {cols, rows} → 对象数组（v0.10.x format=json 的结构） */ | src/mcp/codebase-memory-client.ts:27 |
| `toProjectName` | method | `(repoPath: string)` | /** 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`） */ | src/mcp/codebase-memory-client.ts:246 |
| `tracePath` | method | `(\n    functionName: string,\n    direction: 'inbound' | 'outbound' | 'both' = 'both',\n    depth = 6,\n  )` | /** 双向调用链追踪 */ | src/mcp/codebase-memory-client.ts:150 |

## 协作边表（文件间调用）

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| adaptArchitecture | asObjects | src/mcp/codebase-memory-client.ts:35 |
| adaptArchitecture | lastSegment | src/mcp/codebase-memory-client.ts:42 |
| adaptTrace | adaptSide | src/mcp/codebase-memory-client.ts:93 |
| asObjects | tableToObjects | src/mcp/codebase-memory-client.ts:27 |
| constructor | findBinary | src/mcp/codebase-memory-client.ts:250 |
| constructor | toProjectName | src/mcp/codebase-memory-client.ts:246 |
| constructor | loadGitignore | src/core/scanner.ts:47 |
| createProgram | getCliVersion | src/cli/index.ts:9 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:4 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:10 |
| detectProjectType | workspaceHasPackages | src/core/scanner.ts:225 |
| detectTechStack | collectImportedPackages | src/core/scanner.ts:172 |
| ensureIndexed | exec | src/mcp/codebase-memory-client.ts:207 |
| exec | parseJsonOutput | src/mcp/codebase-memory-client.ts:230 |
| getArchitecture | exec | src/mcp/codebase-memory-client.ts:207 |
| getArchitecture | adaptArchitecture | src/mcp/codebase-memory-client.ts:45 |
| getCodeSnippet | exec | src/mcp/codebase-memory-client.ts:207 |
| queryGraph | exec | src/mcp/codebase-memory-client.ts:207 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| scan | walkDirectory | src/core/scanner.ts:84 |
| scan | detectTechStack | src/core/scanner.ts:139 |
| scan | detectProjectType | src/core/scanner.ts:198 |
| scan | detectSourceDirs | src/core/scanner.ts:234 |
| searchCode | exec | src/mcp/codebase-memory-client.ts:207 |
| tracePath | exec | src/mcp/codebase-memory-client.ts:207 |
| tracePath | adaptTrace | src/mcp/codebase-memory-client.ts:92 |

## 跨模块边界

| From | To | 调用次数 |
| --- | --- | --- |
| cli | shared | 3 |
| core | shared | 3 |
| knowledge | cli | 3 |
| cli | services | 2 |
| services | core | 1 |

## 设计动机（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 列式表 {cols, rows} → 对象数组（v0.10.x format=json 的结构） | 符号注释 | tableToObjects | src/mcp/codebase-memory-client.ts:27 |
| 兼容两种形态：旧版对象数组 / 新版列式表 | 符号注释 | asObjects | src/mcp/codebase-memory-client.ts:35 |
| qualified_name 末段 → 简名（列式表里 entry_points/hotspots 只提供 qn） | 符号注释 | lastSegment | src/mcp/codebase-memory-client.ts:42 |
| src/mcp/codebase-memory-client.ts 首次提交：refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki | 提交记录 | src/mcp/codebase-memory-client.ts | commit:9ef4fd6f (2026-06-24) |
| src/core/scanner.ts 首次提交：feat: 功能基本可用 | 提交记录 | src/core/scanner.ts | commit:76565d14 (2026-06-02) |
| 行为承诺（tests/core/scanner.test.ts）：FileScanner；should scan all source files；should not include node_modules files；should detect correct language for each file；should detect tech stack from package.json；should detect project type；仅含 allowBuilds 的 pnpm-workspace.yaml 不判为 monorepo（审批配置 ≠ workspace）；扫描 .vue/.rs/.css 文件；import 提取覆盖 Vue SFC 与 CSS @import（不再误报死依赖）；动态 import()、副作用导入（后跟 from 行）、node_modules 相对引用均可提取包名 | 行为承诺 | src/core/scanner.ts | tests/core/scanner.test.ts:9 |
| 行为承诺（tests/mcp/codebase-memory-client.test.ts）：CodebaseMemoryClient；项目名转义：路径 → MCP 标识符；getArchitecture 解析 JSON 输出；跳过 stderr 日志行解析 JSON；二进制不存在时抛友好错误；queryGraph 透传 Cypher | 行为承诺 | src/mcp/codebase-memory-client.ts | tests/mcp/codebase-memory-client.test.ts:9 |
## Related

- 同目录：[topic-6.md](topic-6.md)
- 总入口：[README](../README.md)
