# API Reference

## CLI Commands



| Command | File | Line |
| --- | --- | --- |
| registerBuildCommand | src/cli/commands/build.ts | 0 |
| registerInitCommand | src/cli/commands/init.ts | 0 |
| registerScanCommand | src/cli/commands/scan.ts | 0 |
| createProgram | src/cli/index.ts | 0 |
| findProjectRoot | src/cli/utils.ts | 0 |
| computeHash | src/shared/utils.ts | 0 |
| getFileLanguage | src/shared/utils.ts | 0 |
| relativePath | src/shared/utils.ts | 0 |
| generateId | src/shared/utils.ts | 0 |

## Exported Functions



| Function | Signature | File |
| --- | --- | --- |
| addBulletList | (items: string[]) | src/knowledge/wiki-builder.ts |
| addCodeBlock | (language: string, code: string) | src/knowledge/wiki-builder.ts |
| addNewline | () | src/knowledge/wiki-builder.ts |
| addParagraph | (text: string) | src/knowledge/wiki-builder.ts |
| addSection | (title: string, content: string) | src/knowledge/wiki-builder.ts |
| addSubSection | (title: string, content: string) | src/knowledge/wiki-builder.ts |
| addTable | (headers: string[], rows: string[][]) | src/knowledge/wiki-builder.ts |
| addTitle | (title: string) | src/knowledge/wiki-builder.ts |
| build | () | src/knowledge/wiki-builder.ts |
| buildApi | (ctx: ApiContext) | src/knowledge/wiki-fallback-builder.ts |
| buildApiContext | () | src/knowledge/wiki-context-builder.ts |
| buildArchitecture | (ctx: ArchitectureContext) | src/knowledge/wiki-fallback-builder.ts |
| buildArchitectureContext | () | src/knowledge/wiki-context-builder.ts |
| buildBusiness | (ctx: BusinessContext) | src/knowledge/wiki-fallback-builder.ts |
| buildBusinessContext | () | src/knowledge/wiki-context-builder.ts |
| buildDataFlow | (ctx: DataFlowContext) | src/knowledge/wiki-fallback-builder.ts |
| buildDataFlowContext | () | src/knowledge/wiki-context-builder.ts |
| buildDesignDecisions | (ctx: DesignDecisionsContext) | src/knowledge/wiki-fallback-builder.ts |
| buildDesignDecisionsContext | () | src/knowledge/wiki-context-builder.ts |
| buildGlossary | (ctx: GlossaryContext) | src/knowledge/wiki-fallback-builder.ts |