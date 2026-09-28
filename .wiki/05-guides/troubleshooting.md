# Troubleshooting

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/config-detector.ts
- src/knowledge/intent-evidence.ts
- src/knowledge/outline-planner.ts
- src/knowledge/outline.ts
- src/knowledge/source-fallback.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/types.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-continuation.ts
- src/knowledge/wiki-evidence.ts
</details>

> ⚠️ **待确认**：本页为规则模板生成，仅基于项目类型/技术栈/运行态探测，未采集项目真实错误日志与告警，具体条目（证据不足，禁止猜测；请人工补充后移除本标记）

## 运行环境速查

| 项 | 值 |
| --- | --- |
| 包管理器 | pnpm |
| 脚本 build | `tsup` |
| 脚本 dev | `tsup --watch` |
| 脚本 test | `vitest run` |
| 脚本 test:watch | `vitest` |
| 脚本 lint | `tsc --noEmit` |

## 排障起点（入口文件）

- `src/cli/index.ts`

## Build Issues

If the build fails, check that all dependencies are installed.

## Runtime Issues

Common runtime issues and their solutions.

## 限制常量（超界即故障的边界）

| 常量 | 值 | 源文件 |
| --- | --- | --- |
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

## 风险信号（源码标记 + 变更热点）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| XXX: 引用（跳过注释行） | 风险标记 | src/knowledge/config-detector.ts | src/knowledge/config-detector.ts:303 |
| TODO: /FIXME/HACK/WHY | 风险标记 | src/knowledge/intent-evidence.ts | src/knowledge/intent-evidence.ts:7 |
| TODO: /FIXME/HACK/... 标记（≤5 条/文件） | 风险标记 | src/knowledge/intent-evidence.ts | src/knowledge/intent-evidence.ts:321 |
| TODO: /FIXME 真实风险信号）+ git 高频变更 | 风险标记 | src/knowledge/types.ts | src/knowledge/types.ts:367 |
| TODO: /FIXME 是真实风险信号）+ git 高频变更热点 | 风险标记 | src/knowledge/wiki-context-builder.ts | src/knowledge/wiki-context-builder.ts:910 |
| TODO: /FIXME 风险标记 + git 高频变更热点（作者自认的真实风险） | 风险标记 | src/knowledge/wiki-fallback-builder.ts | src/knowledge/wiki-fallback-builder.ts:424 |
| 高频变更：22 次提交，最近「feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音」 | 变更热点 | src/services/wiki-service.ts | commit:c7f1817d (2026-09-28) |
| 高频变更：20 次提交，最近「feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音」 | 变更热点 | src/knowledge/wiki-context-builder.ts | commit:c7f1817d (2026-09-28) |
| 高频变更：19 次提交，最近「feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音」 | 变更热点 | src/knowledge/types.ts | commit:c7f1817d (2026-09-28) |
| 高频变更：18 次提交，最近「feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音」 | 变更热点 | src/knowledge/wiki-page-generator.ts | commit:c7f1817d (2026-09-28) |
| 高频变更：17 次提交，最近「feat: calls 页组内去重与热点回填、依赖 import 证据降噪待确认，.wiki 改为工具独占整目录重建」 | 变更热点 | src/knowledge/wiki-fallback-builder.ts | commit:b06d40e4 (2026-09-27) |

## 环境变量

从源码 process.env 引用提取

| 变量名 | 敏感 | 用途 |
| --- | --- | --- |
| CODEBASE_MEMORY_MCP_BINARY | 否 | ⚠️ 待确认 |
| API_KEY | ⚠️ 是 | ⚠️ 待确认 |
| BASE_URL | 否 | ⚠️ 待确认 |
| TEST_WIKI_KEY | ⚠️ 是 | ⚠️ 待确认 |

## Technology-Specific Issues

Key technologies: @ai-sdk/openai, ai, commander, ignore, yaml, tsup, vitest

Refer to the official documentation for each technology for specific troubleshooting guides.
## Related

- 同目录：[onboarding.md](onboarding.md) · [testing.md](testing.md)
- 总入口：[README](../README.md)
