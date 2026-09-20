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
| `collectImportedPackages` | method | `(files: ScannedFile[])` | /**\n   * 扫描源文件，提取所有 import 语句引用的包名。\n   * 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。\n   */ | src/core/scanner.ts:170 |
| `ensureIndexed` | method | `(mode: 'fast' | 'moderate' | 'full' = 'moderate')` | /** 确保图谱已索引（幂等） */ | src/mcp/codebase-memory-client.ts:131 |
| `exec` | method | `(tool: string, args: Record<string, unknown>)` | // --- 内部方法 --- | src/mcp/codebase-memory-client.ts:188 |
| `getArchitecture` | method | `()` | /** 架构概览 */ | src/mcp/codebase-memory-client.ts:140 |
| `getCodeSnippet` | method | `(qualifiedName: string)` | /** 代码片段+元数据 */ | src/mcp/codebase-memory-client.ts:166 |
| `parseJsonOutput` | method | `(raw: string)` | /**\n   * 解析子进程 stdout。\n   * MCP 的 info 日志（`level=info msg=...`）可能泄漏到 stdout，\n   * 因此从末尾向前找最后一个完整的 JSON 对象。\n   */ | src/mcp/codebase-memory-client.ts:211 |
| `queryGraph` | method | `(cypher: string, maxRows = 100)` | /** Cypher 查询 */ | src/mcp/codebase-memory-client.ts:175 |
| `tableToObjects` | function | `(table: unknown)` | /** 列式表 {cols, rows} → 对象数组（v0.10.x format=json 的结构） */ | src/mcp/codebase-memory-client.ts:27 |
| `toProjectName` | method | `(repoPath: string)` | /** 仓库绝对路径 → MCP 项目标识符（`/` 和 `:` → `-`） */ | src/mcp/codebase-memory-client.ts:227 |
| `tracePath` | method | `(\n    functionName: string,\n    direction: 'inbound' | 'outbound' | 'both' = 'both',\n    depth = 6,\n  )` | /** 双向调用链追踪 */ | src/mcp/codebase-memory-client.ts:150 |

## 协作边表（文件间调用）

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| adaptArchitecture | asObjects | src/mcp/codebase-memory-client.ts:35 |
| adaptArchitecture | lastSegment | src/mcp/codebase-memory-client.ts:42 |
| adaptTrace | adaptSide | src/mcp/codebase-memory-client.ts:93 |
| asObjects | tableToObjects | src/mcp/codebase-memory-client.ts:27 |
| constructor | findBinary | src/mcp/codebase-memory-client.ts:231 |
| constructor | toProjectName | src/mcp/codebase-memory-client.ts:227 |
| constructor | loadGitignore | src/core/scanner.ts:47 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:4 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:9 |
| detectTechStack | collectImportedPackages | src/core/scanner.ts:170 |
| ensureIndexed | exec | src/mcp/codebase-memory-client.ts:188 |
| exec | parseJsonOutput | src/mcp/codebase-memory-client.ts:211 |
| getArchitecture | exec | src/mcp/codebase-memory-client.ts:188 |
| getArchitecture | adaptArchitecture | src/mcp/codebase-memory-client.ts:45 |
| getCodeSnippet | exec | src/mcp/codebase-memory-client.ts:188 |
| queryGraph | exec | src/mcp/codebase-memory-client.ts:188 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| scan | walkDirectory | src/core/scanner.ts:84 |
| scan | detectTechStack | src/core/scanner.ts:139 |
| scan | detectProjectType | src/core/scanner.ts:198 |
| scan | detectSourceDirs | src/core/scanner.ts:222 |
| tracePath | exec | src/mcp/codebase-memory-client.ts:188 |
| tracePath | adaptTrace | src/mcp/codebase-memory-client.ts:92 |
| walkDirectory | shouldSkipDir | src/core/scanner.ts:129 |
| walkDirectory | isIgnored | src/core/scanner.ts:59 |

## 跨模块边界

| From | To | 调用次数 |
| --- | --- | --- |
| core | shared | 2 |
| cli | services | 2 |
| services | core | 1 |
| cli | core | 1 |
| cli | mcp | 1 |
## Related

- 同目录：[topic-6.md](topic-6.md)
- 总入口：[README](../README.md)
