# API 参考

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/confirmation/types.ts
- src/knowledge/context/shared.ts
- src/knowledge/fallback/shared.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-evidence.ts
- src/mcp/codebase-memory-client.ts
</details>

## CLI 命令

| 命令 | 文件 | 行号 |
| --- | --- | --- |
| registerBuildCommand | src/cli/commands/build.ts | 11 |
| registerInitCommand | src/cli/commands/init.ts | 8 |
| registerScanCommand | src/cli/commands/scan.ts | 4 |

## 导出函数

| 函数 | 签名 | 文件 |
| --- | --- | --- |
| adaptArchitecture | (raw: Record<string, any>) | src/mcp/codebase-memory-client.ts |
| adaptSide | (side: unknown) | src/mcp/codebase-memory-client.ts |
| adaptTrace | (raw: Record<string, any>) | src/mcp/codebase-memory-client.ts |
| add | (file: string, tier: number) | src/knowledge/wiki-evidence.ts |
| addBulletList | (items: string[]) | src/knowledge/wiki-builder.ts |
| addCodeBlock | (language: string, code: string) | src/knowledge/wiki-builder.ts |
| addNewline | () | src/knowledge/wiki-builder.ts |
| addParagraph | (text: string) | src/knowledge/wiki-builder.ts |
| addPending | (\n  byKey: Map<string, PendingConfirmation>,\n  kind: PendingKind,\n  text: string,\n  contextLine: string,\n  page: string,\n) | src/knowledge/confirmation/types.ts |
| addSection | (title: string, content: string) | src/knowledge/wiki-builder.ts |
| addSubSection | (title: string, content: string) | src/knowledge/wiki-builder.ts |
| addTable | (headers: string[], rows: string[][]) | src/knowledge/wiki-builder.ts |
| addTitle | (title: string) | src/knowledge/wiki-builder.ts |
| anchorText | (file: string, line: number) | src/knowledge/fallback/shared.ts |
| appendSourceFallback | (deps: ContextDeps, existing: Array<{ name: string }>) | src/knowledge/context/shared.ts |
| runConfirmationSession |  | src/cli/confirm-interaction.ts |
| createProgram |  | src/cli/index.ts |
| extractClaims |  | src/knowledge/claim-verifier.ts |
| verifyAndAnnotateClaims |  | src/knowledge/claim-verifier.ts |
| isCommentLine |  | src/knowledge/claim-verifier.ts |

## 本页确定知道的事实

- CLI 命令 3 个（去重后）
- 导出函数 20 个（展示前 20 个）
## Related

- 同目录：[cli.md](cli.md)
- 共享 8 个源文件：[calls.md](../07-reference/calls.md)
- 共享 6 个源文件：[architecture.md](../02-architecture/architecture.md)
- 共享 6 个源文件：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)
