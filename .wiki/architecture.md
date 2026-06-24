# Architecture

Module overview:

## knowledge

No top-level symbols detected

## mcp

No top-level symbols detected

## fixtures

No top-level symbols detected

## services

No top-level symbols detected

## core

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
| cli | entry | has entry points, only outbound calls |
| core | internal | fan-in=3, fan-out=2 |
| helpers | internal | fan-in=0, fan-out=0 |
| knowledge | core | high fan-in (33 in, 13 out) |
| mcp | core | high fan-in (15 in, 0 out) |
| services | internal | fan-in=4, fan-out=36 |
| shared | leaf | only inbound calls, no outbound |
| ts | api | has HTTP route definitions |

## Module Boundaries



| From | To | Call Count |
| --- | --- | --- |
| services | knowledge | 33 |
| knowledge | mcp | 13 |
| cli | services | 4 |
| core | shared | 2 |
| services | core | 2 |
| services | mcp | 1 |
| cli | core | 1 |
| cli | mcp | 1 |

## Module Dependencies



| From | To |
| --- | --- |
| services | knowledge |
| knowledge | mcp |
| cli | services |
| core | shared |
| services | core |
| services | mcp |
| cli | core |
| cli | mcp |