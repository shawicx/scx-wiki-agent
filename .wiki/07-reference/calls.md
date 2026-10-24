# 调用关系

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/channels/rust-methods.ts
- src/knowledge/channels/sanitizer.ts
- src/knowledge/channels/stats.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki/service.ts
- src/shared/config.ts
- src/shared/utils.ts
</details>

调用关系边表（按入口/热点分组）。每条边可被 trace_path / CALLS 查询复现。

## 扇入（被调用次数）

| 符号 | 文件 | 扇入 |
| --- | --- | --- |
| isTestPath |  | 29 |
| renderFactsAndUnknowns |  | 28 |
| generate |  | 22 |
| dispatchContext |  | 19 |
| languageDomainOf |  | 14 |
| intentTable |  | 10 |
| matchPackageForFile |  | 9 |
| hasIntent |  | 9 |
| isProductionGraphFile |  | 9 |
| isChapterPage |  | 9 |

## registerBuildCommand

入口文件：src/cli/commands/build.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:129 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:36 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:92 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:170 |
| registerBuildCommand | WikiService | src/services/wiki/service.ts:49 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:36 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:65 |
| parseGlobalConfig | expandEnvRefs | src/shared/config.ts:50 |

## registerInitCommand

入口文件：src/cli/commands/init.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerInitCommand | globalConfigPath | src/shared/config.ts:36 |

## registerScanCommand

入口文件：src/cli/commands/scan.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |
| registerScanCommand | loadGlobalConfig | src/shared/config.ts:129 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:36 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:65 |
| parseGlobalConfig | expandEnvRefs | src/shared/config.ts:50 |

## runConfirmationSession

入口文件：src/cli/confirm-interaction.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| runConfirmationSession | resolveLabel | src/cli/confirm-interaction.ts:92 |
| runConfirmationSession | textPromptMessage | src/cli/confirm-interaction.ts:101 |

## createProgram

入口文件：src/cli/index.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| createProgram | getCliVersion | src/cli/index.ts:9 |
| createProgram | registerInitCommand | src/cli/commands/init.ts:8 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:5 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:11 |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:129 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:36 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:92 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:170 |
| registerBuildCommand | WikiService | src/services/wiki/service.ts:49 |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |
| registerScanCommand | loadGlobalConfig | src/shared/config.ts:129 |
| registerInitCommand | globalConfigPath | src/shared/config.ts:36 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:36 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:65 |

## scanRustMethodCalls

入口文件：src/knowledge/channels/rust-methods.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| scanRustMethodCalls | hasRustSources | src/knowledge/channels/rust-methods.ts:41 |
| scanRustMethodCalls | isTestPath | src/shared/utils.ts:39 |
| scanRustMethodCalls | readThrough | src/knowledge/channels/rust-methods.ts:113 |
| scanRustMethodCalls | useEvidence | src/knowledge/channels/rust-methods.ts:103 |
| scanRustMethodCalls | recordRustMethods | src/knowledge/channels/stats.ts:75 |

## sanitizeEdge

入口文件：src/knowledge/channels/sanitizer.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| sanitizeEdge | judgeEdge | src/knowledge/channels/sanitizer.ts:43 |
| sanitizeEdge | recordEdgeFilter | src/knowledge/channels/stats.ts:57 |
| judgeEdge | languageDomainOf | src/shared/utils.ts:54 |
| judgeEdge | edgeHasLexicalEvidence | src/knowledge/channels/sanitizer.ts:51 |

## 本页确定知道的事实

- 调用边分组 7 组（入口 7 / 热点锚定 0）
- 调用边共 39 条（每组内已去重）
- 扇入表条目 10 个
## Related

- 同目录：[classes.md](classes.md) · [glossary.md](glossary.md)
- 互补职责：[glossary.md](../07-reference/glossary.md)
- 共享 9 个源文件：[architecture.md](../02-architecture/architecture.md)
- 共享 9 个源文件：[modules.md](../02-architecture/modules.md)
- 共享 8 个源文件：[api.md](../03-interface/api.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
