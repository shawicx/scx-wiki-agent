# Data Flow

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
- src/services/wiki-service.ts
- src/shared/config.ts
</details>

数据处理阶段表（调用关系详见 calls.md，此处描述数据形态转换）：

## registerBuildCommand

入口符号：registerBuildCommand

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:108 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:32 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:39 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:32 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:61 |
| parseGlobalConfig | expandEnvRefs | src/shared/config.ts:46 |

## registerInitCommand

入口符号：registerInitCommand

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerInitCommand | globalConfigPath | src/shared/config.ts:32 |

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
| createProgram | getCliVersion | src/cli/index.ts:9 |
| createProgram | registerInitCommand | src/cli/commands/init.ts:8 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:4 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:10 |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:108 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:32 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:39 |
| registerInitCommand | globalConfigPath | src/shared/config.ts:32 |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:32 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:61 |

## extractClaims

入口符号：extractClaims

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:70 |

## verifyAndAnnotateClaims

入口符号：verifyAndAnnotateClaims

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| verifyAndAnnotateClaims | extractClaims | src/knowledge/claim-verifier.ts:47 |
| verifyAndAnnotateClaims | fileStems | src/knowledge/claim-verifier.ts:137 |
| verifyAndAnnotateClaims | locallyVerified | src/knowledge/claim-verifier.ts:87 |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:70 |
## Related

- 同目录：[architecture.md](architecture.md) · [modules.md](modules.md)
- 总入口：[README](../README.md)
