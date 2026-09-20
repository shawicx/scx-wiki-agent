# Data Flow

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/page-registry.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki-service.ts
</details>

数据处理阶段表（调用关系详见 calls.md，此处描述数据形态转换）：

## registerBuildCommand

入口符号：registerBuildCommand

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:30 |

## registerScanCommand

入口符号：registerScanCommand

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |

## createProgram

入口符号：createProgram

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| createProgram | registerInitCommand | src/cli/commands/init.ts:6 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:4 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:9 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:30 |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |

## findPageDescriptor

入口符号：findPageDescriptor

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| findPageDescriptor | isTopicPage | src/knowledge/page-registry.ts:125 |
## Related

- 同目录：[architecture.md](architecture.md) · [modules.md](modules.md)
- 总入口：[README](../README.md)
