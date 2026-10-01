# 架构

<details>
<summary>Relevant source files</summary>

- src/knowledge/context/calls.ts
- src/knowledge/context/data-flow.ts
- src/knowledge/context/db-schema.ts
- src/knowledge/context/workspaces.ts
- src/knowledge/fallback/index.ts
- src/knowledge/fallback/structure.ts
- src/mcp/codebase-memory-client.ts
- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/commands/types.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/core/types.ts
</details>

模块概览：

## knowledge

文件数：99

语言：ts × 99

扇入/扇出：0 / 0

关键导出：`buildByName`（src/knowledge/fallback/index.ts:55）, `buildCallsContext`（src/knowledge/context/calls.ts:51）, `buildDbSchemaContext`（src/knowledge/context/db-schema.ts:118）, `buildDataFlowContext`（src/knowledge/context/data-flow.ts:29）, `buildEdges`（src/knowledge/context/workspaces.ts:106）

## services

文件数：12

语言：ts × 12

扇入/扇出：0 / 0

## mcp

文件数：2

语言：ts × 2

扇入/扇出：0 / 0

关键导出：`adaptTrace`（src/mcp/codebase-memory-client.ts:92）, `asObjects`（src/mcp/codebase-memory-client.ts:35）, `adaptArchitecture`（src/mcp/codebase-memory-client.ts:45）, `adaptSide`（src/mcp/codebase-memory-client.ts:93）

## core

文件数：2

语言：ts × 2

扇入/扇出：0 / 0

## cli

文件数：6

语言：ts × 6

扇入/扇出：0 / 0

## shared

文件数：3

语言：ts × 3

扇入/扇出：0 / 0

## 设计依据：knowledge

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 正文断言校验（DeepWiki-Open 文本断言交叉核验的确定性实现）。 抽取 LLM 生成正文 inline 代码片段中的标识符声明，三级核验： 图谱符号全集（简名 + qualified_name 后缀匹配，点链全串优先、逐级回退到末段） → 扫描文件名干 → 词法证据探测（注入式回调，区分代码实据与纯注释/配置提及： 仅 definition/usage 算功能实据）。 查无实据或仅提及的声明改写为「待确认」标注（R5 风格，保留信息量）， 统计进构建报告（含仅提及与 | 文件头自述 | src/knowledge/claim-verifier.ts | src/knowledge/claim-verifier.ts:1 |
| 页首证据锚定块（DeepWiki grounding 机制的确定性实现）。 从页面 Context 递归提取真实源文件路径（过滤到扫描清单），按分层相关性排序 （正文引用 > 符号定义 > 意图证据 > 入口/代表文件 > 配置/文档兜底）， 生成 <details> 折叠块注入页首。LLM 与规则路径统一由工具注入， LLM 无法伪造锚定块内容。 / | 文件头自述 | src/knowledge/wiki-evidence.ts | src/knowledge/wiki-evidence.ts:1 |
| WikiBuilder — fluent utility for constructing markdown wiki pages. Each method returns `this` so calls can be chained. Call `build()` at the end to get the final markdown string. / | 文件头自述 | src/knowledge/wiki-builder.ts | src/knowledge/wiki-builder.ts:1 |
| env 用途的确定性提取（R3：只采集可复核证据，不做语义推断）。 | 文件头自述 | src/knowledge/config-detector/env-purpose.ts | src/knowledge/config-detector/env-purpose.ts:1 |
| 页面所属层级。 - structure：结构层——描述"代码是什么"（架构、模块、API、调用关系等），可机器生成 - operations：运行规约层——描述"怎么跑/必须遵守什么"（环境、规约、测试、约束），需人工提炼 - surface：表层——描述"对外入口是什么"，按项目类型替换（CLI/后端/前端各不同） / | 文件头自述 | src/knowledge/page-registry.ts | src/knowledge/page-registry.ts:1 |
| 签名与类型形状推断（自 data-flow-shape.ts 拆出；纯搬移，零逻辑变化）。 承载：文本级括号/字符串扫描工具、图谱签名解析、实参字面量保守推断、 返回类型归一与 void 解释、name@file 键与语言域判定。 / | 文件头自述 | src/knowledge/dataflow/shapes.ts | src/knowledge/dataflow/shapes.ts:1 |

## 设计依据：services

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| WikiService：build 编排（两阶段构建：内存生成 → 裁决 → 闸门写盘）。 | 文件头自述 | src/services/wiki/service.ts | src/services/wiki/service.ts:1 |
| 断言核验基础设施：图谱符号索引、源码行缓存、指纹条目、词法探测、outline 参考集。 | 文件头自述 | src/services/wiki/verification.ts | src/services/wiki/verification.ts:1 |
| 两阶段构建·阶段一：全部页面内存生成 + 断言校验（不写盘）。 | 文件头自述 | src/services/wiki/generate-phase.ts | src/services/wiki/generate-phase.ts:1 |
| 兼容壳：实现已拆分至 src/services/wiki/（service/cleanup/report/verification/阶段二·三）。 | 文件头自述 | src/services/wiki-service.ts | src/services/wiki-service.ts:1 |
| .wiki 目录治理（update 模式路径；full 模式整目录重建跳过）。 | 文件头自述 | src/services/wiki/cleanup.ts | src/services/wiki/cleanup.ts:1 |
| 两阶段构建·阶段三：剥离 marker + 注入锚定块 + 写盘前闸门 + 写盘（update 模式在终稿上比较）。 | 文件头自述 | src/services/wiki/write-phase.ts | src/services/wiki/write-phase.ts:1 |

## 设计依据：mcp

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| codebase-memory-mcp index_repository 返回 | 文件头自述 | src/mcp/types.ts | src/mcp/types.ts:1 |
| 首次提交：refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki | 提交记录 | mcp | commit:9ef4fd6f (2026-06-24) |

## 设计依据：core

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 首次提交：feat: 功能基本可用 | 提交记录 | core | commit:76565d14 (2026-06-02) |

## 设计依据：cli

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 待确认项交互会话（@clack/prompts）。 注入 WikiBuildOptions.confirmSession，在全部页面生成后、写盘前调用一次： 逐项展示「疑问 + 上下文 + 选项」，用户裁决确认或保持。 安全性：非 TTY（CI/管道/测试）直接返回空（全部保持待确认）； Ctrl-C 中断时保留已裁决项，其余按保持处理。 / | 文件头自述 | src/cli/confirm-interaction.ts | src/cli/confirm-interaction.ts:1 |
| 首次提交：feat: 功能基本可用 | 提交记录 | cli | commit:76565d14 (2026-06-02) |
| 高频提交主题：功能基本可用（×4）、修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）、支持全局配置（×2） | 高频主题 | cli | commit:19eb6f9f (2026-09-29) |

## 设计依据：shared

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 全局配置：~/.scx/wiki-agent/config.yaml（YAML）。 优先级：CLI 参数 > 全局配置文件 > 内置默认。 api_key 支持 ${ENV_VAR} 环境变量引用（展开失败置空并告警，不把字面量发往 API）。 配置缺失/解析失败一律降级为「无配置」并告警，绝不阻断构建。 / | 文件头自述 | src/shared/config.ts | src/shared/config.ts:1 |
| 首次提交：feat: 功能基本可用 | 提交记录 | shared | commit:76565d14 (2026-06-02) |

## 分层

| 包 | 层级 | 依据 |
| --- | --- | --- |
| cli | internal | fan-in=3, fan-out=7 |
| core | internal | fan-in=2, fan-out=4 |
| knowledge | internal | fan-in=49, fan-out=53 |
| mcp | core | high fan-in (4 in, 0 out) |
| services | internal | fan-in=2, fan-out=49 |
| shared | core | high fan-in (53 in, 0 out) |

## 模块间调用边界

| 调用方 | 被调用方 | 调用次数 |
| --- | --- | --- |
| services | knowledge | 49 |
| knowledge | shared | 46 |
| core | shared | 4 |
| cli | shared | 3 |
| knowledge | cli | 3 |
| knowledge | mcp | 3 |
| cli | services | 2 |
| cli | core | 1 |
| cli | mcp | 1 |
| knowledge | core | 1 |

## 模块依赖

| 依赖方 | 被依赖方 |
| --- | --- |
| services | knowledge |
| knowledge | shared |
| core | shared |
| cli | shared |
| knowledge | cli |
| knowledge | mcp |
| cli | services |
| cli | core |
| cli | mcp |
| knowledge | core |

## 本页确定知道的事实

- 生产模块 6 个（knowledge、services、mcp、core、cli、shared）
- 其中 2 个模块检出图谱符号（类/函数/方法）
- 模块间调用边界 10 条
- 分层记录 6 条
- 模块依赖对 10 条（去重后，最多展示 20 条）

## 未知项

- 4 个模块未检出图谱符号（文件存在但无已索引的类/函数/方法）
## Related

- 同目录：[modules.md](modules.md)
- 互补职责：[modules.md](../02-architecture/modules.md)
- 共享 5 个源文件、共享 3 个符号：[topic:topic-9.md](../08-topics/topic-9.md)
- 共享 7 个源文件：[calls.md](../07-reference/calls.md)
- 共享 6 个源文件：[tech-stack.md](../01-overview/tech-stack.md)
- 总入口：[README](../README.md)
