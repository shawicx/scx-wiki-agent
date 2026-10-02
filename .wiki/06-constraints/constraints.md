# 约束与限制常量

<details>
<summary>Relevant source files</summary>

- scripts/check-file-lines.mjs
- src/cli/confirm-interaction.ts
- src/knowledge/confirmation/apply.ts
- src/knowledge/context/architecture.ts
- src/knowledge/context/calls.ts
- src/knowledge/context/data-flow.ts
- src/knowledge/context/frontend.ts
- src/knowledge/context/modules-api.ts
- src/knowledge/crosspage/actions.ts
- src/knowledge/dataflow/index.ts
- src/knowledge/dataflow/shapes.ts
- src/knowledge/dataflow/type-defs.ts
- src/knowledge/fallback/data-flow.ts
- src/knowledge/fallback/index.ts
- src/knowledge/fallback/meta-ops.ts
</details>

本页汇总项目中所有硬性限制常量（阈值/上限/超时）与复杂度热点，逐条说明每道限制**防止的失控场景**，并标出改动代价最集中的代码位置。所有声明均带 `file:line` 锚点；数据不足处标注「待确认」，不做推测性补全。

---

## 1. 限制常量总览

共检测到 **48 个**限制常量，分布如下表（按源文件路径排序）：

| 常量 | 值 | 源文件:行号 |
|---|---|---|
| `LIMIT` | 360 | `scripts/check-file-lines.mjs:9` |
| `BULK_THRESHOLD` | 15 | `src/cli/confirm-interaction.ts:14` |
| `MODULE_SYMBOL_CANDIDATE_LIMIT` | 60 | `src/knowledge/context/architecture.ts:14` |
| `ARCHITECTURE_SYMBOL_LIMIT` | 6 | `src/knowledge/context/architecture.ts:16` |
| `MODULES_SYMBOL_LIMIT` | 10 | `src/knowledge/context/architecture.ts:18` |
| `MODULES_SYMBOLS_PER_FILE_LIMIT` | 5 | `src/knowledge/context/architecture.ts:20` |
| `MODULES_REPRESENTATIVE_FILE_LIMIT` | 12 | `src/knowledge/context/architecture.ts:21` |
| `CALLS_MIN_GROUPS` | 6 | `src/knowledge/context/calls.ts:13` |
| `CALLS_EDGE_LIMIT` | 40 | `src/knowledge/context/calls.ts:15` |
| `DATA_FLOW_FILE_LIMIT` | 30 | `src/knowledge/context/data-flow.ts:23` |
| `DATA_FLOW_SYMBOL_LIMIT` | 200 | `src/knowledge/context/data-flow.ts:25` |
| `DATA_FLOW_TYPE_LIMIT` | 60 | `src/knowledge/context/data-flow.ts:27` |
| `MAX_DEPTH` | 3 | `src/knowledge/context/data-flow.ts:201` |
| `MAX_NODES` | 25 | `src/knowledge/context/data-flow.ts:202` |
| `MODULE_DETAIL_LIMIT` | 12 | `src/knowledge/context/modules-api.ts:24` |
| `DATA_FLOW_MAX_STAGES` | 24 | `src/knowledge/dataflow/index.ts:60` |
| `DATA_FLOW_MAX_TRANSITIONS` | 40 | `src/knowledge/dataflow/index.ts:62` |
| `DATA_FLOW_MAX_IO_EVENTS` | 30 | `src/knowledge/dataflow/index.ts:64` |
| `DATA_FLOW_MAX_EXPRESSION` | 120 | `src/knowledge/dataflow/shapes.ts:9` |
| `DATA_FLOW_MAX_TYPE_DEFS` | 20 | `src/knowledge/dataflow/type-defs.ts:11` |
| `DATA_FLOW_MAX_TYPE_TEXT` | 1200 | `src/knowledge/dataflow/type-defs.ts:13` |
| `GIT_LOG_LIMIT` | 200 | `src/knowledge/intent/shared.ts:67` |
| `GIT_TIMEOUT_MS` | 15_000 | `src/knowledge/intent/shared.ts:68` |
| `REPO_LOG_LIMIT` | 400 | `src/knowledge/intent/shared.ts:74` |
| `CHURN_LOG_LIMIT` | 2000 | `src/knowledge/intent/shared.ts:76` |
| `MAX_FILES_PER_MODULE` | 15 | `src/knowledge/outline-planner.ts:38` |
| `MAX_CANDIDATE_FILES` | 90 | `src/knowledge/outline-planner.ts:40` |
| `MAX_CHAPTERS` | 8 | `src/knowledge/outline.ts:80` |
| `MAX_PAGES_PER_CHAPTER` | 6 | `src/knowledge/outline.ts:81` |
| `MAX_OUTLINE_PAGES` | 16 | `src/knowledge/outline.ts:82` |
| `MIN_PAGE_FILES` | 3 | `src/knowledge/outline.ts:84` |
| `MAX_PAGE_FILES` | 12 | `src/knowledge/outline.ts:85` |
| `MAX_TITLE_LEN` | 80 | `src/knowledge/outline.ts:89` |
| `MAX_SUMMARY_LEN` | 200 | `src/knowledge/outline.ts:90` |
| `MAX_BRIEF_LEN` | 2000 | `src/knowledge/outline.ts:91` |
| `MAX_SPAN_MODULES` | 3 | `src/knowledge/outline.ts:94` |
| `MAX_NAMES` | 40 | `src/knowledge/source-fallback.ts:24` |
| `MAX_SIGNATURE_LEN` | 160 | `src/knowledge/source-fallback.ts:26` |
| `MAX_TOPICS` | 4 | `src/knowledge/topic-discovery.ts:29` |
| `MIN_CLUSTER_MEMBERS` | 5 | `src/knowledge/topic-discovery.ts:30` |
| `MIN_TOPIC_FILES` | 3 | `src/knowledge/topic-discovery.ts:32` |
| `MAX_TOPIC_FILES` | 12 | `src/knowledge/topic-discovery.ts:33` |
| `MAX_TOPIC_OVERLAP` | 0.5 | `src/knowledge/topic-discovery.ts:35` |
| `MIN_CONTINUATION_KEEP` | 200 | `src/knowledge/wiki-continuation.ts:16` |
| `EVIDENCE_MAX_FILES` | 15 | `src/knowledge/wiki-evidence.ts:14` |
| `EVIDENCE_MIN_FILES` | 3 | `src/knowledge/wiki-evidence.ts:16` |
| `WIKI_MAX_CONTINUATIONS` | 2 | `src/shared/constants.ts:6` |
| `WIKI_MAX_GREP_PROBES` | 12 | `src/shared/constants.ts:9` |

其中 **22 个**常量带有源码注释（`intent` 中 `kind = const-comment`），即作者亲写的「为什么有这个限制」，下文解读优先引用注释原文。

---

## 2. 逐项解读

### 2.1 仓库自检脚本：文件行数护栏

| 常量 | 值 | 锚点 | 约束对象 |
|---|---|---|---|
| `LIMIT` | 360 | `scripts/check-file-lines.mjs:9` | 单文件行数上限 |

`LIMIT = 360` 位于独立的自检脚本 `scripts/check-file-lines.mjs:9`，约束对象是**仓库内单个源文件的行数**——这是一道防止单文件规模膨胀（进而导致可读性与评审成本失控）的静态护栏。数据中未提供该常量的源码注释，其具体计行口径（是否含空行/注释行）与超限后的处置动作（告警或阻断）**待确认**。

### 2.2 CLI 交互：批量确认门槛

| 常量 | 值 | 锚点 |
|---|---|---|
| `BULK_THRESHOLD` | 15 | `src/cli/confirm-interaction.ts:14` |

> 注释原文：「待确认项超过此数时先问一次「逐项 / 全部保持」（防 Marathon 会话）」（`src/cli/confirm-interaction.ts:14`）

**防止的失控场景**：当待确认项数量超过 15 时，逐条交互会把会话拖成超长问答（作者称之为 "Marathon 会话"）。因此该常量把交互模式从「逐项」切换为先做一次策略选择（逐项 / 全部保持），把交互轮次从 O(n) 降为 O(1) + 可选展开。

### 2.3 Architecture / Modules 上下文的符号抽取配额

| 常量 | 值 | 锚点 | 注释原文 |
|---|---|---|---|
| `MODULE_SYMBOL_CANDIDATE_LIMIT` | 60 | `src/knowledge/context/architecture.ts:14` | 「每个生产包的图谱符号候选上限（分包查询，避免全局 Top N 挤占小模块）」（同锚点） |
| `ARCHITECTURE_SYMBOL_LIMIT` | 6 | `src/knowledge/context/architecture.ts:16` | 「Architecture 页每模块代表符号上限」（同锚点） |
| `MODULES_SYMBOL_LIMIT` | 10 | `src/knowledge/context/architecture.ts:18` | 「Modules 页每模块代表符号 / 代表文件上限」（同锚点） |
| `MODULES_SYMBOLS_PER_FILE_LIMIT` | 5 | `src/knowledge/context/architecture.ts:20` | 「Modules 页单个文件最多贡献的符号数（防单文件垄断）」（同锚点） |
| `MODULES_REPRESENTATIVE_FILE_LIMIT` | 12 | `src/knowledge/context/architecture.ts:21` | 无注释 |

解读：

- **`MODULE_SYMBOL_CANDIDATE_LIMIT = 60`（`src/knowledge/context/architecture.ts:14`）防止的是「大模块挤占小模块」**：注释明确说明查询是**按包（分包）**进行的，而不是做一次全局 Top N——若走全局排名，符号密集的大模块会把小模块的候选全部挤掉，导致小模块在架构页上「无符号可写」。
- **`ARCHITECTURE_SYMBOL_LIMIT = 6` 与 `MODULES_SYMBOL_LIMIT = 10` 是两个页面各自的表现层配额**（`src/knowledge/context/architecture.ts:16`、`:18`）：同一批符号在 Architecture 页每模块只展示 6 个，在 Modules 页每模块展示 10 个，并附带代表文件上限。这是**输出预算**约束，不是采集上限。
- **`MODULES_SYMBOLS_PER_FILE_LIMIT = 5`（`:20`）防止单文件垄断**：注释原文即「防单文件垄断」——若不做单文件配额，一个巨型文件（如集中式导出文件）会把该模块的 10 个符号配额全部吃掉，使模块画像退化为单文件画像。
- `MODULES_REPRESENTATIVE_FILE_LIMIT = 12`（`:21`）无注释，按命名约束的是 Modules 页每模块的代表文件条数。

### 2.4 Calls 上下文的入口锚定与边预算

| 常量 | 值 | 锚点 | 注释原文 |
|---|---|---|---|
| `CALLS_MIN_GROUPS` | 6 | `src/knowledge/context/calls.ts:13` | 「calls 页目标入口组数：入口组不足时以高扇入热点锚定回填（覆盖稀疏的主力补偿）」（同锚点） |
| `CALLS_EDGE_LIMIT` | 40 | `src/knowledge/context/calls.ts:15` | 「calls 页单次查询边数上限（BFS 每层两次查询各限此数）」（同锚点） |

解读：

- **`CALLS_MIN_GROUPS = 6`（`src/knowledge/context/calls.ts:13`）防止「入口稀疏导致 calls 页空转」**：当真实入口（如 CLI/HTTP handler/main）数量不足 6 组时，页面会退化为空或极稀疏；作者给出的补偿策略是**以高扇入热点锚定回填**，即用被调用最多的函数当作事实上的入口。这是「主力补偿」机制。
- **`CALLS_EDGE_LIMIT = 40`（`:15`）是查询侧的边数闸门**，注释给出了它的作用位置：BFS 的**每一层**执行两次查询，每次查询各限 40 条边。也就是说该常量不限制最终页面输出，而是限制**每次图谱查询的返回规模**，防止中心节点（高扇出函数）一次拉回整张图。

### 2.5 Data-flow：采集配额 + 构建配额 + 截断长度（三层防护）

**采集/上下文层**（`src/knowledge/context/data-flow.ts`）：

| 常量 | 值 | 锚点 | 注释原文 |
|---|---|---|---|
| `DATA_FLOW_FILE_LIMIT` | 30 | `src/knowledge/context/data-flow.ts:23` | 「data-flow 形态证据查询的文件数上限（防大仓库单查询爆炸）」（同锚点） |
| `DATA_FLOW_SYMBOL_LIMIT` | 200 | `src/knowledge/context/data-flow.ts:25` | 「data-flow 符号事实查询上限」（同锚点） |
| `DATA_FLOW_TYPE_LIMIT` | 60 | `src/knowledge/context/data-flow.ts:27` | 「data-flow 类型定义节点查询上限」（同锚点） |
| `MAX_DEPTH` | 3 | `src/knowledge/context/data-flow.ts:201` | 无注释 |
| `MAX_NODES` | 25 | `src/knowledge/context/data-flow.ts:202` | 无注释 |

`DATA_FLOW_FILE_LIMIT = 30`（`:23`）的注释直接点明失控场景——**「防大仓库单查询爆炸」**：形态证据查询如果没有文件数上限，在超大仓库上单次查询就会返回不可控规模的结果。

`MAX_DEPTH = 3` 与 `MAX_NODES = 25` 位于同文件 `:201`、`:202`，从命名与同文件上下文看约束的是**调用链/数据流的展开深度与节点总数**（即遍历的递归/图规模闸门），数据中未提供这两项的源码注释。

**构建/输出层**（`src/knowledge/dataflow/`）：

| 常量 | 值 | 锚点 | 注释原文 |
|---|---|---|---|
| `DATA_FLOW_MAX_STAGES` | 24 | `src/knowledge/dataflow/index.ts:60` | 「阶段上限（表格与 prompt 预算）」（同锚点） |
| `DATA_FLOW_MAX_TRANSITIONS` | 40 | `src/knowledge/dataflow/index.ts:62` | 「带数据证据的转换边上限」（同锚点） |
| `DATA_FLOW_MAX_IO_EVENTS` | 30 | `src/knowledge/dataflow/index.ts:64` | 「I/O 边界事件上限」（同锚点） |
| `DATA_FLOW_MAX_EXPRESSION` | 120 | `src/knowledge/dataflow/shapes.ts:9` | 「表达式截断长度」（同锚点） |
| `DATA_FLOW_MAX_TYPE_DEFS` | 20 | `src/knowledge/dataflow/type-defs.ts:11` | 「类型定义条数上限」（同锚点） |
| `DATA_FLOW_MAX_TYPE_TEXT` | 1200 | `src/knowledge/dataflow/type-defs.ts:13` | 「单条类型定义文本上限（字符）」（同锚点） |

解读：

- `DATA_FLOW_MAX_STAGES = 24`（`src/knowledge/dataflow/index.ts:60`）的注释写明它是**双重约束**：既限制表格行数（输出形态），也限制 **prompt 预算**（上下文规模）。这是「输出=输入」的典型耦合点：改这个值会同时改变页面表现与模型输入长度。
- `DATA_FLOW_MAX_TRANSITIONS = 40`（`:62`）关键在于限定词「**带数据证据的**」——它限制的是有证据支撑的转换边，而不是全部候选边；说明转换边要经过证据过滤后才受此上限约束（证据筛选逻辑本身不在本次数据范围内）。
- `DATA_FLOW_MAX_IO_EVENTS = 30`（`:64`）约束 I/O 边界事件数量。
- 三条**截断**类常量构成「长度防线」：表达式 120 字符（`src/knowledge/dataflow/shapes.ts:9`）、类型定义 20 条（`src/knowledge/dataflow/type-defs.ts:11`）、单条类型定义文本 1200 字符（`src/knowledge/dataflow/type-defs.ts:13`）。它们防的不是「数量爆炸」而是「**单条内容过长**」——数量上限之外还需要长度上限，否则一条超长联合类型就能吃掉整个 prompt 预算。

### 2.6 Git 意图采集：超时与历史深度

| 常量 | 值 | 锚点 | 注释原文 |
|---|---|---|---|
| `GIT_LOG_LIMIT` | 200 | `src/knowledge/intent/shared.ts:67` | 无注释 |
| `GIT_TIMEOUT_MS` | 15_000 | `src/knowledge/intent/shared.ts:68` | 无注释 |
| `REPO_LOG_LIMIT` | 400 | `src/knowledge/intent/shared.ts:74` | 无注释 |
| `CHURN_LOG_LIMIT` | 2000 | `src/knowledge/intent/shared.ts:76` | 「全仓 churn 排名用 log 上限（--name-only 批量一次；只取相对频次，无需全历史）」（同锚点） |

解读：

- `CHURN_LOG_LIMIT = 2000`（`src/knowledge/intent/shared.ts:76`）的注释是四者中唯一有原文的：「全仓 churn 排名用 log 上限（--name-only 批量一次；只取相对频次，无需全历史）」。它揭示了**有意的精度降级**：churn 排名只需要相对频次，因此作者用 `--name-only` 做一次批量查询，取 2000 条 log 即截断，而不是拉全量历史——这是一道以「相对排序不变性」为理由放弃完整性的上限。
- `GIT_LOG_LIMIT = 200`（`:67`）与 `REPO_LOG_LIMIT = 400`（`:74`）数值不同、位置相邻，按命名分别约束单次 git log 采集量与仓库级 log 采集量。
- `GIT_TIMEOUT_MS = 15_000`（`:68`）是本数据集中**唯一的超时类常量**，约束的是 git 子进程的墙钟超时：防止在超大仓库或 I/O 阻塞场景下 git 调用无限挂起，把整个知识生成流程拖死。其具体捕获/降级行为（超时后回退到什么结果）**待确认**。

### 2.7 大纲规划：候选池规模控制

| 常量 | 值 | 锚点 | 注释原文 |
|---|---|---|---|
| `MAX_FILES_PER_MODULE` | 15 | `src/knowledge/outline-planner.ts:38` | 「每模块候选文件上限（锚点候选池规模控制）」（同锚点） |
| `MAX_CANDIDATE_FILES` | 90 | `src/knowledge/outline-planner.ts:40` | 「全局候选文件上限」（同锚点） |

解读：这两条是**两级漏斗**——单模块 15 个、全局 90 个。注释点明其目的是「锚点候选池规模控制」：候选池若不做两级裁剪，大仓库会把所有文件都塞进规划阶段，使后续每一个页面的锚点选择成本随仓库规模线性上升。注意 90 与 15 并非整除关系（90 = 6 × 15），说明全局上限并非简单按模块数推导，而是独立闸门。

### 2.8 大纲与页面结构：章节/页数/长度约束

| 常量 | 值 | 锚点 | 注释原文 |
|---|---|---|---|
| `MAX_CHAPTERS` | 8 | `src/knowledge/outline.ts:80` | 无注释 |
| `MAX_PAGES_PER_CHAPTER` | 6 | `src/knowledge/outline.ts:81` | 无注释 |
| `MAX_OUTLINE_PAGES` | 16 | `src/knowledge/outline.ts:82` | 无注释 |
| `MIN_PAGE_FILES` | 3 | `src/knowledge/outline.ts:84` | 「与主题页 MIN_TOPIC_FILES 对齐：防章节页天然薄证据」（同锚点） |
| `MAX_PAGE_FILES` | 12 | `src/knowledge/outline.ts:85` | 无注释 |
| `MAX_TITLE_LEN` | 80 | `src/knowledge/outline.ts:89` | 无注释 |
| `MAX_SUMMARY_LEN` | 200 | `src/knowledge/outline.ts:90` | 无注释 |
| `MAX_BRIEF_LEN` | 2000 | `src/knowledge/outline.ts:91` | 无注释 |
| `MAX_SPAN_MODULES` | 3 | `src/knowledge/outline.ts:94` | 「页跨模块数超过该值视为杂烩页（W2）」（同锚点） |

解读：

- **结构上限存在冗余（说明是多重校验）**：`MAX_CHAPTERS = 8` × `MAX_PAGES_PER_CHAPTER = 6` = 48，远大于 `MAX_OUTLINE_PAGES = 16`（`src/knowledge/outline.ts:80`–`:82`）。三个值同时存在意味着全局页数 16 才是真正的硬上限，章节数与每章页数是**分配比例约束**，不是总量约束。
- **`MIN_PAGE_FILES = 3`（`:84`）的注释显式声明了跨模块对齐**：「与主题页 `MIN_TOPIC_FILES` 对齐：防章节页天然薄证据」。即该值必须与 `src/knowledge/topic-discovery.ts:32` 的 `MIN_TOPIC_FILES = 3` 保持一致——这是一条**跨文件耦合约束**，单独修改任一侧都会造成章节页与主题页的证据门槛不一致。
- **`MAX_SPAN_MODULES = 3`（`:94`）是一道语义质量护栏，而非性能护栏**：注释原文「页跨模块数超过该值视为杂烩页（W2）」。它约束的是页面主题聚焦度：跨 3 个以上模块的页面被判定为「杂烩页」，标记代号为 W2。
- 三条长度上限（标题 80 `:89`、摘要 200 `:90`、简介 2000 `:91`）作用于大纲的文本字段；其中 `MAX_BRIEF_LEN = 2000` 与 `MAX_SUMMARY_LEN = 200` 相差 10 倍，对应「简介」与「摘要」两种不同密度字段。

### 2.9 Fallback 源码回退：符号名与签名长度

| 常量 | 值 | 锚点 | 约束对象 |
|---|---|---|---|
| `MAX_NAMES` | 40 | `src/knowledge/source-fallback.ts:24` | 符号名条数 |
| `MAX_SIGNATURE_LEN` | 160 | `src/knowledge/source-fallback.ts:26` | 单个签名文本长度 |

两条常量均无注释。按文件路径 `source-fallback.ts` 与命名，它们约束的是**回退路径**（当图谱/上下文数据不可用、只能从源码直接抽取时）输出的符号名数量与签名截断长度；`MAX_SIGNATURE_LEN = 160`（`:26`）与 Data-flow 的表达式截断 120（`src/knowledge/dataflow/shapes.ts:9`）同属截断类防护，但阈值不同，说明不同输出面有各自的长度预算。

### 2.10 主题发现：聚类质量与规模闸门

| 常量 | 值 | 锚点 | 约束对象 |
|---|---|---|---|
| `MAX_TOPICS` | 4 | `src/knowledge/topic-discovery.ts:29` | 主题数量上限 |
| `MIN_CLUSTER_MEMBERS` | 5 | `src/knowledge/topic-discovery.ts:30` | 聚类最小成员数 |
| `MIN_TOPIC_FILES` | 3 | `src/knowledge/topic-discovery.ts:32` | 主题最少文件数 |
| `MAX_TOPIC_FILES` | 12 | `src/knowledge/topic-discovery.ts:33` | 主题最多文件数 |
| `MAX_TOPIC_OVERLAP` | 0.5 | `src/knowledge/topic-discovery.ts:35` | 主题间最大重叠比例 |

解读：这是一组**质量闸门**而非性能闸门。`MIN_CLUSTER_MEMBERS = 5`（`:30`）与 `MIN_TOPIC_FILES = 3`（`:32`）组合过滤掉过小的噪声聚类；`MAX_TOPIC_FILES = 12`（`:33`）防止单个主题吞并全部文件；`MAX_TOPIC_OVERLAP = 0.5`（`:35`）是本数据集中**唯一的比例型阈值**，约束两个主题的文件集合重叠度不得超过 50%——防止产出高度同质的重复主题。`MAX_TOPICS = 4`（`:29`）是最终产出数量的硬上限。

其中 `MIN_TOPIC_FILES = 3` 与 `src/knowledge/outline.ts:84` 的 `MIN_PAGE_FILES = 3` 构成前述的跨文件对齐关系（依据 `src/knowledge/outline.ts:84` 注释原文）。

### 2.11 Wiki 续写与证据：预算与阈值

| 常量 | 值 | 锚点 | 约束对象 |
|---|---|---|---|
| `MIN_CONTINUATION_KEEP` | 200 | `src/knowledge/wiki-continuation.ts:16` | 续写保留的最小内容量 |
| `EVIDENCE_MAX_FILES` | 15 | `src/knowledge/wiki-evidence.ts:14` | 证据文件数上限 |
| `EVIDENCE_MIN_FILES` | 3 | `src/knowledge/wiki-evidence.ts:16` | 证据文件数下限 |
| `WIKI_MAX_CONTINUATIONS` | 2 | `src/shared/constants.ts:6` | 续写轮次上限 |
| `WIKI_MAX_GREP_PROBES` | 12 | `src/shared/constants.ts:9` | grep 探测次数上限 |

解读：

- **`WIKI_MAX_CONTINUATIONS = 2`（`src/shared/constants.ts:6`）是一道循环终止闸门**：它把「生成 → 证据不足 → 续写」的控制流限制在 2 轮内，防止续写不收敛。与之配套，`MIN_CONTINUATION_KEEP = 200`（`src/knowledge/wiki-continuation.ts:16`）设定了每轮续写至少要保住的内容量，避免续写反而把已有内容越写越少。
- `WIKI_MAX_GREP_PROBES = 12`（`src/shared/constants.ts:9`）约束为补证据而执行的 grep 探测次数，这是**昂贵的 I/O 操作预算**——它与续写轮次上限一起构成「证据补全」这一循环的双重成本控制。
- `EVIDENCE_MIN_FILES = 3`（`src/knowledge/wiki-evidence.ts:16`）与 `EVIDENCE_MAX_FILES = 15`（`:14`）构成证据区间：少于 3 个文件视为证据不足（触发续写），最多采 15 个文件。注意此处的下限 3 与 `MIN_TOPIC_FILES`（`src/knowledge/topic-discovery.ts:32`）、`MIN_PAGE_FILES`（`src/knowledge/outline.ts:84`）数值一致，是全项目反复出现的「3 文件最小证据单元」。

---

## 3. 复杂度热点

数据提供 20 个热点函数（`complexity` 与 `loopDepth` 均为原始数据值）。按复杂度降序排列如下：

| 函数 | 源文件 | 复杂度 | 循环深度 |
|---|---|---|---|
| `buildByName` | `src/knowledge/fallback/index.ts` | 30 | 0 |
| `buildCallsContext` | `src/knowledge/context/calls.ts` | 14 | 2 |
| `buildDataFlowContext` | `src/knowledge/context/data-flow.ts` | 11 | 2 |
| `buildArchitecture` | `src/knowledge/fallback/structure.ts` | 10 | 1 |
| `buildCallChainFromEdges` | `src/knowledge/context/data-flow.ts` | 10 | 2 |
| `buildComponentsContext` | `src/knowledge/context/frontend.ts` | 8 | 1 |
| `applyConfirmations` | `src/knowledge/confirmation/apply.ts` | 7 | 1 |
| `assembleSections` | `src/knowledge/wiki-continuation.ts` | 6 | 1 |
| `buildApi` | `src/knowledge/fallback/surface.ts` | 6 | 0 |
| `buildApiContext` | `src/knowledge/context/modules-api.ts` | 5 | 1 |
| `buildClasses` | `src/knowledge/fallback/reference.ts` | 5 | 1 |
| `buildDataFlow` | `src/knowledge/fallback/data-flow.ts` | 5 | 1 |
| `adaptSide` | `src/mcp/codebase-memory-client.ts` | 4 | 2 |
| `adaptTrace` | `src/mcp/codebase-memory-client.ts` | 4 | 2 |
| `applyCrossPageActions` | `src/knowledge/crosspage/actions.ts` | 4 | 1 |
| `buildCalls` | `src/knowledge/fallback/reference.ts` | 4 | 1 |
| `buildChapterPage` | `src/knowledge/fallback/topic.ts` | 4 | 0 |
| `buildCli` | `src/knowledge/fallback/meta-ops.ts` | 4 | 1 |
| `buildConstraints` | `src/knowledge/fallback/meta.ts` | 4 | 0 |
| `buildConventions` | `src/knowledge/fallback/meta.ts` | 4 | 1 |

### 3.1 头部热点深入分析

**`buildByName` — 复杂度 30，循环深度 0（`src/knowledge/fallback/index.ts`）**

全数据集最高复杂度，且**循环深度为 0**。这两个信号组合起来指向一种特定形态：复杂度不来自嵌套迭代，而来自平铺的**分支枚举**（大量 if/else-if 或 switch 分派）。潜在风险：

- 30 的分支规模意味着单函数的判定路径已接近人工审查的极限，任何新增一种「按名查询」的形态都会继续推高该值。
- 循环深度 0 说明它本身不遍历，那么它的输入规模风险落在**被它调用的下游**——一旦下游返回集合，分支内仍需做取舍。
- 重构方向（推断）：把平铺分支按「查询维度」提取为分派表（映射 → 处理器），使每个分支成为独立可测单元。此推断依据是复杂度 30 与循环深度 0 的结构特征，非来自注释或提交信息。

**`buildCallsContext` — 复杂度 14，循环深度 2（`src/knowledge/context/calls.ts`）**

同文件定义了 `CALLS_MIN_GROUPS = 6`（`src/knowledge/context/calls.ts:13`）与 `CALLS_EDGE_LIMIT = 40`（`:15`）。热点函数与两个限制常量同文件，说明**该函数的复杂度主要来自「配额管理」**：入口组不足时要走「高扇入热点锚定回填」（`:13` 注释原文），BFS 每层两次查询各限 40 条边（`:15` 注释原文）。潜在风险：BFS 深度 2 的循环叠加 14 的分支量，任何对回填策略的调整都要同时验证多组配额；这是最容易被单点改动破坏的模块。重构方向（推断）：将「入口选择 / 回填 / 边裁剪」拆为三个纯函数，配额作为显式参数传入。

**`buildDataFlowContext` — 复杂度 11，循环深度 2（`src/knowledge/context/data-flow.ts`）**

同文件包含三个采集配额（`:23` 文件 30、`:25` 符号 200、`:27` 类型 60）以及 `MAX_DEPTH = 3` / `MAX_NODES = 25`（`:201`–`:202`）。该函数是**五个数值约束的交汇点**：改动任一配额都需要在此处验证行为。循环深度 2 与 `MAX_DEPTH = 3`、`MAX_NODES = 25` 的组合意味着嵌套遍历必须在双重闸门下收敛，是最容易在边界数据上出现非预期裁剪的位置。

**`buildArchitecture` — 复杂度 10，循环深度 1（`src/knowledge/fallback/structure.ts`）**

与 `src/knowledge/context/architecture.ts:14`–`:21` 的五个配额常量（`MODULE_SYMBOL_CANDIDATE_LIMIT` 60、`ARCHITECTURE_SYMBOL_LIMIT` 6、`MODULES_SYMBOL_LIMIT` 10、`MODULES_SYMBOLS_PER_FILE_LIMIT` 5、`MODULES_REPRESENTATIVE_FILE_LIMIT` 12）处于**不同文件**。跨文件的配额-实现分离意味着修改架构页展示量时，改动点与验证点不在同一文件，是典型的高代价改动路径。

**`buildCallChainFromEdges` — 复杂度 10，循环深度 2（`src/knowledge/context/data-flow.ts`）**

与 `buildDataFlowContext` 同文件，同为循环深度 2。两者同时出现在 data-flow 上下文中，说明该模块的复杂度集中在**图遍历 + 配额裁剪**，而非单点逻辑错误。

### 3.2 次级热点

| 函数 | 复杂度 | 关注点 |
|---|---|---|
| `buildComponentsContext` | 8 | `src/knowledge/context/frontend.ts`，前端上下文聚合 |
| `applyConfirmations` | 7 | `src/knowledge/confirmation/apply.ts`，与应用确认逻辑相关；`src/cli/confirm-interaction.ts:14` 的 `BULK_THRESHOLD = 15` 属于交互侧，两者文件不同 |
| `assembleSections` | 6 | `src/knowledge/wiki-continuation.ts`，同文件定义 `MIN_CONTINUATION_KEEP = 200`（`:16`） |
| `buildApi` | 6 | `src/knowledge/fallback/surface.ts`，复杂度 6 但循环深度 0 |

`assembleSections`（`src/knowledge/wiki-continuation.ts`）与其同文件的 `MIN_CONTINUATION_KEEP = 200`（`src/knowledge/wiki-continuation.ts:16`）构成「续写保留量」的唯一落点，改动续写策略会同时触及该函数与该常量。

### 3.3 复杂度分布观察

- **fallback 系列函数普遍偏低**：`buildCalls`、`buildClasses`、`buildChapterPage`、`buildCli`、`buildConstraints`、`buildConventions`、`buildDataFlow` 均在 4–5 区间，唯一的例外是 `buildByName`（30）。这说明 `src/knowledge/fallback/index.ts` 是 fallback 体系中的**单点复杂度孤岛**。
- **context 系列是复杂度重心**：14、11、10、10、8、5 六个函数集中在 `src/knowledge/context/` 目录，且循环深度多为 2，与 §2.3–§2.5 的配额常量高度吻合。
- **`src/mcp/codebase-memory-client.ts` 的 `adaptSide` / `adaptTrace` 复杂度均仅 4，但循环深度为 2**：适配层本身逻辑不复杂，却带两层循环，提示其复杂度来自**数据形态转换的嵌套遍历**（对外部 MCP 返回结构做适配）。

---

## 4. 已知边界

综合限制常量与复杂度数据，项目的硬边界集中在以下位置：

**（1）证据充分性的下限反复锁定在「3 文件」**
`MIN_TOPIC_FILES = 3`（`src/knowledge/topic-discovery.ts:32`）、`MIN_PAGE_FILES = 3`（`src/knowledge/outline.ts:84`）、`EVIDENCE_MIN_FILES = 3`（`src/knowledge/wiki-evidence.ts:16`）三处取值相同，且 `src/knowledge/outline.ts:84` 的注释明确要求「与主题页 `MIN_TOPIC_FILES` 对齐」。这是全项目最紧的耦合边界：**任何下调此门槛都会同时影响主题、大纲、证据三条链路**。

**（2）data-flow 是配额最密集的模块**
`src/knowledge/context/data-flow.ts`（`:23`、`:25`、`:27`、`:201`、`:202`）、`src/knowledge/dataflow/index.ts`（`:60`、`:62`、`:64`）、`src/knowledge/dataflow/shapes.ts`（`:9`）、`src/knowledge/dataflow/type-defs.ts`（`:11`、`:13`）合计 **11 个常量**，并有 2 个循环深度 2 的高复杂度函数（`buildDataFlowContext` 复杂度 11、`buildCallChainFromEdges` 复杂度 10）。这是改动代价最高的区域。

**（3）页码结构上限存在冗余校验**
`MAX_CHAPTERS = 8` × `MAX_PAGES_PER_CHAPTER = 6` = 48 与 `MAX_OUTLINE_PAGES = 16`（`src/knowledge/outline.ts:80`–`:82`）不一致，说明总量由全局值兜底。修改章节/页数配比时必须同时确认这三个值，否则可能出现「章节配额未满但全局已截断」的静默行为。

**（4）输出预算与模型输入预算耦合**
`DATA_FLOW_MAX_STAGES = 24` 的注释明确写着它同时约束「表格与 prompt 预算」（`src/knowledge/dataflow/index.ts:60`）。这意味着若干限制常量不是单纯的展示层参数，而是**上下文预算参数**——改动它们会直接改变送入模型的内容量。

**（5）最脆弱的单点**
`buildByName`（`src/knowledge/fallback/index.ts`）复杂度 30、循环深度 0：它是全项目复杂度最高的函数，且位于 fallback 体系中唯一的高复杂度位置。若出现问题，其 30 条分支路径使二分排查困难。

**（6）唯一的超时护栏只有一处**
`GIT_TIMEOUT_MS = 15_000`（`src/knowledge/intent/shared.ts:68`）是数据中**唯一的超时常量**。除 git 调用外的其他外部交互（如 `src/mcp/codebase-memory-client.ts` 对应的 MCP 客户端）在本次数据中**未检测到**超时配置，其超时行为**待确认**。

---

## 5. 待确认清单

| 项 | 缺什么证据 |
|---|---|
| `scripts/check-file-lines.mjs:9` 的 `LIMIT = 360` | 无 const-comment，缺计行口径（是否含空行/注释）与超限后是告警还是阻断的证据 |
| `GIT_TIMEOUT_MS`（`src/knowledge/intent/shared.ts:68`）超时后的行为 | 无 const-comment，缺超时后回退/降级路径的证据 |
| `MAX_DEPTH = 3` / `MAX_NODES = 25`（`src/knowledge/context/data-flow.ts:201`–`:202`） | 无 const-comment，缺这两项所约束的具体遍历对象（调用链还是数据流图）的证据 |
| 非 git 外部交互的超时配置 | 数据中仅检测到一处超时常量，缺 MCP 客户端等外部调用的超时证据 |
| `MODULES_REPRESENTATIVE_FILE_LIMIT = 12`（`src/knowledge/context/architecture.ts:21`） | 无 const-comment，缺「代表文件」选取标准的证据 |
## Related

- 同目录：[conventions.md](conventions.md)
- 共享 5 个源文件、共享 110 个符号：[troubleshooting.md](../05-guides/troubleshooting.md)
- 共享 4 个源文件、共享 14 个符号：[modules.md](../02-architecture/modules.md)
- 共享 4 个源文件、共享 9 个符号：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)
