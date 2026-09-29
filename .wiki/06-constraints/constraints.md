# Constraints

<details>
<summary>Relevant source files</summary>

- src/cli/confirm-interaction.ts
- src/knowledge/confirmation.ts
- src/knowledge/intent-evidence.ts
- src/knowledge/outline-planner.ts
- src/knowledge/outline.ts
- src/knowledge/source-fallback.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-continuation.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
- src/mcp/codebase-memory-client.ts
- src/shared/constants.ts
- tests/knowledge/config-detector.test.ts
- tests/knowledge/intent-evidence.test.ts
</details>

项目边界与代价：性能预算、复杂度上限、已知限制。

## 限制常量（源码提取）

| 常量 | 值 | 源文件 |
| --- | --- | --- |
| `BULK_THRESHOLD` | `15` | src/cli/confirm-interaction.ts |
| `GIT_LOG_LIMIT` | `200` | src/knowledge/intent-evidence.ts |
| `GIT_TIMEOUT_MS` | `15_000` | src/knowledge/intent-evidence.ts |
| `REPO_LOG_LIMIT` | `400` | src/knowledge/intent-evidence.ts |
| `MAX_FILES_PER_MODULE` | `15` | src/knowledge/outline-planner.ts |
| `MAX_CANDIDATE_FILES` | `90` | src/knowledge/outline-planner.ts |
| `MAX_CHAPTERS` | `8` | src/knowledge/outline.ts |
| `MAX_PAGES_PER_CHAPTER` | `6` | src/knowledge/outline.ts |
| `MAX_OUTLINE_PAGES` | `16` | src/knowledge/outline.ts |
| `MIN_PAGE_FILES` | `3` | src/knowledge/outline.ts |
| `MAX_PAGE_FILES` | `12` | src/knowledge/outline.ts |
| `MAX_TITLE_LEN` | `80` | src/knowledge/outline.ts |
| `MAX_SUMMARY_LEN` | `200` | src/knowledge/outline.ts |
| `MAX_BRIEF_LEN` | `2000` | src/knowledge/outline.ts |
| `MAX_SPAN_MODULES` | `3` | src/knowledge/outline.ts |
| `MAX_NAMES` | `40` | src/knowledge/source-fallback.ts |
| `MAX_SIGNATURE_LEN` | `160` | src/knowledge/source-fallback.ts |
| `MAX_TOPICS` | `4` | src/knowledge/topic-discovery.ts |
| `MIN_CLUSTER_MEMBERS` | `5` | src/knowledge/topic-discovery.ts |
| `MIN_TOPIC_FILES` | `3` | src/knowledge/topic-discovery.ts |
| `MAX_TOPIC_FILES` | `12` | src/knowledge/topic-discovery.ts |
| `MAX_TOPIC_OVERLAP` | `0.5` | src/knowledge/topic-discovery.ts |
| `CALLS_MIN_GROUPS` | `6` | src/knowledge/wiki-context-builder.ts |
| `CALLS_EDGE_LIMIT` | `40` | src/knowledge/wiki-context-builder.ts |
| `MODULE_DETAIL_LIMIT` | `12` | src/knowledge/wiki-context-builder.ts |
| `MAX_DEPTH` | `3` | src/knowledge/wiki-context-builder.ts |
| `MAX_NODES` | `25` | src/knowledge/wiki-context-builder.ts |
| `MIN_CONTINUATION_KEEP` | `200` | src/knowledge/wiki-continuation.ts |
| `EVIDENCE_MAX_FILES` | `15` | src/knowledge/wiki-evidence.ts |
| `EVIDENCE_MIN_FILES` | `3` | src/knowledge/wiki-evidence.ts |
| `WIKI_MAX_CONTINUATIONS` | `2` | src/shared/constants.ts |
| `WIKI_MAX_GREP_PROBES` | `12` | src/shared/constants.ts |
| `MAX_DEPTH` | `3` | tests/knowledge/config-detector.test.ts |
| `TIMEOUT_MS` | `60000` | tests/knowledge/config-detector.test.ts |
| `MAX_FILE_SIZE` | `100 * 1024 * 1024` | tests/knowledge/intent-evidence.test.ts |
| `MAX_QPS` | `1000` | tests/knowledge/intent-evidence.test.ts |
| `MAX_RETRY` | `3` | tests/knowledge/source-fallback.test.ts |

## 限制由来（源码注释证据）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 待确认项超过此数时先问一次「逐项 / 全部保持」（防 Marathon 会话） | 常量注释 | BULK_THRESHOLD | src/cli/confirm-interaction.ts:14 |
| 每模块候选文件上限（锚点候选池规模控制） | 常量注释 | MAX_FILES_PER_MODULE | src/knowledge/outline-planner.ts:38 |
| 全局候选文件上限 | 常量注释 | MAX_CANDIDATE_FILES | src/knowledge/outline-planner.ts:40 |
| 与主题页 MIN_TOPIC_FILES 对齐：防章节页天然薄证据 | 常量注释 | MIN_PAGE_FILES | src/knowledge/outline.ts:84 |
| 页跨模块数超过该值视为杂烩页（W2） | 常量注释 | MAX_SPAN_MODULES | src/knowledge/outline.ts:94 |
| 单次回落探测的名字上限（防名单爆炸拖慢全仓扫描） | 常量注释 | MAX_NAMES | src/knowledge/source-fallback.ts:23 |
| signature 截断长度 | 常量注释 | MAX_SIGNATURE_LEN | src/knowledge/source-fallback.ts:25 |
| 立题最低文件数（与证据下限对齐，避免主题页天然薄证据） | 常量注释 | MIN_TOPIC_FILES | src/knowledge/topic-discovery.ts:32 |
| 主题间文件重叠率上限（超过视为同一协作面，后者不立题） | 常量注释 | MAX_TOPIC_OVERLAP | src/knowledge/topic-discovery.ts:35 |
| calls 页目标入口组数：入口组不足时以高扇入热点锚定回填（覆盖稀疏的主力补偿） | 常量注释 | CALLS_MIN_GROUPS | src/knowledge/wiki-context-builder.ts:46 |
| calls 页单次查询边数上限（BFS 每层两次查询各限此数） | 常量注释 | CALLS_EDGE_LIMIT | src/knowledge/wiki-context-builder.ts:48 |
| modules 页详述上限：超过后其余模块聚合为概要（DeepWiki 目录分组分块的防超限映射） | 常量注释 | MODULE_DETAIL_LIMIT | src/knowledge/wiki-context-builder.ts:51 |
| 安全前缀低于该长度时不值得发起续写调用（残骸交由闸门降级更划算） | 常量注释 | MIN_CONTINUATION_KEEP | src/knowledge/wiki-continuation.ts:16 |
| 锚定块内文件数上限 | 常量注释 | EVIDENCE_MAX_FILES | src/knowledge/wiki-evidence.ts:13 |
| structure 层页面证据下限（低于此值闸门告警 thin-evidence） | 常量注释 | EVIDENCE_MIN_FILES | src/knowledge/wiki-evidence.ts:15 |
| LLM 断流（输出达上限/流中途出错）自动续写轮数上限；每轮独立获得完整输出预算 | 常量注释 | WIKI_MAX_CONTINUATIONS | src/shared/constants.ts:6 |
| 正文断言校验：每页 search_code 词法探测上限（超出部分不标注、计入未核验） | 常量注释 | WIKI_MAX_GREP_PROBES | src/shared/constants.ts:9 |

## 高复杂度函数（complexity > 3）

关注圈复杂度高的函数，考虑重构

| 函数 | 源文件 | 复杂度 | 循环深度 |
| --- | --- | --- | --- |
| adaptSide | src/mcp/codebase-memory-client.ts | 4 | 2 |
| adaptTrace | src/mcp/codebase-memory-client.ts | 4 | 2 |
| applyConfirmations | src/knowledge/confirmation.ts | 6 | 1 |
| assembleSections | src/knowledge/wiki-continuation.ts | 6 | 1 |
| buildApi | src/knowledge/wiki-fallback-builder.ts | 6 | 0 |
| buildApiContext | src/knowledge/wiki-context-builder.ts | 5 | 1 |
| buildArchitecture | src/knowledge/wiki-fallback-builder.ts | 6 | 1 |
| buildArchitectureContext | src/knowledge/wiki-context-builder.ts | 6 | 1 |
| buildByName | src/knowledge/wiki-fallback-builder.ts | 22 | 0 |
| buildCallChainFromEdges | src/knowledge/wiki-context-builder.ts | 10 | 2 |
| buildCalls | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildCallsContext | src/knowledge/wiki-context-builder.ts | 14 | 2 |
| buildChapterPage | src/knowledge/wiki-fallback-builder.ts | 4 | 0 |
| buildClasses | src/knowledge/wiki-fallback-builder.ts | 5 | 1 |
| buildCli | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildConstraints | src/knowledge/wiki-fallback-builder.ts | 4 | 0 |
| buildConventions | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildDataFlowContext | src/knowledge/wiki-context-builder.ts | 11 | 2 |
| buildDecisions | src/knowledge/wiki-fallback-builder.ts | 4 | 0 |
| buildDepUsage | src/knowledge/wiki-context-builder.ts | 5 | 0 |
## Related

- 同目录：[conventions.md](conventions.md)
- 总入口：[README](../README.md)
