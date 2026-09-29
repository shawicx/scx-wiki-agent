# Data Flow

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
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
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:111 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:34 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:65 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:34 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:63 |
| parseGlobalConfig | expandEnvRefs | src/shared/config.ts:48 |

## registerInitCommand

入口符号：registerInitCommand

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerInitCommand | globalConfigPath | src/shared/config.ts:34 |

## registerScanCommand

入口符号：registerScanCommand

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |

## runConfirmationSession

入口符号：runConfirmationSession

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| runConfirmationSession | resolveLabel | src/cli/confirm-interaction.ts:92 |
| runConfirmationSession | textPromptMessage | src/cli/confirm-interaction.ts:101 |

## createProgram

入口符号：createProgram

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| createProgram | getCliVersion | src/cli/index.ts:9 |
| createProgram | registerInitCommand | src/cli/commands/init.ts:8 |
| createProgram | registerScanCommand | src/cli/commands/scan.ts:4 |
| createProgram | registerBuildCommand | src/cli/commands/build.ts:11 |
| registerBuildCommand | loadGlobalConfig | src/shared/config.ts:111 |
| registerBuildCommand | globalConfigPath | src/shared/config.ts:34 |
| registerBuildCommand | FileScanner | src/core/scanner.ts:37 |
| registerBuildCommand | CodebaseMemoryClient | src/mcp/codebase-memory-client.ts:119 |
| registerBuildCommand | WikiService | src/services/wiki-service.ts:65 |
| registerInitCommand | globalConfigPath | src/shared/config.ts:34 |
| registerScanCommand | ScanService | src/services/scan-service.ts:3 |
| loadGlobalConfig | globalConfigPath | src/shared/config.ts:34 |
| loadGlobalConfig | parseGlobalConfig | src/shared/config.ts:63 |

## extractClaims

入口符号：extractClaims

调用边表：

| 调用方 | 被调用方 | 源文件:行号 |
| --- | --- | --- |
| extractClaims | normalizeClaim | src/knowledge/claim-verifier.ts:76 |
## Related

- 同目录：[architecture.md](architecture.md) · [modules.md](modules.md)
- 总入口：[README](../README.md)
