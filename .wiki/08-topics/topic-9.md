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
| `adaptArchitecture` | function | `(raw: Record<string, any>)` | get_architecture 列式表 → ArchitectureData 对象数组 | src/mcp/codebase-memory-client.ts:45 |
| `adaptTrace` | function | `(raw: Record<string, any>)` | trace_path 分组列式表 → 扁平 TraceNode[] | src/mcp/codebase-memory-client.ts:92 |
| `asObjects` | function | `(raw: Record<string, unknown>, key: string)` | 兼容两种形态：旧版对象数组 / 新版列式表 | src/mcp/codebase-memory-client.ts:35 |
| `collectImportedPackages` | method | `(files: ScannedFile[])` | 扫描源文件，提取所有 import 语句引用的包名。 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。 覆盖 ES import / require / 动态 import，以及 CSS `@import \"pkg\"… | src/core/scanner.ts:251 |

## 协作边表（文件间调用）

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| adaptArchitecture | asObjects | src/mcp/codebase-memory-client.ts:35 |
| adaptArchitecture | lastSegment | src/mcp/codebase-memory-client.ts:42 |
| adaptTrace | adaptSide | src/mcp/codebase-memory-client.ts:93 |
| asObjects | tableToObjects | src/mcp/codebase-memory-client.ts:27 |
| constructor | findBinary | src/mcp/codebase-memory-client.ts:356 |
| constructor | toProjectName | src/mcp/codebase-memory-client.ts:352 |
| constructor | loadGitignore | src/core/scanner.ts:106 |
| createProgram | getCliVersion | src/cli/index.ts:9 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:5 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:11 |

## 跨模块边界

| 调用方 | 被调用方 | 调用次数 |
| --- | --- | --- |
| core | shared | 4 |
| cli | shared | 4 |
| knowledge | mcp | 3 |
| knowledge | cli | 3 |
| knowledge | core | 2 |

## 设计动机（意图证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 列式表 {cols, rows} → 对象数组（v0.10.x format=json 的结构） | 符号注释 | tableToObjects | src/mcp/codebase-memory-client.ts:27 |
| 兼容两种形态：旧版对象数组 / 新版列式表 | 符号注释 | asObjects | src/mcp/codebase-memory-client.ts:35 |
| qualified_name 末段 → 简名（列式表里 entry_points/hotspots 只提供 qn） | 符号注释 | lastSegment | src/mcp/codebase-memory-client.ts:42 |
| 原生 import → 技术栈规范名（无 package.json 的 Python/Go/JVM/Swift 仓库：import 即证据） | 符号注释 | NATIVE_IMPORT_MAP | src/core/scanner.ts:49 |
| Python/Go/Swift 源文件 import 提取 → 规范技术栈名（去重排序；上限控成本） | 符号注释 | detectNativeImports | src/core/scanner.ts:60 |
| src/mcp/codebase-memory-client.ts 首次提交：refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki | 提交记录 | src/mcp/codebase-memory-client.ts | commit:9ef4fd6f (2026-06-24) |
| src/core/scanner.ts 首次提交：feat: 功能基本可用 | 提交记录 | src/core/scanner.ts | commit:76565d14 (2026-06-02) |

## 本页确定知道的事实

- 覆盖文件 5 个、关键符号 4 个（跨 2 个文件）
- 协作调用边 10 条、跨模块边界 5 条
- 设计动机证据 7 条（均带锚点）
## Related

- 同目录：[topic-6.md](topic-6.md)
- 共享 4 个源文件、共享 5 个符号：[modules.md](../02-architecture/modules.md)
- 共享 4 个源文件、共享 2 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 5 个源文件：[calls.md](../07-reference/calls.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
