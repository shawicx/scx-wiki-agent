# 约束与复杂度文档

<details>
<summary>Relevant source files</summary>

- src/knowledge/page-registry.ts
- src/knowledge/topic-discovery.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
- src/mcp/codebase-memory-client.ts
- tests/knowledge/config-detector.test.ts
</details>

> 本页职责：基于限制常量与复杂度热点数据，说明本项目（codebase-memory 类工具的 knowledge/mcp 模块）的硬性边界与维护成本所在。所有事实声明均带 `file` 锚点，未提供的数据标注「未检测到」或「待确认」。

---

## 一、限制常量

以下常量取自 `src/knowledge/` 下三个源文件以及一份测试文件。其中测试文件（`tests/knowledge/config-detector.test.ts`）中的常量仅用于约束测试行为，不计入项目运行期功能，但为完整性一并列出并明确标注。

| 常量 | 值 | 源文件 | 说明 |
|------|----|--------|------|
| MAX_TOPICS | 4 | `src/knowledge/topic-discovery.ts` | 主题发现数量上限 |
| MIN_CLUSTER_MEMBERS | 5 | `src/knowledge/topic-discovery.ts` | 聚类最小成员数 |
| MIN_TOPIC_FILES | 3 | `src/knowledge/topic-discovery.ts` | 单主题最少文件数 |
| MAX_TOPIC_FILES | 12 | `src/knowledge/topic-discovery.ts` | 单主题最多文件数 |
| MODULE_DETAIL_LIMIT | 12 | `src/knowledge/wiki-context-builder.ts` | 模块详情条目上限 |
| MAX_DEPTH | 3 | `src/knowledge/wiki-context-builder.ts` | 上下文构建最大遍历深度 |
| MAX_NODES | 25 | `src/knowledge/wiki-context-builder.ts` | 上下文构建节点总数上限 |
| EVIDENCE_MAX_FILES | 15 | `src/knowledge/wiki-evidence.ts` | 证据收集最大文件数 |
| EVIDENCE_MIN_FILES | 3 | `src/knowledge/wiki-evidence.ts` | 证据收集最小文件数 |
| MAX_DEPTH（测试） | 3 | `tests/knowledge/config-detector.test.ts` | 测试用遍历深度上限 |
| TIMEOUT_MS（测试） | 60000 | `tests/knowledge/config-detector.test.ts` | 测试超时时间（毫秒） |

### 1.1 逐条解读：每个常量防止的失控场景

> 以下「防止的失控场景」为对常量语义的保守解读，依据其命名与所在文件职责；未检测到具体注释或校验点的常量，其精确触发条件标注「待确认」。

**主题发现相关（`src/knowledge/topic-discovery.ts`）**

- **MAX_TOPICS = 4**：限制单次主题发现产出的主题数量上限，防止主题爆炸导致下游上下文/证据构建被海量主题拖垮（规模上限）。
- **MIN_CLUSTER_MEMBERS = 5**：聚类成员数低于 5 的簇会被丢弃，防止碎片化噪声簇进入主题集合（规模下限 / 信噪比控制）。
- **MIN_TOPIC_FILES = 3**：主题覆盖文件数低于 3 的不作为主题，防止单文件孤岛被误判为独立主题（规模下限）。
- **MAX_TOPIC_FILES = 12**：单个主题最多纳入 12 个文件，防止某个超大主题吞并几乎全部文件、丧失区分度（规模上限）。

**上下文构建相关（`src/knowledge/wiki-context-builder.ts`）**

- **MODULE_DETAIL_LIMIT = 12**：模块详情最多展开 12 条，防止单页模块信息过长（输出规模上限）。
- **MAX_DEPTH = 3**：图/依赖遍历深度上限为 3 层，防止深图递归导致时间与内存失控（遍历深度上限）。
- **MAX_NODES = 25**：单次上下文构建节点总数上限为 25，防止大图导致上下文膨胀（内存/规模上限）。

**证据收集相关（`src/knowledge/wiki-evidence.ts`）**

- **EVIDENCE_MAX_FILES = 15**：证据最多引用 15 个文件，防止证据列表无限膨胀（规模上限）。
- **EVIDENCE_MIN_FILES = 3**：证据至少需要 3 个文件支撑，低于该阈值的证据视为不足，防止单文件错误结论被当作证据（信噪比下限）。

**测试相关（`tests/knowledge/config-detector.test.ts`，非运行期功能）**

- **MAX_DEPTH = 3**：测试用例中被测逻辑的遍历深度上限。
- **TIMEOUT_MS = 60000**：单个测试用例超时上限 60000ms（= 60s），防止测试挂起（超时上限）。

> 注：常量是否通过显式运行时校验（如 `Math.min`、断言、抛错）生效，数据未提供对应调用点，**待确认**——需查阅各常量在源文件中的引用行。

---

## 二、复杂度热点

以下热点来自三个源文件：`src/mcp/codebase-memory-client.ts`、`src/knowledge/wiki-fallback-builder.ts`、`src/knowledge/wiki-context-builder.ts`、`src/knowledge/page-registry.ts`。无 `tests/` 目录下的函数进入热点列表。

| 函数 | 源文件 | 复杂度 | 循环深度 |
|------|--------|-------|---------|
| buildByName | `src/knowledge/wiki-fallback-builder.ts` | 21 | 0 |
| buildCallsContext | `src/knowledge/wiki-context-builder.ts` | 10 | 3 |
| buildOnboarding | `src/knowledge/wiki-fallback-builder.ts` | 9 | 0 |
| buildTroubleshooting | `src/knowledge/wiki-fallback-builder.ts` | 9 | 1 |
| buildCallChainFromEdges | `src/knowledge/wiki-context-builder.ts` | 8 | 2 |
| buildModules | `src/knowledge/wiki-fallback-builder.ts` | 6 | 1 |
| buildArchitectureContext | `src/knowledge/wiki-context-builder.ts` | 5 | 1 |
| buildClasses | `src/knowledge/wiki-fallback-builder.ts` | 5 | 1 |
| buildOverview | `src/knowledge/wiki-fallback-builder.ts` | 5 | 0 |
| buildReadme | `src/knowledge/wiki-fallback-builder.ts` | 5 | 1 |
| buildReadmeContext | `src/knowledge/wiki-context-builder.ts` | 5 | 1 |
| buildRelatedSection | `src/knowledge/page-registry.ts` | 5 | 0 |
| adaptSide | `src/mcp/codebase-memory-client.ts` | 4 | 2 |
| adaptTrace | `src/mcp/codebase-memory-client.ts` | 4 | 2 |
| buildArchitecture | `src/knowledge/wiki-fallback-builder.ts` | 4 | 1 |
| buildCli | `src/knowledge/wiki-fallback-builder.ts` | 4 | 1 |
| buildConventions | `src/knowledge/wiki-fallback-builder.ts` | 4 | 1 |
| buildDataFlowContext | `src/knowledge/wiki-context-builder.ts` | 4 | 2 |
| buildModulesContext | `src/knowledge/wiki-context-builder.ts` | 4 | 1 |
| buildTopicContext | `src/knowledge/wiki-context-builder.ts` | 4 | 2 |

### 2.1 深度分析（复杂度最高的前几位）

**① `buildByName` — 复杂度 21 / 循环深度 0**
- 源文件：`src/knowledge/wiki-fallback-builder.ts`
- 特征：复杂度最高（21），但循环深度为 0，说明其复杂度主要来自**多重分支判定**而非嵌套循环（大概率是长 if/else-if 链或 switch/映射分派）。
- 潜在风险：单函数承担 21 条独立分支，任何一个分支新增/修改都需重新理解全部分支，**改动代价集中在分支协调**；回归测试难以覆盖全部路径。
- 重构方向（基于结构判断，具体业务语义待确认）：将长分支拆分为查表（map）驱动或策略函数集合，使新增分支只增加表项、不修改控制流。分支的精确语义需查阅源码，**待确认**。

**② `buildCallsContext` — 复杂度 10 / 循环深度 3**
- 源文件：`src/knowledge/wiki-context-builder.ts`
- 特征：复杂度 10 且循环深度达 3，是全表**循环嵌套最深**的函数之一。
- 潜在风险：三层嵌套循环叠加分支判断，时间开销随规模呈乘积增长；与 `MAX_NODES=25`（`src/knowledge/wiki-context-builder.ts`）配合可防止节点膨胀，但内部三层循环本身仍是性能与理解成本热点。
- 重构方向：将最深一层循环抽为独立函数，或将循环输入预先扁平化，降低嵌套层数。

**③ `buildOnboarding` — 复杂度 9 / 循环深度 0**
- 源文件：`src/knowledge/wiki-fallback-builder.ts`
- 特征：复杂度 9、无循环，属分支密集型。
- 潜在风险：与 `buildByName` 同类——分支聚集导致维护面窄而深，单点改动影响面难评估。

**④ `buildTroubleshooting` — 复杂度 9 / 循环深度 1**
- 源文件：`src/knowledge/wiki-fallback-builder.ts`
- 特征：复杂度 9 且含一层循环，是「分支 + 迭代」混合体。
- 潜在风险：循环体内的分支随输入数据形态变化，覆盖测试需同时构造迭代与分支组合。

**⑤ `buildCallChainFromEdges` — 复杂度 8 / 循环深度 2**
- 源文件：`src/knowledge/wiki-context-builder.ts`
- 特征：复杂度 8、两层循环，与 `buildCallsContext` 同属「调用链构建」族，均与遍历深度常量 `MAX_DEPTH=3`、`MAX_NODES=25`（`src/knowledge/wiki-context-builder.ts`）相关。
- 潜在风险：调用链构建是上下文的核心路径，两层循环 + 分支易在边界（空边、环）上出错。

### 2.2 中等复杂度函数概览

| 函数 | 复杂度 | 循环深度 | 关注点 |
|------|-------|---------|--------|
| buildModules | 6 | 1 | 模块聚合，与 `MODULE_DETAIL_LIMIT=12` 相关（同文件 `wiki-context-builder.ts` 有该常量） |
| buildArchitectureContext | 5 | 1 | 架构上下文构建 |
| buildClasses | 5 | 1 | 类信息构建 |
| buildOverview | 5 | 0 | 概览，分支型 |
| buildReadme | 5 | 1 | README 构建 |
| buildReadmeContext | 5 | 1 | README 上下文 |
| buildRelatedSection | 5 | 0 | 页面注册表内的相关章节构建 |
| adaptSide / adaptTrace | 4 | 2 | MCP 客户端适配层，含两层循环 |
| buildArchitecture / buildCli / buildConventions | 4 | 1 | fallback 构建器族 |
| buildDataFlowContext | 4 | 2 | 数据流上下文 |
| buildModulesContext | 4 | 1 | 模块上下文 |
| buildTopicContext | 4 | 2 | 主题上下文，与主题发现常量相关 |

> 说明：上表中「关注点」列仅基于函数名与同文件/同族常量的关联，非源码调用点证据，作为线索而非结论。

---

## 三、已知边界

综合常量与复杂度数据，本项目暴露出以下硬边界与维护成本集中区：

1. **分支密度是首要维护成本**
   `buildByName`（复杂度 21，`src/knowledge/wiki-fallback-builder.ts`）与 `buildOnboarding`（复杂度 9，同文件）均为**零循环、高分支**结构。这意味着 fallback 构建器族的功能扩展主要靠追加分支，**改动代价随分支数线性上升**，且无循环结构意味着无法通过调整迭代上限来收敛复杂度。

2. **嵌套遍历是性能边界**
   `buildCallsContext`（循环深度 3）、`buildCallChainFromEdges`（深度 2）、`buildDataFlowContext`、`buildTopicContext`、`adaptSide`、`adaptTrace`（均深度 2）构成嵌套遍历热点。这些函数受 `MAX_DEPTH=3` 与 `MAX_NODES=25`（`src/knowledge/wiki-context-builder.ts`）约束，**边界安全性依赖这两个常量被正确应用**；其运行时是否真正被强制校验，**待确认**。

3. **规模上限集中在知识产出链路**
   主题发现（`topic-discovery.ts` 的 4 个常量）、上下文构建（`wiki-context-builder.ts` 的 3 个常量）、证据收集（`wiki-evidence.ts` 的 2 个常量）三处均设上下限。这说明**输出规模是本项目被主动约束的核心维度**；其中 `MIN_*` 类下限（`MIN_CLUSTER_MEMBERS=5`、`MIN_TOPIC_FILES=3`、`EVIDENCE_MIN_FILES=3`）表明系统对「信息不足」采取**丢弃**而非降级策略——改动这些下限会直接改变主题/证据的产出率。

4. **MCP 适配层复杂度适中但含嵌套**
   `src/mcp/codebase-memory-client.ts` 的 `adaptSide`、`adaptTrace` 复杂度均为 4、循环深度 2，是外部协议（MCP）与内部数据结构之间的转换层。该层嵌套循环 + 适配逻辑，是外部依赖变更时的**耦合脆弱点**。

5. **测试超时边界**
   测试侧设 `TIMEOUT_MS=60000`（`tests/knowledge/config-detector.test.ts`），属独立边界，不直接影响运行期功能。

6. **未检测到的方面**
   - 运行期整体超时/内存上限常量：**未检测到**（除测试 `TIMEOUT_MS` 外，无运行期超时常量）。
   - 各常量的运行时强制校验方式（抛错 / 截断 / 静默丢弃）：**待确认**——需查阅常量引用行。
   - 函数间的调用关系（谁调用 `buildByName`、`buildCallsContext` 等）：数据未提供调用边，**待确认**；按 R2 本页不以时序图呈现。

---

## 四、适用提醒

- 本页所有常量值与复杂度数字均直接取自所提供数据，未做任何外推或估算。
- 文中「潜在风险」「重构方向」为基于**结构特征**（复杂度、循环深度）的分析，不涉及具体业务语义；精确结论需结合各函数的源码分支与调用点，**待确认**项已在对应位置标注。
## Related

- 同目录：[conventions.md](conventions.md)
- 总入口：[README](../README.md)
