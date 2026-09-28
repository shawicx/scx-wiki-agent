# Design Decisions & Evolution

<details>
<summary>Relevant source files</summary>

- README.md
- src/cli/commands/build.ts
- src/core/scanner.ts
- src/knowledge/config-detector.ts
- src/knowledge/page-registry.ts
- src/knowledge/types.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-page-generator.ts
- src/services/wiki-service.ts
- src/shared/constants.ts
</details>

基于 git 提交历史与仓库设计文档确定性提取，每条决策带证据锚点（commit 哈希+日期 / 文档路径），可回溯验证。

## 演进时间线（按模块）

首次提交主题是模块「诞生动机」的最直接证据。

| 模块 | 提交数 | 首次提交 | 最近提交 | 高频主题 |
| --- | --- | --- | --- | --- |
| knowledge | 111 | `76565d14`（2026-06-02）feat: 功能基本可用 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 | 修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×9）、图谱漏采符号源码回落、tauri ipc 接口面、readme/docs 消费与存量手写文档索引（×8）、引入证据锚定、薄证据补强与图表闸门等 wiki 质量机制并清理旧管线死代码（×8） |
| services | 22 | `76565d14`（2026-06-02）feat: 功能基本可用 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 | - |
| cli | 15 | `76565d14`（2026-06-02）feat: 功能基本可用 | `b06d40e4`（2026-09-27）feat: calls 页组内去重与热点回填、依赖 import 证据降噪待确认，.wiki 改为工具独占整目录重建 | 功能基本可用（×4）、修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）、支持全局配置（×2） |
| shared | 10 | `76565d14`（2026-06-02）feat: 功能基本可用 | `4958be04`（2026-09-27）feat: 支持全局配置 | 修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）、功能基本可用（×2） |
| mcp | 6 | `9ef4fd6f`（2026-06-24）refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki | `a430c66b`（2026-09-23）feat: 新增正文断言校验与 search_code 词法通道 | 引入证据锚定、薄证据补强与图表闸门等 wiki 质量机制并清理旧管线死代码（×2）、重构为基于 codebase-memory-mcp 知识图谱生成 wiki（×2） |
| core | 6 | `76565d14`（2026-06-02）feat: 功能基本可用 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 | - |

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
| src/services/wiki-service.ts | 22 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 |
| src/knowledge/wiki-context-builder.ts | 20 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 |
| src/knowledge/types.ts | 19 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 |
| src/knowledge/wiki-page-generator.ts | 18 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 |
| src/knowledge/wiki-fallback-builder.ts | 17 | `b06d40e4`（2026-09-27）feat: calls 页组内去重与热点回填、依赖 import 证据降噪待确认，.wiki 改为工具独占整目录重建 |
| src/knowledge/page-registry.ts | 8 | `a0003124`（2026-09-26）fix: 修复 Vue/Tauri/bun 场景下的探测误报与图谱虚构边，补齐 LLM 页面生成路径 |
| src/cli/commands/build.ts | 8 | `b06d40e4`（2026-09-27）feat: calls 页组内去重与热点回填、依赖 import 证据降噪待确认，.wiki 改为工具独占整目录重建 |
| src/core/scanner.ts | 6 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 |
| src/shared/constants.ts | 5 | `a0003124`（2026-09-26）fix: 修复 Vue/Tauri/bun 场景下的探测误报与图谱虚构边，补齐 LLM 页面生成路径 |
| src/knowledge/config-detector.ts | 4 | `c7f1817d`（2026-09-28）feat: 调用图高出边锚点回填扩覆盖，主题改模块复合命名，断言白名单与使用证据分级消除待确认噪音 |
## Related

- 总入口：[README](../README.md)
