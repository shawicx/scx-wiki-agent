# 约束与复杂度分析

<details>
<summary>Relevant source files</summary>

- src/knowledge/page-registry.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-quality-validator.ts
- src/mcp/codebase-memory-client.ts
- src/services/wiki-service.ts
- tests/knowledge/config-detector.test.ts
</details>

本页汇总项目中的**硬性限制常量**与**代码复杂度热点**，用于说明系统在规模、深度、超时等维度上的边界，以及维护成本最集中的函数。所有数据均来自静态扫描产物，未检测到的维度将显式标注「未检测到」。

---

## 一、限制常量

下表列出扫描到的全部限制常量。**注意**：`tests/` 目录下的常量来自测试文件（`tests/knowledge/config-detector.test.ts`），属于测试配置，不构成运行时产品约束，仅作说明。

| 常量 | 值 | 源文件 |
| --- | --- | --- |
| `MODULE_DETAIL_LIMIT` | `12` | `src/knowledge/wiki-context-builder.ts` |
| `MAX_DEPTH` | `3` | `src/knowledge/wiki-context-builder.ts` |
| `MAX_NODES` | `25` | `src/knowledge/wiki-context-builder.ts` |
| `EVIDENCE_MAX_FILES` | `15` | `src/knowledge/wiki-evidence.ts` |
| `EVIDENCE_MIN_FILES` | `3` | `src/knowledge/wiki-evidence.ts` |
| `MAX_DEPTH`（测试） | `3` | `tests/knowledge/config-detector.test.ts` |
| `TIMEOUT_MS`（测试） | `60000` | `tests/knowledge/config-detector.test.ts` |

### 常量解读（防范的失控场景）

- **`MODULE_DETAIL_LIMIT = 12`**（`src/knowledge/wiki-context-builder.ts`）
  限制上下文构建时每个模块可展开的细节条目上限，防止单个模块的细节无限膨胀、挤占用于其他模块的上下文预算。

- **`MAX_DEPTH = 3`**（`src/knowledge/wiki-context-builder.ts`）
  限制上下文构建时的递归/遍历深度，防止在依赖或调用链上递归过深导致爆炸式展开（性能与规模双重防护）。

- **`MAX_NODES = 25`**（`src/knowledge/wiki-context-builder.ts`）
  限制上下文构建过程中纳入的节点总数，防止图规模失控（内存与输出体积上限）。

- **`EVIDENCE_MAX_FILES = 15`**（`src/knowledge/wiki-evidence.ts`）
  限制单次证据采集可引用的文件数上限，防止证据集过大导致处理时间与输出膨胀。

- **`EVIDENCE_MIN_FILES = 3`**（`src/knowledge/wiki-evidence.ts`）
  设定证据采集的文件数下限，防止证据不足（样本过少）时仍产出结论，属于质量下限约束。

- **`MAX_DEPTH = 3`**（`tests/knowledge/config-detector.test.ts`，测试）
  测试用例遍历深度，用于约束测试场景规模，不影响产品运行时行为。

- **`TIMEOUT_MS = 60000`**（`tests/knowledge/config-detector.test.ts`，测试）
  测试超时阈值（60 秒），用于限定单个测试用例的执行时长，属于测试稳定性的防护，而非产品运行时超时。

> 说明：`tests/` 目录下的 `MAX_DEPTH` 与 `TIMEOUT_MS` 仅用于测试，依据规则不纳入产品功能描述，此处列出以保持数据完整。

---

## 二、复杂度热点

下表的复杂度与循环深度均来自静态扫描 `hotFunctions` 数据，按 `complexity` 降序排列。全部函数均位于 `src/` 目录（`tests/` 中的函数未进入榜单）。

| 函数 | 源文件 | 复杂度 | 循环深度 |
| --- | --- | --- | --- |
| `buildByName` | `src/knowledge/wiki-fallback-builder.ts` | 20 | 0 |
| `buildOnboarding` | `src/knowledge/wiki-fallback-builder.ts` | 9 | 0 |
| `buildCallChainFromEdges` | `src/knowledge/wiki-context-builder.ts` | 8 | 2 |
| `buildCallsContext` | `src/knowledge/wiki-context-builder.ts` | 8 | 3 |
| `buildModules` | `src/knowledge/wiki-fallback-builder.ts` | 6 | 1 |
| `checkDeadLinks` | `src/knowledge/wiki-quality-validator.ts` | 6 | 1 |
| `buildClasses` | `src/knowledge/wiki-fallback-builder.ts` | 5 | 1 |
| `buildReadme` | `src/knowledge/wiki-fallback-builder.ts` | 5 | 1 |
| `checkAnchors` | `src/knowledge/wiki-quality-validator.ts` | 5 | 1 |
| `adaptSide` | `src/mcp/codebase-memory-client.ts` | 4 | 2 |
| `adaptTrace` | `src/mcp/codebase-memory-client.ts` | 4 | 2 |
| `buildArchitecture` | `src/knowledge/wiki-fallback-builder.ts` | 4 | 1 |
| `buildArchitectureContext` | `src/knowledge/wiki-context-builder.ts` | 4 | 1 |
| `buildCli` | `src/knowledge/wiki-fallback-builder.ts` | 4 | 1 |
| `buildConventions` | `src/knowledge/wiki-fallback-builder.ts` | 4 | 1 |
| `buildDataFlowContext` | `src/knowledge/wiki-context-builder.ts` | 4 | 2 |
| `buildModulesContext` | `src/knowledge/wiki-context-builder.ts` | 4 | 1 |
| `buildOverview` | `src/knowledge/wiki-fallback-builder.ts` | 4 | 0 |
| `buildRelatedSection` | `src/knowledge/page-registry.ts` | 4 | 0 |
| `buildWiki` | `src/services/wiki-service.ts` | 4 | 1 |

### 高复杂度函数深入分析

以下针对复杂度最高的若干函数展开分析。**说明**：由于扫描数据仅提供复杂度与循环深度两个维度，不包含函数体源码，因此「潜在风险与重构方向」均基于复杂度/循环深度等可量化指标推断，属于结构性判断，不引用未提供的实现细节。

#### 1. `buildByName`（`src/knowledge/wiki-fallback-builder.ts`，复杂度 20，循环深度 0）

- **数据特征**：复杂度显著高于同文件其他函数（多数为 4~9），但循环深度为 0，表明其分支密度主要来自**扁平的条件判断**（如多重 `if / else if / switch` 或条件表达式），而非嵌套循环。
- **潜在风险**：高分支密度意味着行为对输入状态高度敏感，路径组合数量庞大（复杂度直接反映独立路径数上界），单点修改易引入回归；测试覆盖难度高，容易存在未覆盖分支。
- **重构方向**：将扁平分支按类型/状态收敛为**查表（映射表）或分派表**，把 `if/else` 链替换为数据驱动的查找；若分支对应不同实体类型，可考虑提取策略对象。目标是把复杂度降到与同类函数（4~9）同一量级。

#### 2. `buildOnboarding`（`src/knowledge/wiki-fallback-builder.ts`，复杂度 9，循环深度 0）

- **数据特征**：复杂度为 9，循环深度为 0，与 `buildByName` 同属**分支密集但无嵌套循环**的函数。
- **潜在风险**：分支组合多，可读性下降，逻辑分散在多个条件里。
- **重构方向**：梳理条件之间存在的主次关系，提取可复用的段落生成函数，将顺序型组装改为可组合的小单元。

#### 3. `buildCallChainFromEdges`（`src/knowledge/wiki-context-builder.ts`，复杂度 8，循环深度 2）与 `buildCallsContext`（`src/knowledge/wiki-context-builder.ts`，复杂度 8，循环深度 3）

- **数据特征**：这两个函数是榜单中**循环嵌套最深**的（深度 2 与 3），复杂度 8。它们处理的是「调用链/调用上下文」，与常量 `MAX_DEPTH = 3`、`MAX_NODES = 25`（`src/knowledge/wiki-context-builder.ts`）属于同一文件，说明该文件承担了带深度与规模约束的图遍历职责。
- **潜在风险**：嵌套循环叠加图遍历，时间复杂度对输入规模敏感；此处正是限制常量介入的地方——若移除或不当调大 `MAX_DEPTH`/`MAX_NODES`，可能触发指数级展开与内存增长。深层嵌套也降低了可读性与可测试性。
- **重构方向**：将嵌套遍历抽取为独立的「带访问集与深度戳的迭代器 / 队列」；用早停（命中 `MAX_NODES`）与深度截断使终止条件显式化，减少嵌套层级。

#### 4. `buildModules`（复杂度 6）、`checkDeadLinks`（复杂度 6）、`buildClasses` / `buildReadme` / `checkAnchors`（复杂度 5）

- **数据特征**：复杂度中等（5~6），循环深度均为 1，属于单层遍历 + 若干条件判断的常见形态。
- **潜在风险**：可控，但若后续在此基础上增加条件分支，容易滑向 `buildByName` 式的高分支状态。
- **重构方向**：保持单一职责，遍历逻辑与判定逻辑分离。

> 其余列出的函数复杂度均为 4，循环深度 0~2，属于常规分支密度，未表现出突出风险。

---

## 三、已知边界

基于 `constants` 与 `hotFunctions` 两组数据，可归纳出如下项目硬边界：

1. **上下文展开存在三重上限叠加**
   `src/knowledge/wiki-context-builder.ts` 同时定义了 `MODULE_DETAIL_LIMIT = 12`、`MAX_DEPTH = 3`、`MAX_NODES = 25` 三个常量，说明上下文构建在「单模块细节量 / 遍历深度 / 节点总数」三个维度均设了硬上限。这三者是系统输出规模与运行时开销的主要决定因素。

2. **证据采集有明确上下限**
   `src/knowledge/wiki-evidence.ts` 的 `EVIDENCE_MIN_FILES = 3` 与 `EVIDENCE_MAX_FILES = 15` 构成证据数量的闭区间 [3, 15]，即证据既不能少于此下限，也不能超过此上限。

3. **最脆弱的改动点集中在两个文件**
   - `src/knowledge/wiki-context-builder.ts`：承载最深的嵌套遍历（`buildCallsContext` 循环深度 3）与全部三个规模/深度常量，是「性能与规模敏感」的核心，改动代价最高。
   - `src/knowledge/wiki-fallback-builder.ts`：收录了复杂度最高的两个函数（`buildByName` 复杂度 20、`buildOnboarding` 复杂度 9）以及多个复杂度 4~6 的构建函数，是「分支逻辑最密集」的文件，回归风险集中。

4. **质量校验属于固定成本**
   `src/knowledge/wiki-quality-validator.ts` 的 `checkAnchors`（复杂度 5）与 `checkDeadLinks`（复杂度 6）为单层遍历的校验函数，随页面/链接规模线性增长。

5. **跨模块适配层较薄**
   `src/mcp/codebase-memory-client.ts` 的 `adaptSide`、`adaptTrace` 复杂度均为 4、循环深度 2，属于轻量适配函数。

6. **服务聚合层复杂度低**
   `src/services/wiki-service.ts` 的 `buildWiki` 复杂度仅 4，说明其主要是编排/聚合角色，自身逻辑不复杂。

---

## 四、待确认项

以下方面当前数据不足以描述，按 R5 显式标注，不作推测：

- **各常量的具体语义与作用点**：`constants` 仅提供名称、值与文件路径，未提供声明处的上下文或使用点，因此上述「解读」仅从命名与所在文件职责进行结构推断；常量在代码中的确切约束对象**待确认**（缺常量引用点数据）。
- **复杂度计算口径**：`hotFunctions` 未说明 `complexity` 采用的度量（如圈复杂度、认知复杂度）及 `loopDepth` 的统计规则，因此跨函数比较应视为**相对排序**，具体权重**待确认**。
- **性能数字**：扫描数据未含任何运行时耗时、内存占用或吞吐指标，故本页**不含**性能阈值或性能结论，**未检测到**相关数据。
- **超时/重试等运行时约束**：产品代码中**未检测到**超时、重试类常量；唯一 `TIMEOUT_MS` 位于 `tests/knowledge/config-detector.test.ts`，属测试配置，不代表运行时行为。
- **函数级调用关系**：本批数据仅含复杂度指标，未提供调用边（caller→callee），因此无法给出调用关系表；调用关系**待确认**（缺调用图数据）。
- **模块依赖与继承关系**：本批数据未含模块依赖边或继承关系，故不绘制 `graph TD` 或 `classDiagram`，此类**待确认**（缺依赖/继承数据）。
## Related

- 同目录：[conventions.md](conventions.md)
- 总入口：[README](../README.md)
