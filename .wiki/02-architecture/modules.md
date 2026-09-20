# Modules

<details>
<summary>Relevant source files</summary>

- src/knowledge/page-registry.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-quality-validator.ts
- src/mcp/codebase-memory-client.ts
- src/services/wiki-service.ts
</details>

## knowledge

Key exports: `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection`

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/knowledge/wiki-builder.ts` | `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection` |
| `src/knowledge/wiki-fallback-builder.ts` | `buildApi`, `buildArchitecture`, `buildByName`, `buildCalls`, `buildClasses` |
| `src/knowledge/wiki-context-builder.ts` | `buildApiContext`, `buildArchitectureContext`, `buildByName`, `buildCallChainFromEdges`, `buildCallsContext` |
| `src/knowledge/wiki-evidence.ts` | `buildEvidenceBlock` |
| `src/knowledge/page-registry.ts` | `buildRelatedSection` |
| `src/knowledge/wiki-quality-validator.ts` | `checkAnchors`, `checkDeadLinks`, `checkEmptyShell`, `checkMermaid` |

## mcp

Key exports: `adaptArchitecture`, `adaptSide`, `adaptTrace`, `asObjects`

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/mcp/codebase-memory-client.ts` | `adaptArchitecture`, `adaptSide`, `adaptTrace`, `asObjects` |

## core

No details available.

## services

Key exports: `PageProduced`, `PageStatus`, `buildWiki`

### File Structure

| File | Key Symbols |
| --- | --- |
| `src/services/wiki-service.ts` | `PageProduced`, `PageStatus`, `buildWiki` |

## fixtures

No details available.

## cli

No details available.

## shared

No details available.

## helpers

No details available.
## Related

- 同目录：[architecture.md](architecture.md) · [data-flow.md](data-flow.md)
- 总入口：[README](../README.md)
