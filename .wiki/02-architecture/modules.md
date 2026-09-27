# Modules

<details>
<summary>Relevant source files</summary>

- src/knowledge/claim-verifier.ts
- src/knowledge/outline-planner.ts
- src/knowledge/page-registry.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-continuation.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/mcp/codebase-memory-client.ts
- src/services/wiki-service.ts
</details>

## knowledge

Key exports: `Claim`, `GenerationOutcome`, `StreamOutcome`, `buildArchitectureSections`, `buildGlossarySections`

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/knowledge/claim-verifier.ts` | `Claim` |
| `src/knowledge/wiki-page-generator.ts` | `GenerationOutcome`, `StreamOutcome`, `buildArchitectureSections`, `buildGlossarySections`, `buildModulesSections` |
| `src/knowledge/wiki-builder.ts` | `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection` |
| `src/knowledge/wiki-context-builder.ts` | `appendSourceFallback`, `buildApiContext`, `buildArchitectureContext`, `buildByName`, `buildCallChainFromEdges` |
| `src/knowledge/wiki-continuation.ts` | `assembleSections` |
| `src/knowledge/wiki-fallback-builder.ts` | `buildApi`, `buildArchitecture`, `buildByName`, `buildCalls`, `buildChapterPage` |
| `src/knowledge/wiki-evidence.ts` | `buildEvidenceBlock` |
| `src/knowledge/outline-planner.ts` | `buildInputs` |
| `src/knowledge/page-registry.ts` | `buildRelatedSection` |

## mcp

Key exports: `adaptArchitecture`, `adaptSide`, `adaptTrace`, `asObjects`

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/mcp/codebase-memory-client.ts` | `adaptArchitecture`, `adaptSide`, `adaptTrace`, `asObjects` |

## services

Key exports: `PageProduced`, `PageStatus`

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/services/wiki-service.ts` | `PageProduced`, `PageStatus` |

## core

No details available.

## fixtures

No details available.

## shared

No details available.

## cli

No details available.

## helpers

No details available.
## Related

- 同目录：[architecture.md](architecture.md) · [data-flow.md](data-flow.md)
- 总入口：[README](../README.md)
