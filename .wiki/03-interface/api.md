# API 参考

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/knowledge/channels/rust-methods.ts
- src/knowledge/channels/sanitizer.ts
- src/knowledge/channels/vue-sfc.ts
- src/knowledge/confirmation/types.ts
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
| registerScanCommand | src/cli/commands/scan.ts | 5 |

## 导出函数

| 函数 | 签名 | 文件 |
| --- | --- | --- |
| adaptArchitecture | (raw: Record<string, any>): : ArchitectureData | src/mcp/codebase-memory-client.ts |
| adaptSide | (side: unknown): : TraceNodeLike[] | undefined | src/mcp/codebase-memory-client.ts |
| adaptTrace | (raw: Record<string, any>): : TraceResult | src/mcp/codebase-memory-client.ts |
| add | (file: string, tier: number): : void | src/knowledge/wiki-evidence.ts |
| addBulletList | (items: string[]): : this | src/knowledge/wiki-builder.ts |
| addCodeBlock | (language: string, code: string): : this | src/knowledge/wiki-builder.ts |
| addNewline | (): : this | src/knowledge/wiki-builder.ts |
| addParagraph | (text: string): : this | src/knowledge/wiki-builder.ts |
| addPending | ( byKey: Map<string, PendingConfirmation>, kind: PendingKind, text: string, contextLine: string, page: string, ): : void | src/knowledge/confirmation/types.ts |
| addSection | (title: string, content: string): : this | src/knowledge/wiki-builder.ts |
| addSubSection | (title: string, content: string): : this | src/knowledge/wiki-builder.ts |
| addTable | (headers: string[], rows: string[][]): : this | src/knowledge/wiki-builder.ts |
| addTitle | (title: string): : this | src/knowledge/wiki-builder.ts |
| anchorOf | (lines: string[], macro: string, file: string, lineOf: (n: number) => number): : SfcAnchor | src/knowledge/channels/vue-sfc.ts |
| anchorText | (file: string, line: number): : string | src/knowledge/fallback/shared.ts |
| runConfirmationSession | - | src/cli/confirm-interaction.ts |
| createProgram | - | src/cli/index.ts |
| hasRustSources | - | src/knowledge/channels/rust-methods.ts |
| scanRustMethodCalls | - | src/knowledge/channels/rust-methods.ts |
| sanitizeEdge | - | src/knowledge/channels/sanitizer.ts |

## 本页确定知道的事实

- CLI 命令 3 个（去重后）
- 导出函数 20 个（展示前 20 个）
## Related

- 同目录：[cli.md](cli.md)
- 共享 8 个源文件：[architecture.md](../02-architecture/architecture.md)
- 共享 8 个源文件：[modules.md](../02-architecture/modules.md)
- 共享 8 个源文件：[calls.md](../07-reference/calls.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
