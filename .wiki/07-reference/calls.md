# 调用关系

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/generator/shared.ts
- src/knowledge/wiki-markers.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki/service.ts
- src/shared/config.ts
</details>

调用关系边表（按入口/热点分组）。每条边可被 trace_path / CALLS 查询复现。

## 扇入（被调用次数）

| 符号 | 文件 | 扇入 |
| --- | --- | --- |
| renderFactsAndUnknowns |  | 28 |
| isTestPath |  | 27 |
| generate | src/knowledge/generator/shared.ts | 22 |
| languageDomainOf |  | 14 |
| intentTable |  | 10 |
| matchPackageForFile |  | 9 |
| intentToPrompt |  | 9 |
| isProductionGraphFile |  | 9 |
| hasIntent |  | 9 |
| isChapterPage |  | 9 |

## registerBuildCommand

入口文件：src/cli/commands/build.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:111 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:34 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:83 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki/service.ts:62 |
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
| registerInitCommand | globalConfigPath | src/shared/config.ts:34 |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:111 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:34 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:83 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki/service.ts:62 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:34 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:63 |

## extractClaims

入口文件：src/knowledge/claim-verifier.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:95 |

## verifyAndAnnotateClaims

入口文件：src/knowledge/claim-verifier.ts

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| verifyAndAnnotateClaims | extractClaims | src/knowledge/claim-verifier.ts:72 |
| verifyAndAnnotateClaims | fileStems | src/knowledge/claim-verifier.ts:201 |
| verifyAndAnnotateClaims | locallyVerified | src/knowledge/claim-verifier.ts:126 |
| verifyAndAnnotateClaims | pendingMarker | src/knowledge/wiki-markers.ts:33 |
| pendingMarker | encodeIdentity | src/knowledge/wiki-markers.ts:27 |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:95 |
| locallyVerified | chainCandidates | src/knowledge/claim-verifier.ts:106 |
| locallyVerified | matchesQualified | src/knowledge/claim-verifier.ts:112 |

## 本页确定知道的事实

- 调用边分组 7 组（入口 7 / 热点锚定 0）
- 调用边共 34 条（每组内已去重）
- 扇入表条目 10 个
## Related

- 同目录：[classes.md](classes.md) · [glossary.md](glossary.md)
- 互补职责：[glossary.md](../07-reference/glossary.md)
- 共享 8 个源文件：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 7 个源文件：[architecture.md](../02-architecture/architecture.md)
- 共享 7 个源文件：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)
