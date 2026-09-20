# Architecture

<details>
<summary>Relevant source files</summary>

- src/core/scanner.ts
- src/knowledge/config-detector.ts
- src/knowledge/topic-discovery.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
</details>

Module overview:

## knowledge

Key exports: `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection`

## mcp

Key exports: `adaptArchitecture`, `adaptTrace`, `asObjects`, `ensureIndexed`, `exec`

## core

Key exports: `collectImportedPackages`

## services

Key exports: `cleanupLegacyFlatFiles`, `cleanupRetiredPages`, `cleanupStaleTopicPages`

## fixtures

No top-level symbols detected

## cli

No top-level symbols detected

## shared

No top-level symbols detected

## helpers

No top-level symbols detected

## Layers

| Package | Layer | Reason |
| --- | --- | --- |
|  | api | has HTTP route definitions |
| cli | internal | fan-in=2, fan-out=4 |
| core | internal | fan-in=2, fan-out=2 |
| helpers | internal | fan-in=0, fan-out=0 |
| knowledge | core | high fan-in (22 in, 13 out) |
| mcp | leaf | only inbound calls, no outbound |
| services | internal | fan-in=2, fan-out=24 |
| shared | core | high fan-in (14 in, 0 out) |
| ts | api | has HTTP route definitions |

## Module Boundaries

| From | To | Call Count |
| --- | --- | --- |
| services | knowledge | 22 |
| knowledge | shared | 12 |
| core | shared | 2 |
| cli | services | 2 |
| services | core | 1 |
| cli | core | 1 |
| cli | mcp | 1 |
| services | cli | 1 |
| knowledge | cli | 1 |

## Module Dependencies

| From | To |
| --- | --- |
| services | knowledge |
| knowledge | shared |
| core | shared |
| cli | services |
| services | core |
| cli | core |
| cli | mcp |
| services | cli |
| knowledge | cli |
## Related

- 同目录：[data-flow.md](data-flow.md) · [modules.md](modules.md)
- 总入口：[README](../README.md)
