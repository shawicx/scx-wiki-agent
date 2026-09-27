# Constraints

<details>
<summary>Relevant source files</summary>

- src/knowledge/outline-planner.ts
- src/knowledge/outline.ts
- src/knowledge/source-fallback.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-continuation.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/mcp/codebase-memory-client.ts
- src/shared/constants.ts
- tests/knowledge/config-detector.test.ts
- tests/knowledge/source-fallback.test.ts
</details>

项目边界与代价：性能预算、复杂度上限、已知限制。

## 限制常量（源码提取）

| 常量 | 值 | 源文件 |
| --- | --- | --- |
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
| `CALLS_MIN_GROUPS` | `3` | src/knowledge/wiki-context-builder.ts |
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
| `MAX_RETRY` | `3` | tests/knowledge/source-fallback.test.ts |

## 高复杂度函数（complexity > 3）

关注圈复杂度高的函数，考虑重构

| 函数 | 源文件 | 复杂度 | 循环深度 |
| --- | --- | --- | --- |
| adaptSide | src/mcp/codebase-memory-client.ts | 4 | 2 |
| adaptTrace | src/mcp/codebase-memory-client.ts | 4 | 2 |
| assembleSections | src/knowledge/wiki-continuation.ts | 6 | 1 |
| buildApi | src/knowledge/wiki-fallback-builder.ts | 6 | 0 |
| buildApiContext | src/knowledge/wiki-context-builder.ts | 5 | 1 |
| buildArchitecture | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildArchitectureContext | src/knowledge/wiki-context-builder.ts | 5 | 1 |
| buildByName | src/knowledge/wiki-fallback-builder.ts | 21 | 0 |
| buildCallChainFromEdges | src/knowledge/wiki-context-builder.ts | 10 | 2 |
| buildCalls | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildCallsContext | src/knowledge/wiki-context-builder.ts | 13 | 2 |
| buildClasses | src/knowledge/wiki-fallback-builder.ts | 5 | 1 |
| buildCli | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildConventions | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildDataFlowContext | src/knowledge/wiki-context-builder.ts | 5 | 2 |
| buildGlossarySections | src/knowledge/wiki-page-generator.ts | 6 | 1 |
| buildInputs | src/knowledge/outline-planner.ts | 5 | 1 |
| buildModules | src/knowledge/wiki-fallback-builder.ts | 6 | 1 |
| buildModulesContext | src/knowledge/wiki-context-builder.ts | 4 | 1 |
| buildOnboarding | src/knowledge/wiki-fallback-builder.ts | 9 | 0 |
## Related

- 同目录：[conventions.md](conventions.md)
- 总入口：[README](../README.md)
