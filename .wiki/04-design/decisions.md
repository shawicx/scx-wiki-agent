# 设计决策与演进

<details>
<summary>Relevant source files</summary>

- README.md
- src/cli/commands/build.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/outline-planner.ts
- src/knowledge/page-registry.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-continuation.ts
- src/knowledge/wiki-output-sanitizer.ts
- src/mcp/codebase-memory-client.ts
- src/shared/utils.ts
</details>

基于 git 提交历史与仓库设计文档确定性提取，每条决策带证据锚点（commit 哈希+日期 / 文档路径），可回溯验证。

## 演进时间线（按模块）

首次提交主题是模块「诞生动机」的最直接证据。

| 模块 | 提交数 | 首次提交 | 最近提交 | 高频主题 |
| --- | --- | --- | --- | --- |
| knowledge | 47 | `76565d14`（2026-06-02）feat: 功能基本可用 | `2c369d53`（2026-10-01）fix: 待确认收集改为 marker 准入并豁免证据引用，消除 --confirm 伪待办 | 将超标源文件拆分至 ≤360 行并新增行数防回潮检查（×8）、修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×4）、分离生产与测试证据提升wiki准确性（×3） |
| cli | 17 | `76565d14`（2026-06-02）feat: 功能基本可用 | `19eb6f9f`（2026-09-29）feat: 新增待确认项交互裁决与确认结果持久化 | 功能基本可用（×4）、修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）、支持全局配置（×2） |
| core | 7 | `76565d14`（2026-06-02）feat: 功能基本可用 | `284f1e41`（2026-09-30）feat: 分离生产与测试证据提升Wiki准确性 | - |
| shared | 6 | `76565d14`（2026-06-02）feat: 功能基本可用 | `19eb6f9f`（2026-09-29）feat: 新增待确认项交互裁决与确认结果持久化 | - |
| mcp | 6 | `9ef4fd6f`（2026-06-24）refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki | `e1a30092`（2026-10-01）feat: 升级断言校验为证据分类核验（点链匹配/注释提及识别/同名歧义统计）并试点 topic 页证据引用 | - |

## 文档记录的决策

仓库 README / docs 的设计文档小节摘录（锚点 = 文档路径#标题）。

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| scx-wiki-agent：基于 codebase-memory-mcp 知识图谱的项目 Wiki 生成 CLI。读取图谱中的符号、调用关系与复杂度数据，为任意代码项目生成结构化中文 Markdown 文档；以图谱的精确结构数据为唯一事实来源，LLM 只负责叙述，反幻觉铁律 + 写盘前质量闸门双重兜底。 | 文档小节 | README.md | README.md#scx-wiki-agent |
| 功能特性：- **知识图谱数据源** — 通过子进程调用 `codebase-memory-mcp` 获取 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边 - **意图证据层（Intent Evidence）** — 图谱只回答「是什么」，动机类叙述的证据由确定性提取器补充：源码注释（文件头/符号注释/TODO 标记/常量注释）、git | 文档小节 | README.md | README.md#功能特性 |
| 前置依赖：- Node.js ≥ 18，pnpm - **codebase-memory-mcp 必须预装**（build 命令数据源）。查找顺序：`CODEBASE_MEMORY_MCP_BINARY` 环境变量 → PATH 中的 `codebase-memory-mcp` - LLM API 可选（OpenAI 兼容接口，含 Ollama）；不配置则全部页面走纯规则路径 | 文档小节 | README.md | README.md#前置依赖 |

## 高频变更热点（维护风险）

提交次数最多的文件，变更越频繁维护风险越高。

| 文件 | 提交数 | 最近提交 |
| --- | --- | --- |
| src/knowledge/page-registry.ts | 10 | `60f3618b`（2026-10-01）feat: 新增跨页审校 pass 实现重复检测、职责越界与术语依赖一致性校验并增强 Related 跨目录链接 |
| src/cli/commands/build.ts | 9 | `19eb6f9f`（2026-09-29）feat: 新增待确认项交互裁决与确认结果持久化 |
| src/core/scanner.ts | 7 | `284f1e41`（2026-09-30）feat: 分离生产与测试证据提升Wiki准确性 |
| src/mcp/codebase-memory-client.ts | 6 | `e1a30092`（2026-10-01）feat: 升级断言校验为证据分类核验（点链匹配/注释提及识别/同名歧义统计）并试点 topic 页证据引用 |
| src/knowledge/claim-verifier.ts | 5 | `2c369d53`（2026-10-01）fix: 待确认收集改为 marker 准入并豁免证据引用，消除 --confirm 伪待办 |
| src/knowledge/topic-discovery.ts | 5 | `284f1e41`（2026-09-30）feat: 分离生产与测试证据提升Wiki准确性 |
| src/shared/utils.ts | 4 | `a0003124`（2026-09-26）fix: 修复 Vue/Tauri/bun 场景下的探测误报与图谱虚构边，补齐 LLM 页面生成路径 |
| src/knowledge/wiki-output-sanitizer.ts | 3 | `24e6660d`（2026-09-21）feat: 引入证据锚定、薄证据补强与图表闸门等 wiki 质量机制并清理旧管线死代码 |
| src/knowledge/wiki-continuation.ts | 3 | `b98ffb05`（2026-09-30）feat: 截断页尾部愈合并新增 incomplete-page 闸门规则，残页降级规则路径重建 |
| src/knowledge/outline-planner.ts | 3 | `284f1e41`（2026-09-30）feat: 分离生产与测试证据提升Wiki准确性 |

## 本页确定知道的事实

- 模块时间线 5 条（每条含首次/最近提交锚点）
- 文档决策证据 3 条、依赖引入提交 0 条
- 高频变更文件 10 个

## 未知项

- 依赖引入无提交佐证
## Related

- 共享 4 个源文件：[calls.md](../07-reference/calls.md)
- 共享 4 个源文件：[glossary.md](../07-reference/glossary.md)
- 共享 1 个源文件、共享 2 个符号：[overview.md](../01-overview/overview.md)
- 总入口：[README](../README.md)
