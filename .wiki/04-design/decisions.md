# 设计决策与演进

<details>
<summary>Relevant source files</summary>

- README.md
- src/cli/commands/build.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/config-detector/detector.ts
- src/knowledge/dataflow/shapes.ts
- src/knowledge/page-registry.ts
- src/knowledge/topic-discovery.ts
- src/mcp/codebase-memory-client.ts
- src/services/wiki/service.ts
- src/shared/utils.ts
</details>

基于 git 提交历史与仓库设计文档确定性提取，每条决策带证据锚点（commit 哈希+日期 / 文档路径），可回溯验证。

## 演进时间线（按模块）

首次提交主题是模块「诞生动机」的最直接证据。

| 模块 | 提交数 | 首次提交 | 最近提交 | 高频主题 |
| --- | --- | --- | --- | --- |
| knowledge | 75 | `76565d14`（2026-06-02）feat: 功能基本可用 | `5844f269`（2026-10-24）feat: 新增Swift项目实验性支持 | 将超标源文件拆分至 ≤360 行并新增行数防回潮检查（×9）、新增确定性证据通道架构（×8）、实现 tier-2 动态 surface 页面并新增 library 项目类型探测（×5） |
| cli | 19 | `76565d14`（2026-06-02）feat: 功能基本可用 | `75981d16`（2026-10-11）feat: 新增 build.ignored_dirs 配置项支持自定义忽略文件夹 | 功能基本可用（×4）、修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）、支持全局配置（×2） |
| core | 11 | `76565d14`（2026-06-02）feat: 功能基本可用 | `5844f269`（2026-10-24）feat: 新增Swift项目实验性支持 | - |
| mcp | 9 | `9ef4fd6f`（2026-06-24）refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki | `7d3c3094`（2026-10-11）refactor: 页面分发改注册表映射并CI校验一致性，新增薄证据预检与主题语义门槛 | - |
| services | 9 | `00a766f6`（2026-10-01）refactor: 将超标源文件拆分至 ≤360 行并新增行数防回潮检查 | `5326efec`（2026-10-12）fix: 修复幽灵链接与图谱路径限定名污染问题 | - |
| shared | 8 | `76565d14`（2026-06-02）feat: 功能基本可用 | `5844f269`（2026-10-24）feat: 新增Swift项目实验性支持 | - |

## 文档记录的决策

仓库 README / docs 的设计文档小节摘录（锚点 = 文档路径#标题）。

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| scx-wiki-agent：基于 codebase-memory-mcp 知识图谱的项目 Wiki 生成 CLI。读取图谱中的符号、调用关系与复杂度数据，为支持矩阵内的代码项目生成结构化中文 Markdown 文档；以图谱的精确结构数据为唯一事实来源，LLM 只负责叙述，反幻觉铁律 + 写盘前质量闸门双重兜底。 | 文档小节 | README.md | README.md#scx-wiki-agent |
| 功能特性：- **知识图谱数据源** — 通过子进程调用 `codebase-memory-mcp` 获取 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边 - **意图证据层（Intent Evidence）** — 图谱只回答「是什么」，动机类叙述的证据由确定性提取器补充：源码注释（文件头/符号注释/TODO 标记/常量注释）、git | 文档小节 | README.md | README.md#功能特性 |
| 支持矩阵：| 语言 | 支持程度 | 说明 | | --- | --- | --- | | TypeScript / JavaScript / Vue | ✅ 完整 | 图谱 + 注释/git/docs 意图证据 + I/O 扫描全通道（实战验证） | | Rust（含 Tauri） | ✅ 完整 | 跨语言 CALLS 过滤 + Tauri IPC 面 | | Python | 🧪 实验性 | 扫描/注 | 文档小节 | README.md | README.md#支持矩阵 |

## 高频变更热点（维护风险）

提交次数最多的文件，变更越频繁维护风险越高。

| 文件 | 提交数 | 最近提交 |
| --- | --- | --- |
| src/knowledge/page-registry.ts | 12 | `7d3c3094`（2026-10-11）refactor: 页面分发改注册表映射并CI校验一致性，新增薄证据预检与主题语义门槛 |
| src/core/scanner.ts | 11 | `5844f269`（2026-10-24）feat: 新增Swift项目实验性支持 |
| src/cli/commands/build.ts | 10 | `75981d16`（2026-10-11）feat: 新增 build.ignored_dirs 配置项支持自定义忽略文件夹 |
| src/mcp/codebase-memory-client.ts | 9 | `7d3c3094`（2026-10-11）refactor: 页面分发改注册表映射并CI校验一致性，新增薄证据预检与主题语义门槛 |
| src/services/wiki/service.ts | 9 | `5326efec`（2026-10-12）fix: 修复幽灵链接与图谱路径限定名污染问题 |
| src/shared/utils.ts | 8 | `5844f269`（2026-10-24）feat: 新增Swift项目实验性支持 |
| src/knowledge/topic-discovery.ts | 7 | `7d3c3094`（2026-10-11）refactor: 页面分发改注册表映射并CI校验一致性，新增薄证据预检与主题语义门槛 |
| src/knowledge/claim-verifier.ts | 6 | `21ed3e48`（2026-10-11）fix: 修复断言核验同名误判、表格续写拆断、确认指纹与MCP解析等严重缺陷 |
| src/knowledge/dataflow/shapes.ts | 4 | `5844f269`（2026-10-24）feat: 新增Swift项目实验性支持 |
| src/knowledge/config-detector/detector.ts | 4 | `5844f269`（2026-10-24）feat: 新增Swift项目实验性支持 |

## 本页确定知道的事实

- 模块时间线 6 条（每条含首次/最近提交锚点）
- 文档决策证据 3 条、依赖引入提交 0 条
- 高频变更文件 10 个

## 未知项

- 依赖引入无提交佐证
## Related

- 共享 5 个源文件：[calls.md](../07-reference/calls.md)
- 共享 5 个源文件：[classes.md](../07-reference/classes.md)
- 共享 4 个源文件：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
