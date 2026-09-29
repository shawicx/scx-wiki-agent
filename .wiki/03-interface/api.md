# API Reference

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/confirmation.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/mcp/codebase-memory-client.ts
</details>

## CLI Commands

| Command | File | Line |
| --- | --- | --- |
| registerBuildCommand | src/cli/commands/build.ts | 11 |
| registerInitCommand | src/cli/commands/init.ts | 8 |
| registerScanCommand | src/cli/commands/scan.ts | 4 |

## Exported Functions

| Function | Signature | File |
| --- | --- | --- |
| adaptArchitecture | (raw: Record<string, any>) | src/mcp/codebase-memory-client.ts |
| adaptSide | (side: unknown) | src/mcp/codebase-memory-client.ts |
| adaptTrace | (raw: Record<string, any>) | src/mcp/codebase-memory-client.ts |
| add | (\n  byKey: Map<string, PendingConfirmation>,\n  kind: PendingKind,\n  text: string,\n  contextLine: string,\n  page: string,\n) | src/knowledge/confirmation.ts |
| addBulletList | (items: string[]) | src/knowledge/wiki-builder.ts |
| addCodeBlock | (language: string, code: string) | src/knowledge/wiki-builder.ts |
| addNewline | () | src/knowledge/wiki-builder.ts |
| addParagraph | (text: string) | src/knowledge/wiki-builder.ts |
| addSection | (title: string, content: string) | src/knowledge/wiki-builder.ts |
| addSubSection | (title: string, content: string) | src/knowledge/wiki-builder.ts |
| addTable | (headers: string[], rows: string[][]) | src/knowledge/wiki-builder.ts |
| addTitle | (title: string) | src/knowledge/wiki-builder.ts |
| appendSourceFallback | (existing: Array<{ name: string }>) | src/knowledge/wiki-context-builder.ts |
| applyConfirmations | (\n  content: string,\n  decisions: ReadonlyMap<string, ConfirmationDecision>,\n) | src/knowledge/confirmation.ts |
| asObjects | (raw: Record<string, unknown>, key: string) | src/mcp/codebase-memory-client.ts |
| runConfirmationSession |  | src/cli/confirm-interaction.ts |
| createProgram |  | src/cli/index.ts |
| extractClaims |  | src/knowledge/claim-verifier.ts |
| verifyAndAnnotateClaims |  | src/knowledge/claim-verifier.ts |
| collectContextKeys |  | src/knowledge/claim-verifier.ts |
## Related

- 同目录：[cli.md](cli.md)
- 总入口：[README](../README.md)
