# API Reference

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/knowledge/page-registry.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-fallback-builder.ts
- src/mcp/codebase-memory-client.ts
</details>

## CLI Commands

| Command | File | Line |
| --- | --- | --- |
| registerBuildCommand | src/cli/commands/build.ts | 9 |
| registerInitCommand | src/cli/commands/init.ts | 6 |
| registerScanCommand | src/cli/commands/scan.ts | 4 |

## Exported Functions

| Function | Signature | File |
| --- | --- | --- |
| adaptArchitecture | (raw: Record<string, any>) | src/mcp/codebase-memory-client.ts |
| adaptSide | (side: unknown) | src/mcp/codebase-memory-client.ts |
| adaptTrace | (raw: Record<string, any>) | src/mcp/codebase-memory-client.ts |
| addBulletList | (items: string[]) | src/knowledge/wiki-builder.ts |
| addCodeBlock | (language: string, code: string) | src/knowledge/wiki-builder.ts |
| addNewline | () | src/knowledge/wiki-builder.ts |
| addParagraph | (text: string) | src/knowledge/wiki-builder.ts |
| addSection | (title: string, content: string) | src/knowledge/wiki-builder.ts |
| addSubSection | (title: string, content: string) | src/knowledge/wiki-builder.ts |
| addTable | (headers: string[], rows: string[][]) | src/knowledge/wiki-builder.ts |
| addTitle | (title: string) | src/knowledge/wiki-builder.ts |
| asObjects | (raw: Record<string, unknown>, key: string) | src/mcp/codebase-memory-client.ts |
| build | () | src/knowledge/wiki-builder.ts |
| buildApi | (ctx: ApiContext) | src/knowledge/wiki-fallback-builder.ts |
| buildApiContext | () | src/knowledge/wiki-context-builder.ts |
| createProgram |  | src/cli/index.ts |
| tier2PagesFor |  | src/knowledge/page-registry.ts |
| findPageDescriptor |  | src/knowledge/page-registry.ts |
| pageRelPath |  | src/knowledge/page-registry.ts |
| isTopicPage |  | src/knowledge/page-registry.ts |
## Related

- 同目录：[cli.md](cli.md)
- 总入口：[README](../README.md)
