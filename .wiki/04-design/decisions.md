# 架构决策记录（ADR）

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
</details>

本页定位：汇总影响本项目架构走向的关键决策，逐条记录其背景、决策内容、代价与关联文件锚点。所有条目均来自静态分析数据（`fromMcp: false`），因此状态保持 `proposed`，且属于自动推导结果，尚未经过人工评审——阅读时应将其视为"待确认的架构推断"而非既成事实。

## 数据可信度声明

| 项 | 值 | 说明 |
|---|---|---|
| fromMcp | false | 数据非来自人工/MCP 评审流程，全部为自动推导 |
| 决策状态 | proposed（三条均为） | 未获人工批准，禁止视为已生效约束 |
| 补充符号 | 空 | 无可用于交叉验证的额外符号锚点 |

> 由于 `fromMcp` 为 false，以下所有"决策"实际上是分析工具基于调用统计推导出的结论。当前数据未提供任何人工评审记录、评审时间或批准人信息，相关信息不足，待确认。

---

## ADR-001 分层结构：api / cli=internal / core=internal / helpers=internal / knowledge=core

| 项 | 内容 |
|---|---|
| 编号 | ADR-001 |
| 状态 | proposed（自动推导，待确认） |
| 背景 | 知识图谱分层分析显示：api 层含 HTTP route 定义；cli→internal（fan-in=2, fan-out=4）；core→internal（fan-in=2, fan-out=2）；helpers→internal（fan-in=0, fan-out=0）；knowledge→core（fan-in 高达 17, 仅 1 出） |
| 决策 | 采用上述分层，依赖方向由外层指向内层，核心层不反向依赖调用方 |
| 后果 | 新增代码应归入对应层；反向跨层依赖会在模块边界统计中暴露 |
| 相关文件 | `src/cli/commands/build.ts`、`src/cli/commands/init.ts`、`src/cli/commands/scan.ts` |

**动机解读**：这条决策的核心依据是 fan-in / fan-out 统计。`knowledge` 层 fan-in=17、fan-out=1，是全图最典型的"被依赖汇聚点"，把它划为核心层可以最大化复用并抑制变更扩散；`helpers` 层 fan-in=0、fan-out=0 意味着它当前既无调用方也无被调用方，属于孤立模块，归入 internal 是保守处理。`cli` 层 fan-out=4 表明其作为入口承担了较多下游调度职责，符合"外层编排、内层实现"的分层直觉。

**代价解读**：分层一旦成立，任何从内层（如 knowledge）指回外层（如 cli）的依赖都会成为违规信号。数据中没有给出各层之间的完整依赖矩阵，因此"依赖方向从外层指向内层"目前只能从 fan-in/fan-out 推断，尚无逐条跨层调用的锚点证据。相关文件仅覆盖 cli 层三个命令文件，其余层级的归位依据与文件归属待确认。

---

## ADR-002 模块调用边界（调用次数 top 5）

| 项 | 内容 |
|---|---|
| 编号 | ADR-002 |
| 状态 | proposed（自动推导，待确认） |
| 背景 | 跨包调用统计：services→knowledge（17 次）、core→shared（2 次）、cli→services（2 次）、services→core（1 次）、services→cli（1 次） |
| 决策 | 维持现有模块依赖方向，高频边界两端保持稳定接口 |
| 后果 | 边界两端模块形成耦合点，修改被调用方需评估所有调用方 |
| 相关文件 | 数据未提供文件锚点（files 为空），具体调用点待确认 |

**动机解读**：这条决策是对 ADR-001 分层结论的接口化落地。统计显示 `services→knowledge` 是绝对主力（17 次），与 ADR-001 中 knowledge 层 fan-in=17 完全吻合，说明 knowledge 是被 services 反复调用的核心能力层。保持该边界稳定，等价于保护全项目最高频的调用链。

**代价解读**：`services→cli`（1 次）是值得注意的反向信号——services 属于偏内层模块，却调用了 cli 层，这与 ADR-001"核心层不反向依赖调用方"的原则存在张力。该调用同时出现在 top 5 边界中，说明虽频次低但确实存在。当前数据未提供具体调用位置（files 为空），无法判断这是设计意图还是待清理的反模式，待确认。

**调用边界汇总**（基于背景数据）：

| 调用方 → 被调用方 | 调用次数 | 备注 |
|---|---|---|
| services → knowledge | 17 | 最高频边界，耦合最强 |
| core → shared | 2 | 内层间共享依赖 |
| cli → services | 2 | 外层编排内层 |
| services → core | 1 | 内层向下依赖 |
| services → cli | 1 | 反向依赖，与 ADR-001 原则存在张力 |

---

## ADR-003 核心技术选型：@ai-sdk/openai、ai、commander、ignore、tsup、vitest

| 项 | 内容 |
|---|---|
| 编号 | ADR-003 |
| 状态 | proposed（自动推导，待确认） |
| 背景 | 以下依赖在源码中被实际 import（声明未用依赖已被过滤）：@ai-sdk/openai、ai、commander、ignore、tsup、vitest |
| 决策 | 以这些依赖构成核心技术栈 |
| 后果 | 升级或替换这些依赖属于架构级变更，需回归核心调用链 |
| 相关文件 | 数据未提供文件锚点（files 为空），具体 import 位置待确认 |

**动机解读**：该决策的筛选标准是"源码中被实际 import"，已剔除声明未用依赖，因此这六个依赖构成了项目真实生效的技术底座。从名称可推断其覆盖方向：`@ai-sdk/openai` 与 `ai` 指向 AI/LLM 能力，`commander` 指向 CLI 参数解析，`ignore` 指向忽略规则处理，`tsup` 指向打包，`vitest` 指向测试。这与 ADR-001 中 cli 层的入口定位、以及 ADR-002 中 services→knowledge 的 AI 相关调用链方向一致。

**代价解读**：这六项被定义为"架构级变更"的触发点——一旦升级或替换，需回归核心调用链。但当前数据未提供各依赖的具体 import 位置（files 为空），也未提供版本或调用点计数，因此无法验证每个依赖的实际使用深度。此外，`tsup`、`vitest` 属于构建/测试工具，与运行时依赖混列在同一决策中，其"架构级"程度是否等同，数据不足，待确认。

---

## 决策脉络

三条 ADR 并非独立，而是构成一条"分层 → 边界 → 技术栈"的递进约束链：

| 层次 | 决策 | 关系 |
|---|---|---|
| 结构层 | ADR-001 分层结构 | 确立"外层指向内层"的依赖方向，约束模块归属 |
| 交互层 | ADR-002 调用边界 | 落实 ADR-001：knowledge 层的高 fan-in（17）对应 services→knowledge 的 17 次调用，两条数据互相印证 |
| 实现层 | ADR-003 技术选型 | 为分层与边界提供底层依赖：commander 支撑 cli 入口层，ai/@ai-sdk/openai 支撑 knowledge 能力层 |

**关键关联点**：

1. **knowledge 是全域核心**：ADR-001 的 fan-in=17 与 ADR-002 的 services→knowledge=17 精确对应，说明 knowledge 层既是被调用方的核心，也是最高频耦合点。ADR-003 中的 AI 依赖很可能落在此层，但数据未提供锚点，待确认。
2. **services→cli 的反向张力**：ADR-002 中该反向调用与 ADR-001"核心层不反向依赖调用方"直接冲突，是三条决策中唯一显性的内部矛盾点，其性质待确认。
3. **helpers 层悬空**：ADR-001 中 helpers fan-in=0、fan-out=0，既未被 ADR-002 的任何边界引用，也未在 ADR-003 中体现，属于当前架构中的孤立层。
4. **技术栈固化分层**：command 解析（commander）固定了 cli 层职责，AI 依赖（ai/@ai-sdk/openai）与 knowledge 层的高复用相呼应，升级任一依赖都会同时波及分层与边界两端。

> 再次提示：以上三条 ADR 状态均为 `proposed`，且 `fromMcp: false`，全部为自动推导结果，尚未经人工评审。AD R-002 与 ADR-003 的 `files` 为空，缺乏文件级锚点，相关内容应以"待确认"对待。
## Related

- 总入口：[README](../README.md)
