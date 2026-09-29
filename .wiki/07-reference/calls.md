# Calls

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/intent-evidence.ts
- src/knowledge/page-registry.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki-service.ts
- src/shared/config.ts
</details>

调用关系边表（按入口/热点分组）。每条边可被 trace_path / CALLS 查询复现。

## Fan-in（被调用次数）

| 符号 | 文件 | 扇入 |
| --- | --- | --- |
| isTestPath | src/shared/utils.ts | 29 |
| generate | src/knowledge/wiki-page-generator.ts | 14 |
| languageDomainOf | src/shared/utils.ts | 12 |
| intentTable | src/knowledge/wiki-fallback-builder.ts | 9 |
| matchPackageForFile | src/shared/utils.ts | 9 |
| isChapterPage | src/knowledge/page-registry.ts | 9 |
| hasIntent | src/knowledge/wiki-fallback-builder.ts | 8 |
| isTopicPage | src/knowledge/page-registry.ts | 8 |
| intentToPrompt | src/knowledge/wiki-page-generator.ts | 7 |
| dedupeByAnchor | src/knowledge/intent-evidence.ts | 6 |

## registerBuildCommand

入口文件：src/cli/commands/build.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:111 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:34 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:65 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:34 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:63 |
| parseGlobalConfig | expandEnvRefs | src/shared/config.ts:48 |

## registerInitCommand

入口文件：src/cli/commands/init.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerInitCommand | globalConfigPath | src/shared/config.ts:34 |

## registerScanCommand

入口文件：src/cli/commands/scan.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |

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
| createProgram | registerScanCommand | src/cli/commands/scan.ts:4 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:11 |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:111 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:34 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:65 |
| registerInitCommand | globalConfigPath | src/shared/config.ts:34 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:34 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:63 |

## extractClaims

入口文件：src/knowledge/claim-verifier.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:76 |

## verifyAndAnnotateClaims

入口文件：src/knowledge/claim-verifier.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| verifyAndAnnotateClaims | extractClaims | src/knowledge/claim-verifier.ts:53 |
| verifyAndAnnotateClaims | fileStems | src/knowledge/claim-verifier.ts:150 |
| verifyAndAnnotateClaims | locallyVerified | src/knowledge/claim-verifier.ts:93 |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:76 |

## collectContextKeys

入口文件：src/knowledge/claim-verifier.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| collectContextKeys | collectInto | src/knowledge/claim-verifier.ts:173 |
## Related

- 同目录：[classes.md](classes.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
