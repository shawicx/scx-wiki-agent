# Calls

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki-service.ts
</details>

调用关系边表（按入口函数分组）。每条边可被 trace_path / CALLS 查询复现。

## Fan-in（被调用次数）



| 符号 | 文件 | 扇入 |
| --- | --- | --- |
| generate | WikiPageGenerator | 11 |
| exec | CodebaseMemoryClient | 5 |
| labelToSymbolType | WikiContextBuilder | 5 |
| validatePageContent | wiki-quality-validator | 3 |
| collectEvidenceFiles | wiki-evidence | 3 |
| pageRelPath | page-registry | 3 |
| findPageDescriptor | page-registry | 3 |
| relativePath | utils | 2 |
| getFileLanguage | utils | 2 |
| sanitizeWikiOutput | wiki-output-sanitizer | 2 |

## registerBuildCommand

入口文件：src/cli/commands/build.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:28 |

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
## Related

- 同目录：[classes.md](classes.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
