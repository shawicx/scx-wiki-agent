# Calls

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/page-registry.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-page-generator.ts
- src/knowledge/wiki-quality-validator.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki-service.ts
- src/shared/utils.ts
</details>

调用关系边表（按入口函数分组）。每条边可被 trace_path / CALLS 查询复现。

## Fan-in（被调用次数）

| 符号 | 文件 | 扇入 |
| --- | --- | --- |
| isTestPath | src/shared/utils.ts | 14 |
| generate | src/knowledge/wiki-page-generator.ts | 12 |
| isTopicPage | src/knowledge/page-registry.ts | 8 |
| labelToSymbolType | src/knowledge/wiki-context-builder.ts | 6 |
| exec | src/mcp/codebase-memory-client.ts | 5 |
| pageRelPath | src/knowledge/page-registry.ts | 4 |
| findPageDescriptor | .wiki/07-reference/calls.md | 4 |
| validatePageContent | src/knowledge/wiki-quality-validator.ts | 3 |
| topicIdFromPage | src/knowledge/page-registry.ts | 3 |
| collectEvidenceFiles | src/knowledge/wiki-evidence.ts | 3 |

## registerBuildCommand

入口文件：src/cli/commands/build.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:30 |

## registerScanCommand

入口文件：src/cli/commands/scan.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |

## createProgram

入口文件：src/cli/index.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| createProgram | registerInitCommand | src/cli/commands/init.ts:6 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:4 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:9 |

## findPageDescriptor

入口文件：src/knowledge/page-registry.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| findPageDescriptor | isTopicPage | src/knowledge/page-registry.ts:125 |
## Related

- 同目录：[classes.md](classes.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
