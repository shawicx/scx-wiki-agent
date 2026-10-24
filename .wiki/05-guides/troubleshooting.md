# 故障排查

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
- src/knowledge/config-detector/index.ts
- src/knowledge/confirmation/index.ts
- src/knowledge/context/cli.ts
- src/knowledge/context/index.ts
- src/knowledge/crosspage/index.ts
- src/knowledge/dataflow/index.ts
- src/knowledge/fallback/index.ts
- src/knowledge/generator/index.ts
- src/knowledge/intent/index.ts
- src/knowledge/quality/index.ts
- src/knowledge/types/index.ts
- src/services/wiki/index.ts
- scripts/check-file-lines.mjs
- src/cli/confirm-interaction.ts
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
| 脚本 lint | `tsc --noEmit && node scripts/check-file-lines.mjs` |

## 排障起点（入口文件）

- `src/cli/index.ts`
- `src/knowledge/config-detector/index.ts`
- `src/knowledge/confirmation/index.ts`
- `src/knowledge/context/cli.ts`
- `src/knowledge/context/index.ts`
- `src/knowledge/crosspage/index.ts`
- `src/knowledge/dataflow/index.ts`
- `src/knowledge/fallback/index.ts`
- `src/knowledge/generator/index.ts`
- `src/knowledge/intent/index.ts`
- `src/knowledge/quality/index.ts`
- `src/knowledge/types/index.ts`
- `src/services/wiki/index.ts`

## 构建问题

构建失败时，优先确认依赖已完整安装（见快速上手页），再检查构建脚本的退出输出。

## 运行时问题

运行时故障先核对运行环境速查中的命令与版本，再对照下方限制常量排查越界场景。

## 限制常量（超界即故障的边界）

| 常量 | 值 | 源文件:行号 |
| --- | --- | --- |
| `LIMIT` | `360` | scripts/check-file-lines.mjs:9 |
| `BULK_THRESHOLD` | `15` | src/cli/confirm-interaction.ts:14 |
| `MODULE_SYMBOL_CANDIDATE_LIMIT` | `60` | src/knowledge/context/architecture.ts:15 |
| `ARCHITECTURE_SYMBOL_LIMIT` | `6` | src/knowledge/context/architecture.ts:17 |
| `MODULES_SYMBOL_LIMIT` | `10` | src/knowledge/context/architecture.ts:19 |
| `MODULES_SYMBOLS_PER_FILE_LIMIT` | `5` | src/knowledge/context/architecture.ts:21 |
| `MODULES_REPRESENTATIVE_FILE_LIMIT` | `12` | src/knowledge/context/architecture.ts:22 |
| `CALLS_MIN_GROUPS` | `6` | src/knowledge/context/calls.ts:15 |
| `CALLS_EDGE_LIMIT` | `40` | src/knowledge/context/calls.ts:17 |
| `DATA_FLOW_FILE_LIMIT` | `30` | src/knowledge/context/data-flow.ts:23 |
| `DATA_FLOW_SYMBOL_LIMIT` | `200` | src/knowledge/context/data-flow.ts:25 |
| `DATA_FLOW_TYPE_LIMIT` | `60` | src/knowledge/context/data-flow.ts:27 |
| `MAX_DEPTH` | `3` | src/knowledge/context/data-flow.ts:179 |
| `MAX_NODES` | `25` | src/knowledge/context/data-flow.ts:180 |
| `MODULE_DETAIL_LIMIT` | `12` | src/knowledge/context/modules-api.ts:25 |
| `DATA_FLOW_MAX_STAGES` | `24` | src/knowledge/dataflow/index.ts:60 |
| `DATA_FLOW_MAX_TRANSITIONS` | `40` | src/knowledge/dataflow/index.ts:62 |
| `DATA_FLOW_MAX_IO_EVENTS` | `30` | src/knowledge/dataflow/index.ts:64 |
| `DATA_FLOW_MAX_EXPRESSION` | `120` | src/knowledge/dataflow/shapes.ts:9 |
| `DATA_FLOW_MAX_TYPE_DEFS` | `20` | src/knowledge/dataflow/type-defs.ts:11 |
| `DATA_FLOW_MAX_TYPE_TEXT` | `1200` | src/knowledge/dataflow/type-defs.ts:13 |
| `GIT_LOG_LIMIT` | `200` | src/knowledge/intent/shared.ts:67 |
| `GIT_TIMEOUT_MS` | `15_000` | src/knowledge/intent/shared.ts:68 |
| `REPO_LOG_LIMIT` | `400` | src/knowledge/intent/shared.ts:74 |
| `CHURN_LOG_LIMIT` | `2000` | src/knowledge/intent/shared.ts:76 |
| `MAX_REFS` | `3` | src/knowledge/negative-claim.ts:33 |
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
| `MAX_NAMES` | `40` | src/knowledge/source-fallback.ts:24 |
| `MAX_SIGNATURE_LEN` | `160` | src/knowledge/source-fallback.ts:26 |
| `MAX_TOPICS` | `4` | src/knowledge/topic-discovery.ts:31 |
| `MIN_CLUSTER_MEMBERS` | `5` | src/knowledge/topic-discovery.ts:32 |
| `MIN_TOPIC_FILES` | `3` | src/knowledge/topic-discovery.ts:34 |
| `MAX_TOPIC_FILES` | `12` | src/knowledge/topic-discovery.ts:35 |
| `MAX_TOPIC_OVERLAP` | `0.5` | src/knowledge/topic-discovery.ts:37 |
| `MIN_CONTINUATION_KEEP` | `200` | src/knowledge/wiki-continuation.ts:16 |
| `EVIDENCE_MAX_FILES` | `15` | src/knowledge/wiki-evidence.ts:14 |
| `EVIDENCE_MIN_FILES` | `3` | src/knowledge/wiki-evidence.ts:16 |
| `WIKI_MAX_CONTINUATIONS` | `2` | src/shared/constants.ts:6 |
| `WIKI_MAX_GREP_PROBES` | `12` | src/shared/constants.ts:9 |

## 风险信号（源码标记 + 变更热点）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| XXX: 引用（跳过注释行） | 风险标记 | src/knowledge/config-detector/detector.ts | src/knowledge/config-detector/detector.ts:228 |
| TODO: /FIXME 是真实风险信号）+ git 高频变更热点 | 风险标记 | src/knowledge/context/misc-pages.ts | src/knowledge/context/misc-pages.ts:142 |
| TODO: /FIXME 风险标记 + git 高频变更热点（作者自认的真实风险） | 风险标记 | src/knowledge/fallback/surface.ts | src/knowledge/fallback/surface.ts:243 |
| TODO: /FIXME/HACK/... 标记（≤5 条/文件） | 风险标记 | src/knowledge/intent/comments.ts | src/knowledge/intent/comments.ts:81 |
| TODO: /FIXME 真实风险信号）+ git 高频变更 | 风险标记 | src/knowledge/types/pages-meta.ts | src/knowledge/types/pages-meta.ts:52 |
| 高频变更：12 次提交，最近「refactor: 页面分发改注册表映射并CI校验一致性，新增薄证据预检与主题语义门槛」 | 变更热点 | src/knowledge/page-registry.ts | commit:7d3c3094 (2026-10-11) |
| 高频变更：11 次提交，最近「feat: 新增Swift项目实验性支持」 | 变更热点 | src/core/scanner.ts | commit:5844f269 (2026-10-24) |
| 高频变更：10 次提交，最近「feat: 新增 build.ignored_dirs 配置项支持自定义忽略文件夹」 | 变更热点 | src/cli/commands/build.ts | commit:75981d16 (2026-10-11) |
| 高频变更：9 次提交，最近「refactor: 页面分发改注册表映射并CI校验一致性，新增薄证据预检与主题语义门槛」 | 变更热点 | src/mcp/codebase-memory-client.ts | commit:7d3c3094 (2026-10-11) |
| 高频变更：9 次提交，最近「fix: 修复幽灵链接与图谱路径限定名污染问题」 | 变更热点 | src/services/wiki/service.ts | commit:5326efec (2026-10-12) |

## 环境变量

从生产源码 process.env 引用提取

| 变量名 | 敏感 | 用途 | 生产引用 |
| --- | --- | --- | --- |
| CODEBASE_MEMORY_MCP_BINARY | 否 | 见生产引用 | src/mcp/codebase-memory-client.ts |

## 技术栈相关问题

关键技术：@ai-sdk/openai、@clack/prompts、@vue/compiler-sfc、ai、commander、ignore、yaml、tsup、vitest。各技术的具体排障指南以其官方文档为准。

## 本页确定知道的事实

- 排障入口文件 13 个、速查表项 6 条
- 限制常量 49 个（超界即故障边界）
- 生产环境变量 1 个（敏感 0 个）
- 风险信号证据 10 条（TODO/FIXME 标记与高频变更文件，均带锚点）

## 未知项

- 未采集项目真实错误日志与告警（无数据源）
## Related

- 同目录：[onboarding.md](onboarding.md) · [testing.md](testing.md)
- 共享 3 个源文件、共享 70 个符号：[constraints.md](../06-constraints/constraints.md)
- 共享 13 个源文件、共享 13 个符号：[overview.md](../01-overview/overview.md)
- 共享 3 个源文件、共享 3 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
