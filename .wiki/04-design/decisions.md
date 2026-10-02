# 设计决策与演进

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/core/scanner.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/page-registry.ts
- src/knowledge/wiki-output-sanitizer.ts
- src/shared/utils.ts
- README.md
- src/knowledge/config-detector/detector.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-continuation.ts
- src/mcp/codebase-memory-client.ts
</details>

本页基于 git 提交时间线与 README 文档小节，还原 scx-wiki-agent 各模块的演进节奏、文档记录的架构决策与高频变更热点，用于判断项目重心与维护风险。

**证据类型说明**：本页可用证据仅三类——`gitTimeline`（模块级提交统计与主题聚类，锚点为首次/最近 commit）、`docDecisions`（README.md 小节摘录）、`hotFileChurn`（文件级变更次数与最近提交）。`depCommits` 为空数组，故本页不提供依赖引入决策。

---

## 一、演进时间线

主题为该模块的提交主题聚类（数据未附带单条提交哈希，故以模块首次/最近提交为区间锚点）。

| 模块 | 提交数 | 首次提交 | 最近提交 | 高频主题 |
| --- | --- | --- | --- | --- |
| knowledge | 58 | commit:76565d14 (2026-06-02)「feat: 功能基本可用」 | commit:2c369d53 (2026-10-01)「fix: 待确认收集改为 marker 准入并豁免证据引用，消除 --confirm 伪待办」 | ① 将超标源文件拆分至 ≤360 行并新增行数防回潮检查（×8）② 意图候选文件改为多信号重要性排序并优化回退路径中文可读性（×5）③ 新增 python/go/jvm 实验性多语言支持并明确支持矩阵边界（×5） |
| cli | 17 | commit:76565d14 (2026-06-02)「feat: 功能基本可用」 | commit:19eb6f9f (2026-09-29)「feat: 新增待确认项交互裁决与确认结果持久化」 | ① 功能基本可用（×4）② 修复 vue/tauri/bun 场景下的探测误报与图谱虚构边，补齐 llm 页面生成路径（×2）③ 支持全局配置（×2） |
| core | 9 | commit:76565d14 (2026-06-02)「feat: 功能基本可用」 | commit:e31862e7 (2026-10-01)「feat: 新增 Python/Go/JVM 实验性多语言支持并明确支持矩阵边界」 | 数据未提供（`themes` 为空） |
| shared | 8 | commit:76565d14 (2026-06-02)「feat: 功能基本可用」 | commit:e31862e7 (2026-10-01)「feat: 新增 Python/Go/JVM 实验性多语言支持并明确支持矩阵边界」 | 数据未提供（`themes` 为空） |
| mcp | 6 | commit:9ef4fd6f (2026-06-24)「refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki」 | commit:e1a30092 (2026-10-01)「feat: 升级断言校验为证据分类核验（点链匹配/注释提及识别/同名歧义统计）并试点 topic 页证据引用」 | 数据未提供（`themes` 为空） |

`knowledge`、`cli`、`core`、`shared` 四个模块的首次提交同为 `commit:76565d14 (2026-06-02)「feat: 功能基本可用」`，即该日期与主题是这批模块共同诞生动机的直接证据：项目以「功能基本可用」为起点，而非先做架构分层再补功能。

### 演进重心与节奏分析

**knowledge 是绝对重心，且演进呈"质量机制驱动"而非"功能堆叠"特征。** 该模块 58 次提交，占五个模块合计（58+17+9+8+6=98）中的约 59%；其最近提交 `commit:2c369d53 (2026-10-01)「fix: 待确认收集改为 marker 准入并豁免证据引用，消除 --confirm 伪待办」` 已是在修正细分规则误判（伪待办），说明该模块已进入机制打磨期。三条主题聚类同样指向"约束与可读性"而非新抓取能力：拆分超标源文件并加行数防回潮检查（×8）是代码结构治理，意图候选多信号排序与中文可读性（×5）是输出质量治理，多语言支持并明确支持矩阵边界（×5）是能力边界的显式声明。

**cli 是交互面，其重心从"能跑"转向"能裁决与持久化"。** 首个主题「功能基本可用」（×4）表明 CLI 早期定位是打通端到端；最近提交 `commit:19eb6f9f (2026-09-29)「feat: 新增待确认项交互裁决与确认结果持久化」` 显示 cli 承担了把「待确认」从内部标记转为用户可裁决项的职责，这与 knowledge 侧 `commit:2c369d53` 同期处理待确认准入规则形成同一问题的两端。

**mcp 模块的起点显著晚于其他模块，是架构重构的产物。** 其首次提交为 `commit:9ef4fd6f (2026-06-24)「refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki」`，比其余模块晚 22 天，且提交类型为 `refactor`。这直接对应 README.md#scx-wiki-agent 中「通过子进程调用 `codebase-memory-mcp`」的数据源定位（见下文文档决策）。

> **推断（依据：首次提交时间差与主题词）**：mcp 模块首次提交晚于 core/shared/knowledge/cli 22 天且主题为 `refactor`，据此推断项目最初并非以 codebase-memory-mcp 知识图谱为数据源，而是在 2026-06-24 才完成数据源切换。此推断仅来自 `commit:9ef4fd6f` 的日期与标题措辞，缺少该日之前的图谱/扫描实现证据。间接旁证：`src/knowledge/wiki-output-sanitizer.ts` 最近提交为 `commit:24e6660d (2026-09-21)「feat: 引入证据锚定、薄证据补强与图表闸门等 wiki 质量机制并清理旧管线死代码」`，标题中明确出现「清理旧管线死代码」，说明确实存在被替换的旧管线。

> **推断（依据：模块提交量分布与主题聚类）**：knowledge 占总量约 59%、cli 占约 17%，二者合计约 76%，据此推断项目工程投入集中在「Wiki 生成质量 + 用户裁决交互」这条主线，core/shared 更接近被复用的基础层（提交数 9/8，且最近一次提交均为 `commit:e31862e7 (2026-10-01)「feat: 新增 Python/Go/JVM 实验性多语言支持并明确支持矩阵边界」`，是被多语言扩展统一带动的同步改动）。此判断基于提交计数与最近提交主题的重合，未提供文件级改动明细可核。

---

## 二、文档记录的决策

`docDecisions` 共 3 条，均来自 README.md；下列摘录忠实于数据原文，数据中长摘录已截断处保持截断状态。

| # | 文档小节 | 记录的设计决策与动机（摘录） | 锚点 |
| --- | --- | --- | --- |
| 1 | scx-wiki-agent | 「基于 codebase-memory-mcp 知识图谱的项目 Wiki 生成 CLI。读取图谱中的符号、调用关系与复杂度数据，为支持矩阵内的代码项目生成结构化中文 Markdown 文档；以图谱的精确结构数据为唯一事实来源，LLM 只负责叙述，反幻觉铁律 + 写盘前质量闸门双重兜底。」 | README.md#scx-wiki-agent |
| 2 | 功能特性 | 「功能特性：- **知识图谱数据源** — 通过子进程调用 `codebase-memory-mcp` 获取 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边 - **意图证据层（Intent Evidence）** — 图谱只回答「是什么」，动机类叙述的证据由确定性提取器补充：源码注释（文件头/符号注释/TODO 标记/常量注释）、git」（数据中摘录在此处截断） | README.md#功能特性 |
| 3 | 支持矩阵 | 「支持矩阵：| 语言 | 支持程度 | 说明 | | --- | --- | --- | | TypeScript / JavaScript / Vue | ✅ 完整 | 图谱 + 注释/git/docs 意图证据 + I/O 扫描全通道（实战验证） | | Rust（含 Tauri） | ✅ 完整 | 跨语言 CALLS 过滤 + Tauri IPC 面 | | Python | 🧪 实验性 | 扫描/注」（数据中摘录在此处截断） | README.md#支持矩阵 |

**这三条文档决策与提交历史的相互印证：**

- 文档第 1 条确立「图谱为唯一事实来源、LLM 只负责叙述」的分工，对应 `commit:9ef4fd6f (2026-06-24)「refactor: 重构为基于 codebase-memory-mcp 知识图谱生成 wiki」` 的重构主题，也对应 mcp 模块 `commit:e1a30092 (2026-10-01)「feat: 升级断言校验为证据分类核验（点链匹配/注释提及识别/同名歧义统计）并试点 topic 页证据引用」`——「断言校验升级为证据分类核验」正是把「只负责叙述」的边界做成可校验机制。
- 文档第 2 条把图谱能力限定为回答「是什么」，动机类证据另建「意图证据层」，由确定性提取器补充源码注释、**git**、docs 等来源；文档摘录在此处被截断，意图层的完整来源清单不在数据中。
- 文档第 3 条以支持矩阵显式区分「✅ 完整」与「🧪 实验性」，其中 Python 被标为实验性，与 knowledge/core/shared 三模块最近提交 `commit:e31862e7 (2026-10-01)「feat: 新增 Python/Go/JVM 实验性多语言支持并明确支持矩阵边界」` 中「实验性」「明确支持矩阵边界」的措辞一致：能力扩展与边界声明是同一次决策的两面。

---

## 三、依赖引入决策

`depCommits` 为空数组，本页无法给出任何带 commit 锚点的依赖引入决策。相关信息不足，不作推测（另见「证据缺口」）。

---

## 四、高频变更热点与维护风险

`hotFileChurn` 提供的文件级变更次数与最近一次相关提交如下：

| 文件 | 提交数 | 最近提交 | 最近提交含义（中文解释） |
| --- | --- | --- | --- |
| src/knowledge/page-registry.ts | 11 | commit:e2826e7c (2026-10-01) | feat: 实现 Tier-2 动态 surface 页面并新增 library 项目类型探测（页面注册体系仍在扩容） |
| src/cli/commands/build.ts | 9 | commit:19eb6f9f (2026-09-29) | feat: 新增待确认项交互裁决与确认结果持久化（构建命令承载新的交互与持久化职责） |
| src/core/scanner.ts | 9 | commit:e31862e7 (2026-10-01) | feat: 新增 Python/Go/JVM 实验性多语言支持并明确支持矩阵边界（扫描器是语言扩展的主要落点） |
| src/shared/utils.ts | 6 | commit:e31862e7 (2026-10-01) | 同上，随多语言扩展同步改动 |
| src/mcp/codebase-memory-client.ts | 6 | commit:e1a30092 (2026-10-01) | feat: 升级断言校验为证据分类核验（点链匹配/注释提及识别/同名歧义统计）并试点 topic 页证据引用（图谱客户端承载校验能力升级） |
| src/knowledge/claim-verifier.ts | 5 | commit:2c369d53 (2026-10-01) | fix: 待确认收集改为 marker 准入并豁免证据引用，消除 --confirm 伪待办（断言校验规则在纠偏中） |
| src/knowledge/topic-discovery.ts | 5 | commit:284f1e41 (2026-09-30) | feat: 分离生产与测试证据提升Wiki准确性（主题发现侧的准确性治理） |
| src/knowledge/wiki-output-sanitizer.ts | 3 | commit:24e6660d (2026-09-21) | feat: 引入证据锚定、薄证据补强与图表闸门等 wiki 质量机制并清理旧管线死代码（质量闸门建立，同时清理旧管线） |
| src/knowledge/config-detector/detector.ts | 3 | commit:e31862e7 (2026-10-01) | 随多语言支持扩展项目类型/配置探测 |
| src/knowledge/wiki-continuation.ts | 3 | commit:b98ffb05 (2026-09-30) | feat: 截断页尾部愈合并新增 incomplete-page 闸门规则，残页降级规则路径重建（长文档续写与残页治理） |

**维护风险与稳定性判断：**

1. **`src/knowledge/page-registry.ts`（11 次，最高频）是结构核心仍在变动的信号。** 其最近提交 `commit:e2826e7c (2026-10-01)「feat: 实现 Tier-2 动态 surface 页面并新增 library 项目类型探测」` 表明页面体系又新增了「动态 surface 页面」层与新的项目类型维度，属于结构性扩展而非缺陷修复。任何依赖页面集合的下游逻辑（如构建命令的页面遍历）在该文件变动时都需同步核对，属高耦合维护点。
2. **`src/cli/commands/build.ts`（9 次）与 `src/knowledge/claim-verifier.ts`（5 次）构成同一问题的两端。** build.ts 最近提交为 `commit:19eb6f9f (2026-09-29)「feat: 新增待确认项交互裁决与确认结果持久化」`（新增交互裁决+持久化），claim-verifier.ts 最近提交为 `commit:2c369d53 (2026-10-01)「fix: 待确认收集改为 marker 准入并豁免证据引用，消除 --confirm 伪待办」`（修正准入规则、消除「伪待办」）。两天内一侧新增收集、另一侧修正收集口径，说明「待确认项」的判定标准尚在收敛过程中，相关规则变更存在反复调整风险。
3. **`src/core/scanner.ts`（9 次）与 `src/shared/utils.ts`（6 次）的最近提交相同**（`commit:e31862e7 (2026-10-01)`），说明多语言扩展是穿透 core/shared/knowledge 三层的横向改动；扫描器作为语言扩展的主要落点，其每次支持新语言都会牵引 shared 工具层同步变化，是语言维度上的风险集中区。
4. **质量与证据类文件呈现"频繁小步修正"特征。** `claim-verifier.ts`（5 次）、`topic-discovery.ts`（5 次，`commit:284f1e41 (2026-09-30)「feat: 分离生产与测试证据提升Wiki准确性」`）、`wiki-output-sanitizer.ts`（3 次，`commit:24e6660d (2026-09-21)`）、`wiki-continuation.ts`（3 次，`commit:b98ffb05 (2026-09-30)「feat: 截断页尾部愈合并新增 incomplete-page 闸门规则，残页降级规则路径重建」`）均在 2026-09-21 至 10-01 的 11 天内被再次触碰。这组文件变更共同指向 README.md#scx-wiki-agent 所述的「反幻觉铁律 + 写盘前质量闸门双重兜底」，即质量机制是该阶段的主要变更来源，同时也意味着这部分规则尚未稳定。

---

## 五、证据缺口（待确认）

| # | 待确认事项 | 缺少的证据 |
| --- | --- | --- |
| 1 | 依赖引入决策 | `depCommits` 为空数组，缺少任何依赖引入提交的主题、哈希与日期 |
| 2 | core / shared / mcp 三模块的演进主题 | 三模块 `gitTimeline.themes` 均为空，仅有首次/最近提交，无法判断其内部演进重心 |
| 3 | 各模块主题聚类对应的具体提交 | 主题聚类仅给出次数（如「×8」「×5」），未附单条提交哈希，无法为单条主题给出独立 commit 锚点 |
| 4 | README.md 其余决策小节 | `docDecisions` 仅提供 3 条且第 2、3 条摘录被截断，意图证据层来源清单与支持矩阵其余行次不在数据中 |

以下事项数据虽不完整但不影响本页结论，不再单列：各模块提交的具体改动文件清单、提交作者与分支信息。
## Related

- 共享 4 个源文件、共享 8 个符号：[modules.md](../02-architecture/modules.md)
- 共享 3 个源文件、共享 6 个符号：[topic:topic-9.md](../08-topics/topic-9.md)
- 共享 3 个源文件、共享 4 个符号：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)
