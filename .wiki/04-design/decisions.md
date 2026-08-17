# 架构决策记录（ADR）

> 编号沿用代码内 `generateAdrEntries`（`src/knowledge/wiki-context-builder.ts`）的决策脉络，并结合仓库计划文档补充背景。状态均为 accepted（以当前代码为准）。

## ADR-001 用 codebase-memory-mcp 知识图谱替代自建索引

- **状态**：accepted（2026-06 重构，commit 9ef4fd6）
- **背景**：原架构自建 tree-sitter AST 解析 + SQLite（FTS5）索引 + 检索问答子系统，跨文件解析弱、维护成本高。
- **决策**：删除整个索引/检索管线（`src/core/database.ts`、`src/core/parser.ts`、`src/core/graph/`、`src/core/retrieval/`、`src/strategy/` 及 `index`/`ask`/`update` 命令），改为子进程调用外部 `codebase-memory-mcp` 获取知识图谱。
- **后果**：数据质量提升（LSP 级跨文件解析、complexity/fan_in 指标）；代价是引入外部二进制硬依赖，用户必须预装。计划文档：`docs/superpowers/plans/2026-06-24-mcp-refactor.md`（本地未入库）。
- **代码锚点**：`src/mcp/codebase-memory-client.ts`；代码内对应 ADR 生成逻辑见 `generateAdrEntries`。

## ADR-002 PageRegistry 插件化页面注册（三层模型）

- **状态**：accepted（commit b83040a，2026-06-25）
- **背景**：页面硬编码在 WikiService 中难以扩展；不同项目类型需要的「对外入口」文档不同（CLI 项目要命令表、后端要路由表）。
- **决策**：页面描述符（name/tier/answer）集中注册于 `PAGE_REGISTRY`；tier 分三层——`structure`（机器可生成的事实层）、`operations`（运行规约层）、`surface`（按 projectType 动态激活的表层）。三个 builder 各自按 page name switch 派发。
- **后果**：新增页面只需 ①注册描述符 ②三个 builder 各加 case ③types.ts 加 Context 接口；代价是描述符与 builder 间存在隐式契约（漏加 case 会静默产出空内容）。
- **代码锚点**：`src/knowledge/page-registry.ts:33-52`（注册表）、`TIER2_BY_TYPE` 映射。

## ADR-003 检测式 ConfigDetector（诚实标注缺失）

- **状态**：accepted（commit 3c64f27，2026-06-25）
- **背景**：operations 层文档需要运行环境/规约/测试/约束信息；不同项目（有/无 eslint、npm/pnpm）差异大，模板化猜测会造假。
- **决策**：`ConfigDetector` 只探测实际存在的配置文件（package.json、lockfile、linter 配置、AGENTS.md 等），无则返回缺失标记而非编造；源码扫描类探测（env 变量、限制常量）跳过注释行。
- **后果**：多语言/多框架项目都能优雅降级；生成的文档会明确写「未检测到 X」。
- **代码锚点**：`src/knowledge/config-detector.ts:47-52`（设计说明注释）。

## ADR-004 LLM 生成 + 纯规则 fallback 双路径

- **状态**：accepted（自项目初期，MCP 重构后保留）
- **背景**：LLM 叙述质量高但可能失败（无 API key、网络错误、思考模型输出异常）；纯规则稳定但表述生硬。
- **决策**：每页先尝试 LLM（`streamText` 流式），`--no-llm`/未配置模型/生成空内容/抛异常时逐页回退规则模板；LLM 输出统一过 `sanitizeWikiOutput` 清理。
- **后果**：任何环境都能产出完整文档；思考模型（Qwen3 等）通过「关闭 thinking + reasoning 字段回退」兼容。
- **代码锚点**：`src/services/wiki-service.ts:generatePage`（降级逻辑）、`src/knowledge/wiki-page-generator.ts:generate`（providerOptions + reasoning 回退）。

## ADR-005 CLI 框架选用 Commander.js

- **状态**：accepted
- **背景/决策/后果**：CLI 工具需要命令注册、参数解析、子命令支持；Commander 成熟稳定，命令以 `register*Command(program)` 函数组织，命令定义与业务逻辑分离。
- **代码锚点**：`src/cli/index.ts:6-16`。

## ADR-006 LLM 集成采用 Vercel AI SDK

- **状态**：accepted
- **背景**：需要 provider 无关、流式友好的 LLM 集成；`--base-url` 一个参数即可切 OpenAI/Ollama。
- **决策**：`ai` + `@ai-sdk/openai`，`createOpenAI({ baseURL, apiKey })` + `streamText`；AI SDK v6 使用 `maxOutputTokens`（非 `maxTokens`）。
- **后果**：流式输出直接对接 CLI stdout；注意点见 [troubleshooting](../05-guides/troubleshooting.md)。
- **代码锚点**：`src/knowledge/wiki-page-generator.ts:16-33`。

## ADR-007 反幻觉四铁律（R1-R4）

- **状态**：accepted
- **决策**：所有 LLM system prompt 前置 `ANTI_HALLUCINATION`：R1 锚点强制（事实声明必须带 file:line）、R2 边表优于时序图、R3 拒绝编造用途、R4 结构化优先；`sanitizeWikiOutput` 对 data-flow 页的 sequenceDiagram 违规打告警。
- **后果**：文档可信度显著提升；本 Wiki 的写法（阶段表、边表、import 佐证）即遵循该铁律。
- **代码锚点**：`src/knowledge/wiki-page-generator.ts:ANTI_HALLUCINATION`、`src/knowledge/wiki-output-sanitizer.ts:11-16`。

## Related

- Code: `src/knowledge/page-registry.ts` · `src/mcp/codebase-memory-client.ts`
- Docs: [page-registry](page-registry.md) · [limitations](../06-constraints/limitations.md) · [architecture](../02-architecture/architecture.md)
