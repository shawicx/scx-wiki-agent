# Constraints

<details>
<summary>Relevant source files</summary>

- src/knowledge/page-registry.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
- src/mcp/codebase-memory-client.ts
- src/services/wiki-service.ts
- tests/knowledge/config-detector.test.ts
</details>

项目边界与代价：性能预算、复杂度上限、已知限制。

## 限制常量（源码提取）

| 常量 | 值 | 源文件 |
| --- | --- | --- |
| `MAX_TOPICS` | `4` | src/knowledge/topic-discovery.ts |
| `MIN_CLUSTER_MEMBERS` | `5` | src/knowledge/topic-discovery.ts |
| `MIN_TOPIC_FILES` | `3` | src/knowledge/topic-discovery.ts |
| `MAX_TOPIC_FILES` | `12` | src/knowledge/topic-discovery.ts |
| `MODULE_DETAIL_LIMIT` | `12` | src/knowledge/wiki-context-builder.ts |
| `MAX_DEPTH` | `3` | src/knowledge/wiki-context-builder.ts |
| `MAX_NODES` | `25` | src/knowledge/wiki-context-builder.ts |
| `EVIDENCE_MAX_FILES` | `15` | src/knowledge/wiki-evidence.ts |
| `EVIDENCE_MIN_FILES` | `3` | src/knowledge/wiki-evidence.ts |
| `MAX_DEPTH` | `3` | tests/knowledge/config-detector.test.ts |
| `TIMEOUT_MS` | `60000` | tests/knowledge/config-detector.test.ts |

## 高复杂度函数（complexity > 3）

关注圈复杂度高的函数，考虑重构

| 函数 | 源文件 | 复杂度 | 循环深度 |
| --- | --- | --- | --- |
| adaptSide | src/mcp/codebase-memory-client.ts | 4 | 2 |
| adaptTrace | src/mcp/codebase-memory-client.ts | 4 | 2 |
| buildArchitecture | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildArchitectureContext | src/knowledge/wiki-context-builder.ts | 5 | 1 |
| buildByName | src/knowledge/wiki-fallback-builder.ts | 21 | 0 |
| buildCallChainFromEdges | src/knowledge/wiki-context-builder.ts | 8 | 2 |
| buildCallsContext | src/knowledge/wiki-context-builder.ts | 10 | 3 |
| buildClasses | src/knowledge/wiki-fallback-builder.ts | 5 | 1 |
| buildCli | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildConventions | src/knowledge/wiki-fallback-builder.ts | 4 | 1 |
| buildDataFlowContext | src/knowledge/wiki-context-builder.ts | 4 | 2 |
| buildModules | src/knowledge/wiki-fallback-builder.ts | 6 | 1 |
| buildModulesContext | src/knowledge/wiki-context-builder.ts | 4 | 1 |
| buildOnboarding | src/knowledge/wiki-fallback-builder.ts | 9 | 0 |
| buildOverview | src/knowledge/wiki-fallback-builder.ts | 5 | 0 |
| buildReadme | src/knowledge/wiki-fallback-builder.ts | 5 | 1 |
| buildReadmeContext | src/knowledge/wiki-context-builder.ts | 5 | 1 |
| buildRelatedSection | src/knowledge/page-registry.ts | 5 | 0 |
| buildTopicContext | src/knowledge/wiki-context-builder.ts | 4 | 2 |
| buildWiki | src/services/wiki-service.ts | 5 | 1 |
## Related

- 同目录：[conventions.md](conventions.md)
- 总入口：[README](../README.md)
