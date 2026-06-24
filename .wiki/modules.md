# Modules

## knowledge

Key exports: `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection`

### File Structure



| File | Key Symbols |
| --- | --- |
| `src/knowledge/wiki-builder.ts` | `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection` |
| `src/knowledge/wiki-fallback-builder.ts` | `buildApi`, `buildArchitecture`, `buildBusiness`, `buildDataFlow`, `buildDesignDecisions` |
| `src/knowledge/wiki-context-builder.ts` | `buildBusinessContext`, `buildDataFlowContext`, `buildDesignDecisionsContext`, `buildGlossaryContext`, `buildModulesContext` |
| `src/knowledge/wiki-page-generator.ts` | `constructor`, `generate` |

## mcp

Key exports: `detectChanges`, `ensureIndexed`, `exec`, `getArchitecture`, `getCodeSnippet`

### File Structure



| File | Key Symbols |
| --- | --- |
| `src/mcp/codebase-memory-client.ts` | `detectChanges`, `ensureIndexed`, `exec`, `getArchitecture`, `getCodeSnippet` |

## fixtures

No details available.

## services

Key exports: `buildWiki`, `generateFallback`, `generatePage`, `generateWithLlm`

### File Structure



| File | Key Symbols |
| --- | --- |
| `src/services/wiki-service.ts` | `buildWiki`, `generateFallback`, `generatePage`, `generateWithLlm` |

## core

Key exports: `detectProjectType`, `detectSourceDirs`, `detectTechStack`, `isIgnored`, `loadGitignore`

### File Structure



| File | Key Symbols |
| --- | --- |
| `src/core/scanner.ts` | `detectProjectType`, `detectSourceDirs`, `detectTechStack`, `isIgnored`, `loadGitignore` |

## cli

Key exports: `findProjectRoot`, `registerBuildCommand`, `registerInitCommand`, `registerScanCommand`

### File Structure



| File | Key Symbols |
| --- | --- |
| `src/cli/utils.ts` | `findProjectRoot` |
| `src/cli/commands/build.ts` | `registerBuildCommand` |
| `src/cli/commands/init.ts` | `registerInitCommand` |
| `src/cli/commands/scan.ts` | `registerScanCommand` |

## shared

No details available.

## helpers

Key exports: `createMockClient`

### File Structure



| File | Key Symbols |
| --- | --- |
| `tests/helpers/mock-mcp-client.ts` | `createMockClient` |
