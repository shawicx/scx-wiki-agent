# 约束与限制

<details>
<summary>Relevant source files</summary>

- scripts/check-file-lines.mjs
- src/cli/confirm-interaction.ts
- src/knowledge/confirmation/apply.ts
- src/knowledge/context/architecture.ts
- src/knowledge/context/calls.ts
- src/knowledge/context/data-flow.ts
- src/knowledge/context/modules-api.ts
- src/knowledge/crosspage/actions.ts
- src/knowledge/dataflow/index.ts
- src/knowledge/dataflow/shapes.ts
- src/knowledge/dataflow/type-defs.ts
- src/knowledge/fallback/data-flow.ts
- src/knowledge/fallback/index.ts
- src/knowledge/fallback/meta-ops.ts
- src/knowledge/fallback/meta.ts
</details>

项目边界与代价：性能预算、复杂度上限、已知限制。

## 限制常量（源码提取）

| 常量 | 值 | 源文件:行号 |
| --- | --- | --- |
| `LIMIT` | `360` | scripts/check-file-lines.mjs:9 |
| `BULK_THRESHOLD` | `15` | src/cli/confirm-interaction.ts:14 |
| `MODULE_SYMBOL_CANDIDATE_LIMIT` | `60` | src/knowledge/context/architecture.ts:14 |
| `ARCHITECTURE_SYMBOL_LIMIT` | `6` | src/knowledge/context/architecture.ts:16 |
| `MODULES_SYMBOL_LIMIT` | `10` | src/knowledge/context/architecture.ts:18 |
| `MODULES_SYMBOLS_PER_FILE_LIMIT` | `5` | src/knowledge/context/architecture.ts:20 |
| `MODULES_REPRESENTATIVE_FILE_LIMIT` | `12` | src/knowledge/context/architecture.ts:21 |
| `CALLS_MIN_GROUPS` | `6` | src/knowledge/context/calls.ts:13 |
| `CALLS_EDGE_LIMIT` | `40` | src/knowledge/context/calls.ts:15 |
| `DATA_FLOW_FILE_LIMIT` | `30` | src/knowledge/context/data-flow.ts:23 |
| `DATA_FLOW_SYMBOL_LIMIT` | `200` | src/knowledge/context/data-flow.ts:25 |
| `DATA_FLOW_TYPE_LIMIT` | `60` | src/knowledge/context/data-flow.ts:27 |
| `MAX_DEPTH` | `3` | src/knowledge/context/data-flow.ts:201 |
| `MAX_NODES` | `25` | src/knowledge/context/data-flow.ts:202 |
| `MODULE_DETAIL_LIMIT` | `12` | src/knowledge/context/modules-api.ts:24 |
| `DATA_FLOW_MAX_STAGES` | `24` | src/knowledge/dataflow/index.ts:60 |
| `DATA_FLOW_MAX_TRANSITIONS` | `40` | src/knowledge/dataflow/index.ts:62 |
| `DATA_FLOW_MAX_IO_EVENTS` | `30` | src/knowledge/dataflow/index.ts:64 |
| `DATA_FLOW_MAX_EXPRESSION` | `120` | src/knowledge/dataflow/shapes.ts:9 |
| `DATA_FLOW_MAX_TYPE_DEFS` | `20` | src/knowledge/dataflow/type-defs.ts:11 |
| `DATA_FLOW_MAX_TYPE_TEXT` | `1200` | src/knowledge/dataflow/type-defs.ts:13 |
| `GIT_LOG_LIMIT` | `200` | src/knowledge/intent/shared.ts:63 |
| `GIT_TIMEOUT_MS` | `15_000` | src/knowledge/intent/shared.ts:64 |
| `REPO_LOG_LIMIT` | `400` | src/knowledge/intent/shared.ts:70 |
| `CHURN_LOG_LIMIT` | `2000` | src/knowledge/intent/shared.ts:72 |
| `MAX_FILES_PER_MODULE` | `15` | src/knowledge/outline-planner.ts:38 |
| `MAX_CANDIDATE_FILES` | `90` | src/knowledge/outline-planner.ts:40 |
| `MAX_CHAPTERS` | `8` | src/knowledge/outline.ts:80 |
| `MAX_PAGES_PER_CHAPTER` | `6` | src/knowledge/outline.ts:81 |
| `MAX_OUTLINE_PAGES` | `16` | src/knowledge/outline.ts:82 |
| `MIN_PAGE_FILES` | `3` | src/knowledge/outline.ts:84 |
| `MAX_PAGE_FILES` | `12` | src/knowledge/outline.ts:85 |
| `MAX_TITLE_LEN` | `80` | src/knowledge/outline.ts:89 |
| `MAX_SUMMARY_LEN` | `200` | src/knowledge/outline.ts:90 |
| `MAX_BRIEF_LEN` | `2000` | src/knowledge/outline.ts:91 |
| `MAX_SPAN_MODULES` | `3` | src/knowledge/outline.ts:94 |
| `MAX_NAMES` | `40` | src/knowledge/source-fallback.ts:23 |
| `MAX_SIGNATURE_LEN` | `160` | src/knowledge/source-fallback.ts:25 |
| `MAX_TOPICS` | `4` | src/knowledge/topic-discovery.ts:29 |
| `MIN_CLUSTER_MEMBERS` | `5` | src/knowledge/topic-discovery.ts:30 |
| `MIN_TOPIC_FILES` | `3` | src/knowledge/topic-discovery.ts:32 |
| `MAX_TOPIC_FILES` | `12` | src/knowledge/topic-discovery.ts:33 |
| `MAX_TOPIC_OVERLAP` | `0.5` | src/knowledge/topic-discovery.ts:35 |
| `MIN_CONTINUATION_KEEP` | `200` | src/knowledge/wiki-continuation.ts:16 |
| `EVIDENCE_MAX_FILES` | `15` | src/knowledge/wiki-evidence.ts:14 |
| `EVIDENCE_MIN_FILES` | `3` | src/knowledge/wiki-evidence.ts:16 |
| `WIKI_MAX_CONTINUATIONS` | `2` | src/shared/constants.ts:6 |
| `WIKI_MAX_GREP_PROBES` | `12` | src/shared/constants.ts:9 |

## 限制由来（源码注释证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 待确认项超过此数时先问一次「逐项 / 全部保持」（防 Marathon 会话） | 常量注释 | BULK_THRESHOLD | src/cli/confirm-interaction.ts:14 |
| 每个生产包的图谱符号候选上限（分包查询，避免全局 Top N 挤占小模块） | 常量注释 | MODULE_SYMBOL_CANDIDATE_LIMIT | src/knowledge/context/architecture.ts:14 |
| Architecture 页每模块代表符号上限 | 常量注释 | ARCHITECTURE_SYMBOL_LIMIT | src/knowledge/context/architecture.ts:16 |
| Modules 页每模块代表符号 / 代表文件上限 | 常量注释 | MODULES_SYMBOL_LIMIT | src/knowledge/context/architecture.ts:18 |
| Modules 页单个文件最多贡献的符号数（防单文件垄断） | 常量注释 | MODULES_SYMBOLS_PER_FILE_LIMIT | src/knowledge/context/architecture.ts:20 |
| calls 页目标入口组数：入口组不足时以高扇入热点锚定回填（覆盖稀疏的主力补偿） | 常量注释 | CALLS_MIN_GROUPS | src/knowledge/context/calls.ts:13 |
| calls 页单次查询边数上限（BFS 每层两次查询各限此数） | 常量注释 | CALLS_EDGE_LIMIT | src/knowledge/context/calls.ts:15 |
| data-flow 形态证据查询的文件数上限（防大仓库单查询爆炸） | 常量注释 | DATA_FLOW_FILE_LIMIT | src/knowledge/context/data-flow.ts:23 |
| data-flow 符号事实查询上限 | 常量注释 | DATA_FLOW_SYMBOL_LIMIT | src/knowledge/context/data-flow.ts:25 |
| data-flow 类型定义节点查询上限 | 常量注释 | DATA_FLOW_TYPE_LIMIT | src/knowledge/context/data-flow.ts:27 |
| modules 页详述上限：超过后其余模块聚合为概要（DeepWiki 目录分组分块的防超限映射） | 常量注释 | MODULE_DETAIL_LIMIT | src/knowledge/context/modules-api.ts:24 |
| 阶段上限（表格与 prompt 预算） | 常量注释 | DATA_FLOW_MAX_STAGES | src/knowledge/dataflow/index.ts:60 |
| 带数据证据的转换边上限 | 常量注释 | DATA_FLOW_MAX_TRANSITIONS | src/knowledge/dataflow/index.ts:62 |
| I/O 边界事件上限 | 常量注释 | DATA_FLOW_MAX_IO_EVENTS | src/knowledge/dataflow/index.ts:64 |
| 表达式截断长度 | 常量注释 | DATA_FLOW_MAX_EXPRESSION | src/knowledge/dataflow/shapes.ts:9 |
| 类型定义条数上限 | 常量注释 | DATA_FLOW_MAX_TYPE_DEFS | src/knowledge/dataflow/type-defs.ts:11 |
| 单条类型定义文本上限（字符） | 常量注释 | DATA_FLOW_MAX_TYPE_TEXT | src/knowledge/dataflow/type-defs.ts:13 |
| 全仓 churn 排名用 log 上限（--name-only 批量一次；只取相对频次，无需全历史） | 常量注释 | CHURN_LOG_LIMIT | src/knowledge/intent/shared.ts:72 |
| 每模块候选文件上限（锚点候选池规模控制） | 常量注释 | MAX_FILES_PER_MODULE | src/knowledge/outline-planner.ts:38 |
| 全局候选文件上限 | 常量注释 | MAX_CANDIDATE_FILES | src/knowledge/outline-planner.ts:40 |
| 与主题页 MIN_TOPIC_FILES 对齐：防章节页天然薄证据 | 常量注释 | MIN_PAGE_FILES | src/knowledge/outline.ts:84 |
| 页跨模块数超过该值视为杂烩页（W2） | 常量注释 | MAX_SPAN_MODULES | src/knowledge/outline.ts:94 |

## 高复杂度函数（complexity > 3）

关注圈复杂度高的函数，考虑重构

| 函数 | 源文件 | 复杂度 | 循环深度 |
| --- | --- | --- | --- |
| adaptSide | src/mcp/codebase-memory-client.ts | 4 | 2 |
| adaptTrace | src/mcp/codebase-memory-client.ts | 4 | 2 |
| applyConfirmations | src/knowledge/confirmation/apply.ts | 7 | 1 |
| applyCrossPageActions | src/knowledge/crosspage/actions.ts | 4 | 1 |
| assembleSections | src/knowledge/wiki-continuation.ts | 6 | 1 |
| buildApi | src/knowledge/fallback/surface.ts | 6 | 0 |
| buildApiContext | src/knowledge/context/modules-api.ts | 5 | 1 |
| buildArchitecture | src/knowledge/fallback/structure.ts | 10 | 1 |
| buildByName | src/knowledge/fallback/index.ts | 22 | 0 |
| buildCallChainFromEdges | src/knowledge/context/data-flow.ts | 10 | 2 |
| buildCalls | src/knowledge/fallback/reference.ts | 4 | 1 |
| buildCallsContext | src/knowledge/context/calls.ts | 14 | 2 |
| buildChapterPage | src/knowledge/fallback/topic.ts | 4 | 0 |
| buildClasses | src/knowledge/fallback/reference.ts | 5 | 1 |
| buildCli | src/knowledge/fallback/meta-ops.ts | 4 | 1 |
| buildConstraints | src/knowledge/fallback/meta.ts | 4 | 0 |
| buildConventions | src/knowledge/fallback/meta.ts | 4 | 1 |
| buildDataFlow | src/knowledge/fallback/data-flow.ts | 5 | 1 |
| buildDataFlowContext | src/knowledge/context/data-flow.ts | 11 | 2 |
| buildDecisions | src/knowledge/fallback/meta-ops.ts | 4 | 0 |

## 本页确定知道的事实

- 限制常量 48 个（源码 MAX/MIN/LIMIT/TIMEOUT 类命名提取，均带 file:line 锚点）
- 高复杂度函数 20 个（complexity > 3，最高 4）
- 限制由来注释证据 22 条
## Related

- 同目录：[conventions.md](conventions.md)
- 共享 4 个源文件、共享 69 个符号：[troubleshooting.md](../05-guides/troubleshooting.md)
- 共享 4 个源文件：[architecture.md](../02-architecture/architecture.md)
- 共享 4 个源文件：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)
