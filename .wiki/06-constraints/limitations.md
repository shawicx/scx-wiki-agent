# 已知限制与边界

## MCP 图谱能力边界（降级适配）

| 限制 | 影响 | 代码中的降级方案 |
| --- | --- | --- |
| 无 `INHERITS` 边，Class 节点无 `parent_class`/`is_abstract` | `classes` 页无法画继承树 | `buildClassesContext` 只做「类清单+方法表」，`hasInheritance` 恒 false（`src/knowledge/wiki-context-builder.ts`） |
| `complexity` 仅在 Method/Function 节点可靠（Class/Interface 恒 0） | 热点查询会拉入噪声 | Cypher 显式 `label IN ['Method','Function']`（`buildConstraintsContext`） |
| Cypher 不支持 `NOT … CONTAINS` 语法 | 无法在图查询层排除测试文件 | JS 层正则兜底 `/\\.(test\\ | spec)\\. | __tests__/`（`buildCallChainFromEdges`） |
| `trace_path` 对 Method 返回空、无 file/line | 时序数据不可靠 | 全部改用 Cypher 直查 CALLS 边 + BFS（`buildCallsContext`、`buildCallChainFromEdges`） |
| MCP info 日志可能泄漏进 stdout | JSON 解析失败 | `parseJsonOutput` 从末尾向前找最后一个完整 JSON |
| MCP 无持久化 ADR 存储 | `decisions` 页无真实 ADR 数据 | `generateAdrEntries` 从图谱模式+技术选型自动生成，`fromMcp: false` |

## 硬性数值上限（防失控）

| 常量 | 值 | 位置 |
| --- | --- | --- |
| MCP 子进程超时 | 120 000 ms | `CodebaseMemoryClient.exec` |
| stdout maxBuffer | 100 MB | 同上 |
| queryGraph maxRows | 100（默认） | `queryGraph(cypher, maxRows)` |
| 调用链 BFS 深度/节点数 | 3 / 25 | `buildCallChainFromEdges` |
| calls 页 BFS 深度 / LIMIT | 2 / 30 | `buildCallsContext` |
| 单页 LLM maxOutputTokens | 8 000 | `WikiPageGenerator.generate` |
| 高复杂度阈值 | complexity > 3 | `buildConstraintsContext` |

## 功能性未完成项

1. __surface 层仅 `cli` 完整实现__ — `TIER2_BY_TYPE` 为 backend/frontend/library/monorepo 映射的页面（routes/db-schema/components/state/routing/public-api/workspaces/package-boundaries）__没有对应的 context/fallback 实现__；对这类项目 build 会激活页名但产出__空文件__（见 [troubleshooting#3](../05-guides/troubleshooting.md)）。
2. __LLM 路径仅覆盖 10 页__ — `WikiPageGenerator.generateByName` 未实现 calls/classes/readme/environment/testing/conventions/constraints/cli/tech-stack/decisions 的 case；这些页即使配置了 LLM 也走规则模板（default 返回空 → 降级 fallback）。
3. __遗留死代码__ — `src/core/types.ts` 的 Document/Chunk/Symbol/Relation/ProjectNode 等接口、`src/shared/utils.ts` 的 `computeHash`/`generateId`、`src/cli/utils.ts` 的 `findProjectRoot`、`CodebaseMemoryClient.tracePath`/`searchGraph`/`detectChanges`、`buildBusinessContext`/`buildDesignDecisionsContext`——均为旧索引管线残留，当前无生产调用方（测试仍引用部分）。
4. __`scan -v/--verbose` 未使用__ — 选项已注册但 action 未读取（`src/cli/commands/scan.ts`）。
5. __business/design-decisions 半遗留__ — 三个 builder 仍有 case 与 Context 接口，但不在 `PAGE_REGISTRY`；`--pages business` 会因页名校验被跳过（不在 ALL_PAGE_NAMES），只有代码内可编程调用。

## 文档一致性债

| 项 | 现状 | 权威来源 |
| --- | --- | --- |
| 仓库 README.md | 描述已删除的 index/ask/update 命令、SQLite 架构、strategy/ 目录、10 页清单 | 本 Wiki + 源码 |
| AGENTS.md / CLAUDE.md | 架构描述含已删除的 `strategy/` 层与 `core/database.ts`；测试文件示例指向不存在的 `tests/core/symbol-extractor.test.ts` | 同上 |
| License | README 写 MIT，package.json 为 ISC | package.json（ISC） |
| 版本号 | package.json 0.0.1 vs CLI `program.version('0.1.0')` | 未统一（待确认目标值） |

## 产品边界

- __单仓单项目假设__ — scanner 以单一 package.json 为中心；monorepo 仅识别类型，不遍历 workspace（无 pnpm-workspace 特殊处理）。
- __语言覆盖__ — 代码分析完全委托 MCP；本仓库自身的扫描白名单为 ts/tsx/js/jsx/mjs/cjs/md/json/yaml/toml/env（`SUPPORTED_EXTENSIONS`）。
- **Wiki 输出目录会被工具覆盖** — `scx-wiki-agent build` 写扁平文件到 `.wiki/`，会覆盖本 Wiki 的同名文件（如 `README.md`）。

## Related

- Code: `src/knowledge/wiki-context-builder.ts` · `src/knowledge/page-registry.ts`
- Docs: [decisions](../04-design/decisions.md) · [troubleshooting](../05-guides/troubleshooting.md) · [page-registry](../04-design/page-registry.md)
