# 模块

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/commands/types.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/core/types.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/config-detector/detector.ts
- src/knowledge/context/calls.ts
- src/knowledge/context/data-flow.ts
- src/knowledge/context/db-schema.ts
- src/knowledge/context/frontend.ts
- src/knowledge/context/workspaces.ts
</details>

## knowledge

文件数：99

语言：ts × 99

关键导出：`buildByName`（src/knowledge/fallback/index.ts:55）, `buildCallsContext`（src/knowledge/context/calls.ts:51）, `buildDbSchemaContext`（src/knowledge/context/db-schema.ts:118）, `buildDataFlowContext`（src/knowledge/context/data-flow.ts:29）, `buildEdges`（src/knowledge/context/workspaces.ts:106）

依赖：`shared`, `cli`, `mcp`, `core`

被依赖：`services`

扇入/扇出：0 / 0

### 设计依据（意图证据）

> 设计依据（意图证据）与 architecture.md 高度重合，已折叠；完整证据表见 [architecture.md](../02-architecture/architecture.md)。

### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/knowledge/fallback/index.ts` | `buildByName`（src/knowledge/fallback/index.ts:55） |
| `src/knowledge/context/calls.ts` | `buildCallsContext`（src/knowledge/context/calls.ts:51） |
| `src/knowledge/context/db-schema.ts` | `buildDbSchemaContext`（src/knowledge/context/db-schema.ts:118） |
| `src/knowledge/context/data-flow.ts` | `buildDataFlowContext`（src/knowledge/context/data-flow.ts:29） |
| `src/knowledge/context/workspaces.ts` | `buildEdges`（src/knowledge/context/workspaces.ts:106） |
| `src/knowledge/fallback/structure.ts` | `buildArchitecture`（src/knowledge/fallback/structure.ts:72） |
| `src/knowledge/fallback/surface.ts` | `buildOnboarding`（src/knowledge/fallback/surface.ts:118） |
| `src/knowledge/generator/structure.ts` | `buildGlossarySections`（src/knowledge/generator/structure.ts:229） |
| `src/knowledge/outline-planner.ts` | `buildInputs`（src/knowledge/outline-planner.ts:70） |
| `src/knowledge/context/frontend.ts` | `buildComponentsContext`（src/knowledge/context/frontend.ts:67） |
| `src/knowledge/claim-verifier.ts` | 未检出已索引符号 |
| `src/knowledge/config-detector/detector.ts` | 未检出已索引符号 |

## services

文件数：12

语言：ts × 12

依赖：`knowledge`

被依赖：`cli`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/services/scan-service.ts` | 未检出已索引符号 |
| `src/services/wiki/cleanup.ts` | 未检出已索引符号 |
| `src/services/wiki/confirm-phase.ts` | 未检出已索引符号 |
| `src/services/wiki/generate-phase.ts` | 未检出已索引符号 |
| `src/services/wiki/index.ts` | 未检出已索引符号 |
| `src/services/wiki/report.ts` | 未检出已索引符号 |
| `src/services/wiki/resolve.ts` | 未检出已索引符号 |
| `src/services/wiki/service.ts` | 未检出已索引符号 |
| `src/services/wiki/types.ts` | 未检出已索引符号 |
| `src/services/wiki/verification.ts` | 未检出已索引符号 |
| `src/services/wiki/write-phase.ts` | 未检出已索引符号 |
| `src/services/wiki-service.ts` | 未检出已索引符号 |

## mcp

文件数：2

语言：ts × 2

关键导出：`adaptTrace`（src/mcp/codebase-memory-client.ts:92）, `asObjects`（src/mcp/codebase-memory-client.ts:35）, `adaptArchitecture`（src/mcp/codebase-memory-client.ts:45）, `adaptSide`（src/mcp/codebase-memory-client.ts:93）

被依赖：`knowledge`, `cli`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/mcp/codebase-memory-client.ts` | `adaptTrace`（src/mcp/codebase-memory-client.ts:92）, `asObjects`（src/mcp/codebase-memory-client.ts:35）, `adaptArchitecture`（src/mcp/codebase-memory-client.ts:45）, `adaptSide`（src/mcp/codebase-memory-client.ts:93） |
| `src/mcp/types.ts` | 未检出已索引符号 |

## core

文件数：2

语言：ts × 2

依赖：`shared`

被依赖：`cli`, `knowledge`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/core/scanner.ts` | 未检出已索引符号 |
| `src/core/types.ts` | 未检出已索引符号 |

## cli

文件数：6

语言：ts × 6

依赖：`shared`, `services`, `core`, `mcp`

被依赖：`knowledge`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/cli/commands/build.ts` | 未检出已索引符号 |
| `src/cli/commands/init.ts` | 未检出已索引符号 |
| `src/cli/commands/scan.ts` | 未检出已索引符号 |
| `src/cli/commands/types.ts` | 未检出已索引符号 |
| `src/cli/confirm-interaction.ts` | 未检出已索引符号 |
| `src/cli/index.ts` | 未检出已索引符号 |

## shared

文件数：3

语言：ts × 3

被依赖：`knowledge`, `core`, `cli`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/shared/config.ts` | 未检出已索引符号 |
| `src/shared/constants.ts` | 未检出已索引符号 |
| `src/shared/utils.ts` | 未检出已索引符号 |

## 本页确定知道的事实

- 详述模块 6 个
- 检出依赖关系的模块 6 个
- 检出意图证据（注释/提交/文档）的模块 6 个

## 未知项

- 4 个详述模块未检出图谱符号
## Related

- 同目录：[architecture.md](architecture.md)
- 互补职责：[architecture.md](../02-architecture/architecture.md)
- 共享 4 个源文件、共享 8 个符号：[topic:topic-9.md](../08-topics/topic-9.md)
- 共享 6 个源文件、共享 4 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 7 个源文件：[calls.md](../07-reference/calls.md)
- 总入口：[README](../README.md)
