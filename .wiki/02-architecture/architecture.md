# Architecture

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/config-detector.ts
- src/knowledge/outline-planner.ts
- src/knowledge/outline.ts
- src/knowledge/page-registry.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
</details>

Module overview:

## knowledge

Key exports: `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection`

## mcp

Key exports: `adaptArchitecture`, `adaptTrace`, `asObjects`

## services

Key exports: `cleanupLegacyFlatFiles`, `cleanupRetiredPages`, `cleanupStaleChapterPages`

## core

No top-level symbols detected

## fixtures

No top-level symbols detected

## shared

No top-level symbols detected

## cli

No top-level symbols detected

## helpers

No top-level symbols detected

## Layers

| Package | Layer | Reason |
| --- | --- | --- |
|  | api | has HTTP route definitions |
| cli | internal | fan-in=4, fan-out=6 |
| core | internal | fan-in=2, fan-out=3 |
| helpers | leaf | only inbound calls, no outbound |
| knowledge | internal | fan-in=33, fan-out=37 |
| services | internal | fan-in=2, fan-out=35 |
| shared | core | high fan-in (39 in, 0 out) |
| ts | api | has HTTP route definitions |

## Module Boundaries

| From | To | Call Count |
| --- | --- | --- |
| knowledge | shared | 33 |
| services | knowledge | 33 |
| knowledge | cli | 3 |
| cli | shared | 3 |
| core | shared | 3 |
| cli | services | 2 |
| services | cli | 1 |
| knowledge | helpers | 1 |
| services | core | 1 |
| cli | core | 1 |

## Module Dependencies

| From | To |
| --- | --- |
| knowledge | shared |
| services | knowledge |
| knowledge | cli |
| cli | shared |
| core | shared |
| cli | services |
| services | cli |
| knowledge | helpers |
| services | core |
| cli | core |
## Related

- 同目录：[data-flow.md](data-flow.md) · [modules.md](modules.md)
- 总入口：[README](../README.md)
