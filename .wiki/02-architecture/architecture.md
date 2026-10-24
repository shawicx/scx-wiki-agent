# 架构

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/commands/types.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/core/types.ts
- src/knowledge/channels/rust-methods.ts
- src/knowledge/channels/sanitizer.ts
- src/knowledge/channels/stats.ts
- src/knowledge/channels/vue-sfc.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/config-detector.ts
- src/knowledge/config-detector/detector.ts
</details>

模块概览：

## knowledge

文件数：108

语言：ts × 108

扇入/扇出：0 / 0

## services

文件数：15

语言：ts × 15

扇入/扇出：0 / 0

## mcp

文件数：2

语言：ts × 2

扇入/扇出：0 / 0

## core

文件数：2

语言：ts × 2

扇入/扇出：0 / 0

## shared

文件数：4

语言：ts × 4

扇入/扇出：0 / 0

## cli

文件数：6

语言：ts × 6

扇入/扇出：0 / 0

## 设计依据：knowledge

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 正文断言校验（DeepWiki-Open 文本断言交叉核验的确定性实现）。 抽取 LLM 生成正文 inline 代码片段中的标识符声明，三级核验： 图谱符号全集（简名 + qualified_name 后缀匹配，点链全串优先、逐级回退到末段） → 扫描文件名干 → 词法证据探测（注入式回调，区分代码实据与纯注释/配置提及： 仅 definition/usage 算功能实据）。 查无实据或仅提及的声明改写为「待确认」标注（R5 风格，保留信息量）， 统计进构建报告（含仅提及与 | 文件头自述 | src/knowledge/claim-verifier.ts | src/knowledge/claim-verifier.ts:1 |
| Vue SFC 权威通道（W1）：以官方编译器 `@vue/compiler-sfc` 结构化解析 .vue 文件。 动机（实测）：CBM 图谱对 .vue SFC 只索引 File/Module 两个节点——组件名、 props、emits、内部函数全部缺失，wiki 前端面此前只能靠正则近似 （source-fallback + declCount 计数）。 通道分工： - `parse()` 做块切分与行号偏移（script 内容行号换算回原文件行号，锚点可追溯） - | 文件头自述 | src/knowledge/channels/vue-sfc.ts | src/knowledge/channels/vue-sfc.ts:1 |
| 页面所属层级。 - structure：结构层——描述"代码是什么"（架构、模块、API、调用关系等），可机器生成 - operations：运行规约层——描述"怎么跑/必须遵守什么"（环境、规约、测试、约束），需人工提炼 - surface：表层——描述"对外入口是什么"，按项目类型替换（CLI/后端/前端各不同） / | 文件头自述 | src/knowledge/page-registry.ts | src/knowledge/page-registry.ts:1 |
| Rust 方法调用通道（W2）：图谱对「接收者表达式调用」（`app.emit(...)`、 `manager.lock()`）不建 CALLS 边（实测 0 条 emit 边），Rust 侧的执行面 因此大片不可见。本通道以**名称对齐 + 置信度分级**补位： 1. 图谱 Method 节点全集（impl 方法，name → 定义点集） 2. Rust 源码全文正则收集 `.method(` 调用点（行号反查） 3. 分级：方法名全库唯一 → resolved；多候选时若 | 文件头自述 | src/knowledge/channels/rust-methods.ts | src/knowledge/channels/rust-methods.ts:1 |
| 通道级边净化器（W3）：把原「图谱消费端防线」（wiki-context-builder 家族的 isTrustedCallEdge / edgeHasLexicalEvidence）抽为**生产端共享模块**。 任何通道产出的 CALLS 边在进入 context 前统一过 `sanitizeEdge`： 1. 语言域一致——caller/callee 文件必须同属一个语言域，跨语言幽灵边 （TS→Rust，运行时只可能经 IPC 字符串通信）与跨界赋值全部拦截； 2. 词 | 文件头自述 | src/knowledge/channels/sanitizer.ts | src/knowledge/channels/sanitizer.ts:1 |
| 签名与类型形状推断（自 data-flow-shape.ts 拆出；纯搬移，零逻辑变化）。 承载：文本级括号/字符串扫描工具、图谱签名解析、实参字面量保守推断、 返回类型归一与 void 解释、name@file 键与语言域判定。 / | 文件头自述 | src/knowledge/dataflow/shapes.ts | src/knowledge/dataflow/shapes.ts:1 |

## 设计依据：services

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| WikiService：build 编排（两阶段构建：内存生成 → 裁决 → 闸门写盘）。 | 文件头自述 | src/services/wiki/service.ts | src/services/wiki/service.ts:1 |
| 断言核验基础设施：图谱符号索引、源码行缓存、指纹条目、词法探测、outline 参考集。 | 文件头自述 | src/services/wiki/verification.ts | src/services/wiki/verification.ts:1 |
| 两阶段构建·阶段一：全部页面内存生成 + 断言校验（不写盘）。 | 文件头自述 | src/services/wiki/generate-phase.ts | src/services/wiki/generate-phase.ts:1 |
| 兼容壳：实现已拆分至 src/services/wiki/（service/cleanup/report/verification/阶段二·三）。 | 文件头自述 | src/services/wiki-service.ts | src/services/wiki-service.ts:1 |
| 页面预检（data-flow / decisions）：证据不足时在 plannedPaths / README 索引 / 编号目录清理计算**之前**整页剔除——否则目录表与 Related 会出现死链。 预检构建的 context 存入 prebuiltContexts 复用（getArchitecture 无缓存， 避免同一图谱查询跑两遍）。被剔除的旧页面文件删除前先归档留档 （archiveDroppedPage，归档失败回退直接删除），不再静默消失。 / | 文件头自述 | src/services/wiki/precheck.ts | src/services/wiki/precheck.ts:1 |
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

## 设计依据：shared

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 全局配置：~/.scx/wiki-agent/config.yaml（YAML）。 优先级：CLI 参数 > 全局配置文件 > 内置默认。 api_key 支持 ${ENV_VAR} 环境变量引用（展开失败置空并告警，不把字面量发往 API）。 配置缺失/解析失败一律降级为「无配置」并告警，绝不阻断构建。 / | 文件头自述 | src/shared/config.ts | src/shared/config.ts:1 |
| 多语言源码模式层（Python / Go / JVM / Swift）：定义行、注释形态、限制常量。 TS/Rust 的既有正则留在原模块（intent/shared、source-fallback）；本模块 以「域 → 模式组」的方式补齐其余语言域，调用方按域分发。 / | 文件头自述 | src/shared/language-patterns.ts | src/shared/language-patterns.ts:1 |
| 首次提交：feat: 功能基本可用 | 提交记录 | shared | commit:76565d14 (2026-06-02) |

## 设计依据：cli

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| 待确认项交互会话（@clack/prompts）。 注入 WikiBuildOptions.confirmSession，在全部页面生成后、写盘前调用一次： 逐项展示「疑问 + 上下文 + 选项」，用户裁决确认或保持。 安全性：非 TTY（CI/管道/测试）直接返回空（全部保持待确认）； Ctrl-C 中断时保留已裁决项，其余按保持处理。 / | 文件头自述 | src/cli/confirm-interaction.ts | src/cli/confirm-interaction.ts:1 |
| 首次提交：feat: 功能基本可用 | 提交记录 | cli | commit:76565d14 (2026-06-02) |
| 高频提交主题：功能基本可用（×4）、修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）、支持全局配置（×2） | 高频主题 | cli | commit:75981d16 (2026-10-11) |

## 分层

| 包 | 层级 | 依据 |
| --- | --- | --- |
| cli | internal | fan-in=3, fan-out=6 |
| core | internal | fan-in=3, fan-out=4 |
| knowledge | internal | fan-in=58, fan-out=68 |
| mcp | leaf | only inbound calls, no outbound |
| services | internal | fan-in=2, fan-out=59 |
| shared | core | high fan-in (66 in, 0 out) |

## 模块间调用边界

| 调用方 | 被调用方 | 调用次数 |
| --- | --- | --- |
| services | knowledge | 58 |
| knowledge | shared | 58 |
| core | shared | 4 |
| cli | shared | 4 |
| knowledge | mcp | 3 |
| knowledge | cli | 3 |
| knowledge | core | 2 |
| cli | services | 2 |
| services | core | 1 |

## 模块依赖

| 依赖方 | 被依赖方 |
| --- | --- |
| services | knowledge |
| knowledge | shared |
| core | shared |
| cli | shared |
| knowledge | mcp |
| knowledge | cli |
| knowledge | core |
| cli | services |
| services | core |

## 本页确定知道的事实

- 生产模块 6 个（knowledge、services、mcp、core、shared、cli）
- 其中 0 个模块检出图谱符号（类/函数/方法）
- 模块间调用边界 9 条
- 分层记录 6 条
- 模块依赖对 9 条（去重后，最多展示 20 条）

## 未知项

- 6 个模块未检出图谱符号（文件存在但无已索引的类/函数/方法）
## Related

- 同目录：[modules.md](modules.md)
- 互补职责：[modules.md](../02-architecture/modules.md)
- 共享 9 个源文件：[calls.md](../07-reference/calls.md)
- 共享 7 个源文件、共享 1 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 8 个源文件：[api.md](../03-interface/api.md)
- 总入口：[README](../README.md)

<!-- wiki:source: fallback -->
