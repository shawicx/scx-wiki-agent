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
- src/knowledge/channels/rust-methods.ts
- src/knowledge/channels/sanitizer.ts
- src/knowledge/channels/stats.ts
- src/knowledge/channels/vue-sfc.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/config-detector.ts
- src/knowledge/config-detector/detector.ts
</details>

## knowledge

文件数：108

语言：ts × 108

依赖：`shared`, `mcp`, `cli`, `core`

被依赖：`services`

扇入/扇出：0 / 0

### 设计依据（意图证据）

> 设计依据（意图证据）与 architecture.md 高度重合，已折叠；完整证据表见 [architecture.md](../02-architecture/architecture.md)。

### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/knowledge/channels/rust-methods.ts` | 未检出已索引符号 |
| `src/knowledge/channels/sanitizer.ts` | 未检出已索引符号 |
| `src/knowledge/channels/stats.ts` | 未检出已索引符号 |
| `src/knowledge/channels/vue-sfc.ts` | 未检出已索引符号 |
| `src/knowledge/claim-verifier.ts` | 未检出已索引符号 |
| `src/knowledge/config-detector/detector.ts` | 未检出已索引符号 |
| `src/knowledge/config-detector/env-purpose.ts` | 未检出已索引符号 |
| `src/knowledge/config-detector/index.ts` | 未检出已索引符号 |
| `src/knowledge/config-detector/package-manager.ts` | 未检出已索引符号 |
| `src/knowledge/config-detector/source-classification.ts` | 未检出已索引符号 |
| `src/knowledge/config-detector.ts` | 未检出已索引符号 |
| `src/knowledge/confirmation/apply.ts` | 未检出已索引符号 |

## services

文件数：15

语言：ts × 15

依赖：`knowledge`, `core`

被依赖：`cli`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/services/scan-service.ts` | 未检出已索引符号 |
| `src/services/wiki/archive.ts` | 未检出已索引符号 |
| `src/services/wiki/cleanup.ts` | 未检出已索引符号 |
| `src/services/wiki/confirm-phase.ts` | 未检出已索引符号 |
| `src/services/wiki/freshness.ts` | 未检出已索引符号 |
| `src/services/wiki/generate-phase.ts` | 未检出已索引符号 |
| `src/services/wiki/index.ts` | 未检出已索引符号 |
| `src/services/wiki/precheck.ts` | 未检出已索引符号 |
| `src/services/wiki/report.ts` | 未检出已索引符号 |
| `src/services/wiki/resolve.ts` | 未检出已索引符号 |
| `src/services/wiki/service.ts` | 未检出已索引符号 |
| `src/services/wiki/types.ts` | 未检出已索引符号 |

## mcp

文件数：2

语言：ts × 2

被依赖：`knowledge`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/mcp/codebase-memory-client.ts` | 未检出已索引符号 |
| `src/mcp/types.ts` | 未检出已索引符号 |

## core

文件数：2

语言：ts × 2

依赖：`shared`

被依赖：`knowledge`, `services`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/core/scanner.ts` | 未检出已索引符号 |
| `src/core/types.ts` | 未检出已索引符号 |

## shared

文件数：4

语言：ts × 4

被依赖：`knowledge`, `core`, `cli`

扇入/扇出：0 / 0

### 设计依据（意图证据）


### 文件结构

| 文件 | 关键符号 |
| --- | --- |
| `src/shared/config.ts` | 未检出已索引符号 |
| `src/shared/constants.ts` | 未检出已索引符号 |
| `src/shared/language-patterns.ts` | 未检出已索引符号 |
| `src/shared/utils.ts` | 未检出已索引符号 |

## cli

文件数：6

语言：ts × 6

依赖：`shared`, `services`

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

## 本页确定知道的事实

- 详述模块 6 个
- 检出依赖关系的模块 6 个
- 检出意图证据（注释/提交/文档）的模块 6 个

## 未知项

- 6 个详述模块未检出图谱符号
## Related

- 同目录：[architecture.md](architecture.md)
- 互补职责：[architecture.md](../02-architecture/architecture.md)
- 共享 7 个源文件、共享 6 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 9 个源文件：[calls.md](../07-reference/calls.md)
- 共享 4 个源文件、共享 5 个符号：[topic:topic-9.md](../08-topics/topic-9.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
