# 代码规约

> 部分规约来自仓库既有代码风格的事实归纳（无 eslint 强制）；执行命令以 [environment](../01-overview/environment.md) 的 scripts 为准。

## 事实性约束（编译器/运行时强制）

| 规约 | 依据 |
| --- | --- |
| ESM-only：相对导入**必须**带 `.js` 后缀 | `package.json` `"type": "module"` + `tsconfig.json` `module: ES2022` |
| strict 类型检查 | `tsconfig.json` `"strict": true` |
| 目标 ES2022 / node18 | `tsconfig.json` / `tsup.config.ts` |
| 构建单入口 `src/bin.ts`，勿新增独立入口 | `tsup.config.ts` entry |

## 命名风格（观察自现有代码）

- 类：PascalCase（`FileScanner`、`WikiService`、`CodebaseMemoryClient`）。
- 函数/方法：camelCase；CLI 命令注册器统一 `register*Command`（MCP entry_points 过滤依赖此命名，见 `buildCliContext`）。
- 文件：kebab-case（`wiki-context-builder.ts`）；每命令一个文件。
- 常量：SCREAMING_SNAKE（`PAGE_REGISTRY`、`IGNORED_DIRS`、`DEFAULT_BINARY`）。
- 目录：小写单层（cli/services/knowledge/mcp/core/shared）。

## 注释与文档风格

- 关键类/方法用中文 JSDoc（`/** … */`），说明设计动机与约束（如 `CodebaseMemoryClient`、`WikiContextBuilder.buildCallChainFromEdges`）。
- 复杂降级逻辑必须注释「为什么」（例：`parseJsonOutput` 解释 info 日志泄漏；`generate` 解释思考模型 reasoning 回退）。
- LLM prompt 一律中文；Wiki 产出一律中文（产品约定）。

## 修改代码前的必读约定（来自 AGENTS.md，仍然有效的部分）

- 改代码前先读 `.wiki/` 了解项目现状（本目录即为此存在）。
- 新增框架解析器/页面的扩展方式见 [page-registry](../04-design/page-registry.md)（注意：AGENTS.md 中「Adding a New Framework Resolver」一节描述的 `strategy/` 体系已随 MCP 重构删除，不再适用）。
- 测试用 vitest，真实临时目录 + fixture；单测不依赖外部二进制（mock），仅集成测试依赖。

## Lint 现状

- `pnpm lint` = `tsc --noEmit`（仅类型）。
- **无 eslint/biome 配置**（`ConfigDetector.detectConventions` 探测结果如实为无）；格式依赖编辑器与自觉。
- 无 `.editorconfig`（探测确认）。

## AI 协作特别约定

- 生成的文档内容遵守 R1-R4 铁律（锚点强制/边表优先/拒绝编造/结构化）——本 Wiki 的写法即范本。
- 禁止把 `tests/` 下的 fixture 当作项目功能描述（ANTI_HALLUCINATION 第 3 条）。

## Related

- Code: `tsconfig.json` · `AGENTS.md`（部分过时）
- Docs: [environment](../01-overview/environment.md) · [limitations](limitations.md) · [decisions](../04-design/decisions.md)
