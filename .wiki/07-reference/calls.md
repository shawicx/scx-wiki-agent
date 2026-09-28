# Calls

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/intent-evidence.ts
- src/knowledge/page-registry.ts
- src/knowledge/wiki-context-builder.ts
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
| labelToSymbolType | src/knowledge/wiki-context-builder.ts | 6 |

## registerBuildCommand

入口文件：src/cli/commands/build.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:108 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:32 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:40 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:32 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:61 |
| parseGlobalConfig | expandEnvRefs | src/shared/config.ts:46 |

## registerInitCommand

入口文件：src/cli/commands/init.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerInitCommand | globalConfigPath | src/shared/config.ts:32 |

## registerScanCommand

入口文件：src/cli/commands/scan.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |

## createProgram

入口文件：src/cli/index.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| createProgram | getCliVersion | src/cli/index.ts:9 |
| createProgram | registerInitCommand | src/cli/commands/init.ts:8 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:4 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:10 |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:108 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:32 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:40 |
| registerInitCommand | globalConfigPath | src/shared/config.ts:32 |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:32 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:61 |

## extractClaims

入口文件：src/knowledge/claim-verifier.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:73 |

## verifyAndAnnotateClaims

入口文件：src/knowledge/claim-verifier.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| verifyAndAnnotateClaims | extractClaims | src/knowledge/claim-verifier.ts:50 |
| verifyAndAnnotateClaims | fileStems | src/knowledge/claim-verifier.ts:140 |
| verifyAndAnnotateClaims | locallyVerified | src/knowledge/claim-verifier.ts:90 |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:73 |

## collectContextKeys

入口文件：src/knowledge/claim-verifier.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| collectContextKeys | collectInto | src/knowledge/claim-verifier.ts:163 |

## countIntentEvidence

入口文件：src/knowledge/intent-evidence.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| countIntentEvidence | visit | src/knowledge/intent-evidence.ts:778 |
## Related

- 同目录：[classes.md](classes.md) · [glossary.md](glossary.md)
- 总入口：[README](../README.md)
