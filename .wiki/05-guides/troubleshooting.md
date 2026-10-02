# 故障排除

<details>
<summary>Relevant source files</summary>

- package.json
- scripts/check-file-lines.mjs
- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/config-detector/detector.ts
- src/knowledge/config-detector/index.ts
- src/knowledge/confirmation/index.ts
- src/knowledge/context/architecture.ts
- src/knowledge/context/calls.ts
- src/knowledge/context/cli.ts
- src/knowledge/context/data-flow.ts
</details>

本页职责：汇总该 CLI 项目在**环境准备、构建、运行时、调试**四个阶段的可操作排障信息，所有结论均锚定到源码文件或数据字段，便于开发者按症状快速定位。

---

## 一、环境问题

### 1.1 包管理器：必须使用 pnpm

| 项目 | 值 | 锚点 |
| --- | --- | --- |
| 声明包管理器 | `pnpm` | `packageManager` 字段 |
| 构建命令入口 | `tsup` | `scripts.build` |
| 类型检查命令入口 | `tsc --noEmit && node scripts/check-file-lines.mjs` | `scripts.lint` |

**问题描述**
使用 `npm install` 或 `yarn install` 安装后，出现依赖树与预期不一致、`tsup` / `vitest` 可执行文件找不到（`command not found`）或构建产物行为异常。

**原因分析**
项目在 `packageManager` 字段中明确声明使用 `pnpm`。混用其它包管理器时，安装布局（尤其是 `node_modules/.bin` 的软链接结构）与 lockfile 语义不同，会导致 `scripts.build`（`tsup`）、`scripts.test`（`vitest run`）这类直接调用二进制名的命令解析失败。

**解决方案**

```bash
# 清理后使用 pnpm 重装
rm -rf node_modules
pnpm install

# 若本机没有 pnpm，先安装
npm i -g pnpm
pnpm install
```

### 1.2 Node 版本：数据未声明

| 项目 | 值 |
| --- | --- |
| `nodeVersion` | （空字符串） |

数据中 `nodeVersion` 为空，无法给出该项目要求的最低/推荐 Node 版本。**待确认**：缺少 `.nvmrc` / `engines` 字段的采集结果，无法判断运行时版本约束。

若遇到依赖安装报错（例如原生模块编译失败、`ERR_UNKNOWN_FILE_EXTENSION`（待确认）），需先自行核对 Node 版本是否满足 `tsup` / `vitest` / `ai` 的版本要求。

### 1.3 环境变量：`CODEBASE_MEMORY_MCP_BINARY`

| 变量名 | 是否敏感 | 生产源码锚点 |
| --- | --- | --- |
| `CODEBASE_MEMORY_MCP_BINARY` | 否 | `src/mcp/codebase-memory-client.ts` |

**问题描述**
运行 CLI 时，涉及 `mcp` 模块的能力调用失败，报错指向 MCP 客户端（二进制/Target Binary 相关）。

**原因分析**
`src/mcp/codebase-memory-client.ts` 读取 `CODEBASE_MEMORY_MCP_BINARY` 环境变量来定位 MCP 可执行文件。该变量未设置或指向不存在的路径时，客户端无法启动目标进程。

**解决方案**

```bash
# 显式指定 MCP 二进制路径后再运行
export CODEBASE_MEMORY_MCP_BINARY=/absolute/path/to/codebase-memory-mcp
pnpm build
```

注意：该变量在数据中标记为**非敏感**，可以安全地写在 shell profile 或 CI 环境变量配置中；但请使用**绝对路径**，避免相对路径因工作目录切换而失效。

### 1.4 依赖使用证据一览（安装缺失时的定位依据）

下表列出每个第三方依赖在源码中的真实使用点，用于判断"依赖装没装全"：

| 依赖 | usageKind | 使用点（import 锚点） |
| --- | --- | --- |
| `commander` | import | `src/cli/commands/build.ts`、`src/cli/commands/init.ts`、`src/cli/commands/scan.ts`、`src/cli/index.ts` |
| `@ai-sdk/openai` | import | `src/knowledge/generator/index.ts`、`src/knowledge/generator/shared.ts` |
| `ai` | import | `src/knowledge/generator/shared.ts` |
| `@clack/prompts` | import | `src/cli/confirm-interaction.ts` |
| `ignore` | import | `src/core/scanner.ts` |
| `yaml` | import | `src/shared/config.ts` |
| `tsup` | import | `tsup.config.ts` |
| `vitest` | import | `vitest.config.ts` |
| `typescript` | none | 无 import 点；实际使用点为 `scripts.lint` 中的 `tsc --noEmit` 命令 |
| `@types/node` | none | 无 import 点；作为类型声明包被 `tsconfig` 消费（数据未提供 tsconfig 内容，无法进一步锚定） |

**排障要点**：当 CLI 启动即报 `Cannot find module 'commander'`，说明 `src/cli/index.ts` 的依赖链未安装完整 → `pnpm install`；当代码生成阶段报 `@ai-sdk/openai` / `ai` 解析失败，说明 AI 生成链（`src/knowledge/generator/*`）的依赖缺失 → 同样执行 `pnpm install`。

> **待确认**：`@ai-sdk/openai` 与 `ai` 在 `src/knowledge/generator/shared.ts` 中被导入，但数据中的 `envVars` 只提供了 `CODEBASE_MEMORY_MCP_BINARY` 一项，**未提供任何模型凭据类环境变量**。若生成阶段出现鉴权类报错，本项目数据无法指定应配置哪个变量，需要查阅 `src/knowledge/generator/shared.ts` 源码确认。

---

## 二、构建问题

### 2.1 构建命令速查

| 场景 | 命令 | 锚点 |
| --- | --- | --- |
| 一次性构建 | `pnpm build` → `tsup` | `scripts.build` |
| 监听构建 | `pnpm dev` → `tsup --watch` | `scripts.dev` |
| 类型检查 + 文件行数守卫 | `pnpm lint` → `tsc --noEmit && node scripts/check-file-lines.mjs` | `scripts.lint` |
| 跑测试 | `pnpm test` → `vitest run` | `scripts.test` |

### 2.2 TypeScript 编译失败（`tsc --noEmit` 报错）

**问题描述**
`pnpm lint` 第一阶段 `tsc --noEmit` 报类型错误，即使 `pnpm build`（`tsup`）能产出文件。

**原因分析**
`scripts.lint` 明确串联了 `tsc --noEmit`，即对全仓库做类型检查；`tsup` 默认走 esbuild 转译，**不做完整类型检查**。因此"能构建"不代表"类型正确"，类型错误只在 lint 阶段暴露。

**解决方案**

```bash
# 单独跑类型检查，拿到完整错误列表
pnpm exec tsc --noEmit

# 修复后完整跑 lint
pnpm lint
```

常见触发点集中在被改了签名却未同步调用方的模块；`src/knowledge/` 下的上下文构建模块（`src/knowledge/context/architecture.ts`、`src/knowledge/context/calls.ts`、`src/knowledge/context/data-flow.ts`、`src/knowledge/context/modules-api.ts`）以及 `src/shared/utils.ts`（见 3.5 的高频变更热点）是优先排查区。

### 2.3 文件行数守卫失败（`check-file-lines.mjs`）

**问题描述**
`pnpm lint` 第一阶段类型检查通过，但第二阶段 `node scripts/check-file-lines.mjs` 以非零码退出，报某个文件超长。

**原因分析**
`scripts.check-file-lines.mjs` 中定义了行数上限常量 `LIMIT`，值为 `360`（`scripts/check-file-lines.mjs:9`）。这是仓库的工程约束脚本，属于 `check-file-lines` 模块。

**解决方案**

```bash
# 单独运行守卫脚本，查看具体违规文件
node scripts/check-file-lines.mjs
```

处理方式二选一：拆分超长文件（推荐），或在明确评估后调整 `scripts/check-file-lines.mjs:9` 的 `LIMIT` 值。注意不得盲目调高，因为该常量本身就是团队约定的上限。

### 2.4 ESM / CJS 互操作与打包格式

**问题描述**
构建成功但运行时报 `ERR_REQUIRE_ESM`（待确认） / `require() of ES Module not supported`，或动态导入失败。

**原因分析**
项目的运行时依赖中包含 `commander`（`src/cli/index.ts` 等 4 处）、`@clack/prompts`（`src/cli/confirm-interaction.ts`）、`ai`（`src/knowledge/generator/shared.ts`）、`@ai-sdk/openai`（`src/knowledge/generator/index.ts`、`src/knowledge/generator/shared.ts`）等交互与 AI SDK 依赖。打包格式（ESM/CJS）与这些依赖的模块形式不匹配时，会在**运行期**而非构建期爆发。

**解决方案**

```bash
# 先确认构建配置的实际输出格式
cat tsup.config.ts
pnpm build
```

`tsup` 的配置取自 `tsup.config.ts`（`tsup` 在该文件中被导入）。若产物格式与依赖期望不一致，需修改该配置文件后重新 `pnpm build`，并重点验证 CLI 入口 `src/cli/index.ts` 能否启动。

> 推断：上述"格式不匹配导致运行期报错"的因果链，是基于 `tsup.config.ts` 中导入了 `tsup`、且运行时依赖通过 import 点被实际加载（见 `depUsage`）推断得出；数据未提供 `tsup.config.ts` 的具体内容与 `package.json` 的 `type` 字段，具体格式需打开该文件确认。

### 2.5 监听构建（watch）下的陈旧产物

**问题描述**
`pnpm dev` 运行中改了源码，但 CLI 行为没变。

**原因分析**
`scripts.dev` 为 `tsup --watch`，只负责重新构建产物；如果运行的是已安装/已链接的旧产物路径，则不会生效。

**解决方案**

```bash
pnpm dev        # 终端 A：持续监听构建
# 终端 B：每次重建后重新执行产物，避免复用旧进程
```

---

## 三、运行时问题

### 3.1 MCP 客户端依赖缺失（最常见的外部依赖问题）

**问题描述**
CLI 执行到需要 MCP 能力的流程时失败；报错信息指向找不到可执行文件或进程启动失败。

**原因分析**
`src/mcp/codebase-memory-client.ts` 依赖环境变量 `CODEBASE_MEMORY_MCP_BINARY` 指定的外部二进制。该二进制**不属于本仓库的 npm 依赖**，`pnpm install` 不会安装它。这是本项目的关键外部前置条件。

**解决方案**

1. 确认变量已设置且路径存在：
   ```bash
   echo "$CODEBASE_MEMORY_MCP_BINARY"
   ls -l "$CODEBASE_MEMORY_MCP_BINARY"
   ```
2. 确认文件具备可执行权限：`chmod +x "$CODEBASE_MEMORY_MCP_BINARY"`
3. 若确实未安装该 MCP 程序，需先行安装对应二进制后再设置变量；未安装期间，与 MCP 相关的功能不可用。
4. 该文件是高频变更热点（6 次提交，最近 `commit:e1a30092`，2026-10-01「feat: 升级断言校验为证据分类核验（点链匹配/注释提及识别/同名歧义统计）并试点 topic 页证据引用」），排障时优先确认本地代码版本与该提交描述的行为是否一致。

### 3.2 限制常量触界症状（知识生成链）

> 推断：以下"触界症状"由常量名 + 定义文件路径 + 所属模块语义推断得出，**非源码注释证据**；常量值本身是数据集原值，可放心引用。

#### 3.2.1 架构上下文裁剪（`src/knowledge/context/architecture.ts`）

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `MODULE_SYMBOL_CANDIDATE_LIMIT` | 60 | `src/knowledge/context/architecture.ts:14` | 候选符号过多，超出部分的符号不会进入架构页；表现为"某些模块的符号在架构页消失" |
| `ARCHITECTURE_SYMBOL_LIMIT` | 6 | `src/knowledge/context/architecture.ts:16` | 架构页中展示的符号被截断为 6 个，符号-rich 模块展示不全 |
| `MODULES_SYMBOL_LIMIT` | 10 | `src/knowledge/context/architecture.ts:18` | 模块页符号数量上限触顶，尾部符号丢失 |
| `MODULES_SYMBOLS_PER_FILE_LIMIT` | 5 | `src/knowledge/context/architecture.ts:20` | 单文件最多贡献 5 个符号，大文件只暴露前 5 个 |
| `MODULES_REPRESENTATIVE_FILE_LIMIT` | 12 | `src/knowledge/context/architecture.ts:21` | 代表文件列表被截断为 12 个，超大模块的代表文件覆盖不全 |

```bash
# 排障命令：确认这些上限在哪些路径生效
grep -rn "ARCHITECTURE_SYMBOL_LIMIT\|MODULES_SYMBOL_LIMIT" src/knowledge/context/architecture.ts
```

#### 3.2.2 调用关系图裁剪（`src/knowledge/context/calls.ts`）

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `CALLS_MIN_GROUPS` | 6 | `src/knowledge/context/calls.ts:13` | 调用分组数不足 6 组时，调用页可能不生成/退化为空章节 |
| `CALLS_EDGE_LIMIT` | 40 | `src/knowledge/context/calls.ts:15` | 调用边被裁到 40 条，大型仓库的调用关系图明显不完整 |

#### 3.2.3 数据流分析裁剪

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `DATA_FLOW_FILE_LIMIT` | 30 | `src/knowledge/context/data-flow.ts:23` | 参与数据流的文件被截断，部分文件不参与分析 |
| `DATA_FLOW_SYMBOL_LIMIT` | 200 | `src/knowledge/context/data-flow.ts:25` | 数据流符号池上限，超出后符号不再被追踪 |
| `DATA_FLOW_TYPE_LIMIT` | 60 | `src/knowledge/context/data-flow.ts:27` | 类型节点最多 60 个，类型繁多时关联缺失 |
| `MAX_DEPTH` | 3 | `src/knowledge/context/data-flow.ts:201` | 数据流追踪深度只有 3 层，深层链路被截断（症状：数据流"中途断掉"） |
| `MAX_NODES` | 25 | `src/knowledge/context/data-flow.ts:202` | 单次数据流图节点上限 25，大流程被砍 |
| `DATA_FLOW_MAX_STAGES` | 24 | `src/knowledge/dataflow/index.ts:60` | 阶段数超 24 时阶段表被截断 |
| `DATA_FLOW_MAX_TRANSITIONS` | 40 | `src/knowledge/dataflow/index.ts:62` | 状态/阶段迁移条目超 40 被裁 |
| `DATA_FLOW_MAX_IO_EVENTS` | 30 | `src/knowledge/dataflow/index.ts:64` | I/O 事件超 30 被裁 |
| `DATA_FLOW_MAX_EXPRESSION` | 120 | `src/knowledge/dataflow/shapes.ts:9` | 表达式文本被截断到 120 字符（症状：表达式显示不完整） |
| `DATA_FLOW_MAX_TYPE_DEFS` | 20 | `src/knowledge/dataflow/type-defs.ts:11` | 类型定义最多 20 个 |
| `DATA_FLOW_MAX_TYPE_TEXT` | 1200 | `src/knowledge/dataflow/type-defs.ts:13` | 类型文本被截到 1200 字符 |

#### 3.2.4 模块 API 详情（`src/knowledge/context/modules-api.ts`）

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `MODULE_DETAIL_LIMIT` | 12 | `src/knowledge/context/modules-api.ts:24` | 模块 API 详情条目上限 12，导出项多的模块被截断 |

#### 3.2.5 大纲与页面规划（最影响"页面数量不如预期"的一类）

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `MAX_FILES_PER_MODULE` | 15 | `src/knowledge/outline-planner.ts:38` | 单模块最多纳入 15 个文件，巨型模块文件被丢弃 |
| `MAX_CANDIDATE_FILES` | 90 | `src/knowledge/outline-planner.ts:40` | 候选文件池上限 90；仓库超过此规模时，**后半部分文件不会出现在大纲里** |
| `MAX_CHAPTERS` | 8 | `src/knowledge/outline.ts:80` | 章节数上限 8 |
| `MAX_PAGES_PER_CHAPTER` | 6 | `src/knowledge/outline.ts:81` | 单章最多 6 页 |
| `MAX_OUTLINE_PAGES` | 16 | `src/knowledge/outline.ts:82` | **总页数硬上限 16**；症状是"无论仓库多大，产物页数卡在 16" |
| `MIN_PAGE_FILES` | 3 | `src/knowledge/outline.ts:84` | 少于 3 个文件的页被过滤（症状：小模块"没有页面"） |
| `MAX_PAGE_FILES` | 12 | `src/knowledge/outline.ts:85` | 单页最多引用 12 个文件 |
| `MAX_TITLE_LEN` | 80 | `src/knowledge/outline.ts:89` | 标题超 80 字符被截断 |
| `MAX_SUMMARY_LEN` | 200 | `src/knowledge/outline.ts:90` | 摘要超 200 字符被截断 |
| `MAX_BRIEF_LEN` | 2000 | `src/knowledge/outline.ts:91` | 页面 brief 超 2000 字符被截断 |
| `MAX_SPAN_MODULES` | 3 | `src/knowledge/outline.ts:94` | 单页最多跨 3 个模块 |

#### 3.2.6 主题发现（`src/knowledge/topic-discovery.ts`）

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `MAX_TOPICS` | 4 | `src/knowledge/topic-discovery.ts:29` | 主题数上限 4 |
| `MIN_CLUSTER_MEMBERS` | 5 | `src/knowledge/topic-discovery.ts:30` | 簇成员少于 5 个不成主题（症状：主题数为 0） |
| `MIN_TOPIC_FILES` | 3 | `src/knowledge/topic-discovery.ts:32` | 主题最少 3 个文件 |
| `MAX_TOPIC_FILES` | 12 | `src/knowledge/topic-discovery.ts:33` | 主题最多 12 个文件 |

| `MAX_TOPIC_OVERLAP` | 0.5 | `src/knowledge/topic-discovery.ts:35` | 主题间文件重叠率超过 0.5 时被判为重复主题，症状：期望的主题被合并/丢弃 |

#### 3.2.7 证据收集与续写（`src/knowledge/wiki-evidence.ts` / `src/knowledge/wiki-continuation.ts` / `src/shared/constants.ts`）

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `EVIDENCE_MAX_FILES` | 15 | `src/knowledge/wiki-evidence.ts:14` | 单页证据文件超 15 个被裁 |
| `EVIDENCE_MIN_FILES` | 3 | `src/knowledge/wiki-evidence.ts:16` | 证据文件少于 3 个的页会被判为证据不足，症状：页面被丢弃或降级 |
| `MIN_CONTINUATION_KEEP` | 200 | `src/knowledge/wiki-continuation.ts:16` | 续写保留阈值；低于 200 的内容在续写时不保留，症状：续写后前文丢失 |
| `WIKI_MAX_CONTINUATIONS` | 2 | `src/shared/constants.ts:6` | 单页最多续写 2 次；症状：长页面在续写 2 次后被硬截断，尾部内容缺失 |
| `WIKI_MAX_GREP_PROBES` | 12 | `src/shared/constants.ts:9` | 证据核验的 grep 探针最多 12 次；症状：证据核验中途停止，部分断言未核验 |

**统一排障思路**：当产物"看起来不够全"时，先区分是**数据本身没有**还是**被上限截断**。可按下表定位：

```bash
# 逐个确认上限常量在源码中的实际使用位置与裁剪分支
grep -rn "MAX_OUTLINE_PAGES\|MAX_CANDIDATE_FILES\|DATA_FLOW_MAX_STAGES" src/knowledge
```

#### 3.2.8 源码回退路径（`src/knowledge/source-fallback.ts`）

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `MAX_NAMES` | 40 | `src/knowledge/source-fallback.ts:24` | 回退列举的名称最多 40 个 |
| `MAX_SIGNATURE_LEN` | 160 | `src/knowledge/source-fallback.ts:26` | 签名被截到 160 字符，症状：长签名在回退页中显示不完整 |

### 3.3 交互确认：批量阈值与超长交互

| 常量 | 值 | 定义位置 |
| --- | --- | --- |
| `BULK_THRESHOLD` | 15 | `src/cli/confirm-interaction.ts:14` |

**问题描述**
CLI 在确认环节的行为与预期不符：要么逐条询问导致交互漫长，要么一次性给出大批待确认项难以逐个处理；在非交互式终端（CI）下可能直接卡住或退出。

**原因分析**
`src/cli/confirm-interaction.ts` 使用 `@clack/prompts`（该依赖的唯一 import 点，见 `depUsage`）实现确认交互，并以 `BULK_THRESHOLD = 15`（`src/cli/confirm-interaction.ts:14`）作为批量与逐条两种交互模式的分界。待确认项数量跨过 15 时会切换到批量模式，交互形态随之改变。

**解决方案**

```bash
# 交互卡住时优先确认是否处于 TTY 环境
tty && echo "TTY ok"

# 在 CI/管道中运行时，避免依赖交互输入；改为在本地终端执行同一命令
pnpm build
```

该文件的交互逻辑位于 `src/cli/commands/build.ts` 的下游，而 `src/cli/commands/build.ts` 是高频变更热点（9 次提交，最近 `commit:19eb6f9f`，2026-09-29「feat: 新增待确认项交互裁决与确认结果持久化」）。若遇到"确认结果未持久化/下次仍重复询问"，优先核对该提交引入的持久化行为是否与本地版本一致。

### 3.4 意图分析：git 相关超时与日志上限

| 常量 | 值 | 定义位置 | 触界典型症状 |
| --- | --- | --- | --- |
| `GIT_LOG_LIMIT` | 200 | `src/knowledge/intent/shared.ts:67` | 单次 git log 取 200 条，历史更长的仓库只看到最近 200 条 |
| `GIT_TIMEOUT_MS` | 15_000 | `src/knowledge/intent/shared.ts:68` | **git 子进程 15 秒超时**；症状：大仓库/慢磁盘上意图分析中断、日志类信息缺失 |
| `REPO_LOG_LIMIT` | 400 | `src/knowledge/intent/shared.ts:74` | 仓库级日志上限 400 条 |
| `CHURN_LOG_LIMIT` | 2000 | `src/knowledge/intent/shared.ts:76` | 变更热度统计读取 2000 条日志，超大历史下统计窗口被限制 |

**问题描述**
意图/提交信息相关页面缺失或内容稀少，同时进程没有明显崩溃。

**原因分析**
`src/knowledge/intent/shared.ts` 通过 git 子进程采集历史，`GIT_TIMEOUT_MS = 15_000`（`src/knowledge/intent/shared.ts:68`）是硬边界。仓库巨大、`.git` 位于网络盘、或 `gc` 未整理时，单次 git 调用可能逼近/超过 15 秒而被判定超时，导致下游拿不到数据，最终表现为"意图章节为空"而不是报错。

**解决方案**

```bash
# 1) 先量化本地 git 性能，确认是否触碰 15s 边界
time git log -n 200 --oneline > /dev/null

# 2) 若明显偏慢，先做仓库维护再重跑
git gc --aggressive --prune=now
time git log -n 200 --oneline > /dev/null

# 3) 确认意图模块的入口路径
ls src/knowledge/intent/index.ts
```

若 `time` 结果稳定超过 15 秒，则说明该上限是本项目的实际瓶颈；如需调整，修改对象为 `src/knowledge/intent/shared.ts:68`。同理，`GIT_LOG_LIMIT`（`:67`）、`REPO_LOG_LIMIT`（`:74`）、`CHURN_LOG_LIMIT`（`:76`）决定了统计窗口，仓库历史超出窗口时"近期热点"的结论会偏向最近区间。

### 3.5 高频变更热点与作者自认风险点

下列证据来自 `intent` 数组，属于**维护热点**（git-churn）与**作者自认的真实风险**（why-marker）。排障时若问题落在这些文件，优先怀疑近期行为变更。

| 文件 | 类型 | 证据 | 排障含义 |
| --- | --- | --- | --- |
| `src/knowledge/page-registry.ts` | git-churn | 11 次提交，最近 `commit:e2826e7c`（2026-10-01）「feat: 实现 Tier-2 动态 surface 页面并新增 library 项目类型探测」 | 页面注册/tier 行为最近变动频繁；页面缺失或多出时优先查这里 |
| `src/cli/commands/build.ts` | git-churn | 9 次提交，最近 `commit:19eb6f9f`（2026-09-29）「feat: 新增待确认项交互裁决与确认结果持久化」 | 构建命令的确认与持久化行为变更集中于此 |
| `src/core/scanner.ts` | git-churn | 9 次提交，最近 `commit:e31862e7`（2026-10-01）「feat: 新增 Python/Go/JVM 实验性多语言支持并明确支持矩阵边界」 | 扫描结果异常（漏文件/多文件）优先查这里 |
| `src/shared/utils.ts` | git-churn | 6 次提交，最近 `commit:e31862e7`（2026-10-01）同上 | 共享工具变更影响面广，类型错误常在此暴露 |
| `src/mcp/codebase-memory-client.ts` | git-churn | 6 次提交，最近 `commit:e1a30092`（2026-10-01）「feat: 升级断言校验为证据分类核验（点链匹配/注释提及识别/同名歧义统计）并试点 topic 页证据引用」 | MCP 客户端与证据核验行为变更集中于此，与 3.1 的环境变量问题直接相关 |
| `src/knowledge/intent/comments.ts` | why-marker | `src/knowledge/intent/comments.ts:81`：`TODO: /FIXME/HACK/... 标记（≤5 条/文件）` | 说明该处存在"每文件最多采集 5 条标记"的行为约束；标记丢失时先核对此上限 |
| `src/knowledge/config-detector/detector.ts` | why-marker | `src/knowledge/config-detector/detector.ts:228`：`XXX: 引用（跳过注释行）` | 配置探测对"跳过注释行"的处理是已知需注意点；配置项漏检/误检时优先查这里 |
| `src/knowledge/context/misc-pages.ts` | why-marker | `src/knowledge/context/misc-pages.ts:135`：`TODO: /FIXME 是真实风险信号）+ git 高频变更热点` | 杂项页对 TODO/FIXME 与变更热点的采集逻辑 |
| `src/knowledge/fallback/surface.ts` | why-marker | `src/knowledge/fallback/surface.ts:230`：`TODO: /FIXME 风险标记 + git 高频变更热点（作者自认的真实风险）` | 回退 surface 采集逻辑 |
| `src/knowledge/types/pages-meta.ts` | why-marker | `src/knowledge/types/pages-meta.ts:49`：`TODO: /FIXME 真实风险信号）+ git 高频变更` | 页面元数据结构中的风险信号字段 |

**问题描述**
"风险/兴趣点"类页面内容异常（条数偏少、或与仓库实际情况不符）。

**原因分析**
`TODO/FIXME/HACK` 类标记的采集在 `src/knowledge/intent/comments.ts:81` 处被限制为**每文件最多 5 条**；同时 git 变更热点受 3.4 中 `CHURN_LOG_LIMIT = 2000`（`src/knowledge/intent/shared.ts:76`）窗口约束。两者叠加会让"风险点"看起来比实际少。

**解决方案**

```bash
# 确认本地全量标记规模，与产物条数对比
grep -rn "TODO\|FIXME\|HACK" src --include=*.ts | wc -l

# 定位单项采集上限的实现
grep -rn "slice\|limit" src/knowledge/intent/comments.ts
```

### 3.6 配置读取与忽略规则

| 依赖 | 使用点 | 说明 |
| --- | --- | --- |
| `yaml` | `src/shared/config.ts` | 配置文件解析；YAML 语法错误会在此抛出 |
| `ignore` | `src/core/scanner.ts` | `.gitignore` 风格忽略规则匹配 |

**问题描述 A：启动即报 YAML 解析错误**
**原因分析**：`src/shared/config.ts` 使用 `yaml`（唯一 import 点）读取配置；配置文件存在语法错误（缩进/冒号/引号）时解析即失败。
**解决方案**：
```bash
# 用 node 快速校验 YAML 是否可解析
node -e "const yaml=require('yaml'),fs=require('fs');yaml.parse(fs.readFileSync(process.argv[1],'utf8'));console.log('YAML OK')" <你的配置文件路径>
```

**问题描述 B：扫描结果包含本应忽略的文件（如 `node_modules`、产物目录）**
**原因分析**：忽略判定由 `src/core/scanner.ts` 借助 `ignore` 包完成；忽略文件不存在、规则写法不被支持，或规则相对路径基准不对时，会漏忽略。
**解决方案**：
```bash
# 检查忽略规则文件是否存在及其内容
ls -a | grep -i ignore
# 复跑扫描并观察输出文件清单是否收敛
pnpm build
```
`src/core/scanner.ts` 若因 `commit:e31862e7`（2026-10-01）引入的多语言支持而改变行为，混入非目标语言的源码属于已知的变更区间，排障时优先核对该提交引入的支持矩阵边界。

---

## 四、调试技巧

### 4.1 从入口文件开始定位

排障起点是这些入口文件（`entryFiles`），它们定义了各子系统的对外边界：

| 入口文件 | 所在子系统 |
| --- | --- |
| `src/cli/index.ts` | CLI 主入口（同时是 `commander` 的 import 点之一） |
| `src/services/wiki/index.ts` | wiki 服务 |
| `src/knowledge/config-detector/index.ts` | 配置探测 |
| `src/knowledge/confirmation/index.ts` | 确认流程 |
| `src/knowledge/context/cli.ts` | 上下文构建（CLI 侧） |
| `src/knowledge/context/index.ts` | 上下文构建 |
| `src/knowledge/crosspage/index.ts` | 跨页处理 |
| `src/knowledge/dataflow/index.ts` | 数据流分析（含 3 个上限常量） |
| `src/knowledge/fallback/index.ts` | 回退逻辑 |
| `src/knowledge/generator/index.ts` | 生成阶段（`@ai-sdk/openai` 的 import 点） |
| `src/knowledge/intent/index.ts` | 意图分析（git 采集） |
| `src/knowledge/quality/index.ts` | 质量校验 |
| `src/knowledge/types/index.ts` | 类型定义出口 |

```bash
# 直接从 CLI 入口启动，观察最早失败在哪一层
node dist/src/cli/index.ts --help   # 实际产物路径以 tsup.config.ts 为准
```

> **待确认**：数据未提供 `package.json` 的 `bin` 字段与 `tsup.config.ts` 的 `outDir`，无法给出确切的产物路径与全局命令名；执行前请先查看 `tsup.config.ts`。

### 4.2 watch 构建调试

```bash
# 终端 A
pnpm dev          # = tsup --watch

# 终端 B：每次改动后重新执行，避免复用旧进程
```

### 4.3 测试调试

| 场景 | 命令 | 锚点 |
| --- | --- | --- |
| 全量跑一次 | `pnpm test` → `vitest run` | `scripts.test` |
| 监听模式 | `pnpm test:watch` → `vitest` | `scripts.test:watch` |

```bash
# 只跑单个测试文件（watch 模式下可用文件名过滤）
pnpm exec vitest run <测试文件路径>

# 只跑名称匹配的用例
pnpm exec vitest run -t "<用例名关键字>"
```

注意：`tests/` 目录及其中的 `fixtures`、`helpers`、`check-file-lines` 模块属于测试代码，**不代表产品功能**，仅用于验证上述行为；调试产品行为时不要以测试目录的实现为准。

### 4.4 依赖使用点速查（用于判断"某能力是否真的启用了"）

| 依赖 | 使用点（import 锚点） | 使用类型 |
| --- | --- | --- |
| `commander` | `src/cli/commands/build.ts`、`src/cli/commands/init.ts`、`src/cli/commands/scan.ts`、`src/cli/index.ts` | import |
| `@ai-sdk/openai` | `src/knowledge/generator/index.ts`、`src/knowledge/generator/shared.ts` | import |
| `ai` | `src/knowledge/generator/shared.ts` | import |
| `@clack/prompts` | `src/cli/confirm-interaction.ts` | import |
| `ignore` | `src/core/scanner.ts` | import |
| `yaml` | `src/shared/config.ts` | import |
| `tsup` | `tsup.config.ts` | import |
| `vitest` | `vitest.config.ts` | import |
| `typescript` | 由 `scripts.lint` 的 `tsc --noEmit` 调用（无 import 点） | script |
| `@types/node` | 类型声明包，无 import 点（数据未给出 tsconfig 内容） | none |

排查"某功能为何不生效"时，用上表交叉验证：命令行为 → `commander`（4 个文件）；交互 → `@clack/prompts`（仅 `src/cli/confirm-interaction.ts` 一处）；扫描忽略 → `ignore`；配置 → `yaml`；生成 → `@ai-sdk/openai` + `ai`。

### 4.5 查看日志与错误的最快路径

本项目数据未提供日志框架或日志输出位置的证据。

**待确认**：缺少日志相关依赖与日志文件路径信息，无法给出"日志在哪看"的确定答案。在数据补齐前，建议以**标准错误输出 + 退出码**为主要观察面：

```bash
# 保留完整输出与退出码，便于区分"静默降级"与"真实失败"
pnpm build; echo "exit=$?"
```

结合 3.2 节可知，本项目大量问题表现为**静默裁剪**（触界后被截断而非报错），因此"输出变少"与"命令失败"需要分开判断：先看退出码，再对照 3.2 的常量表确认是否只是触界。

---

## 五、关键缺口汇总

| 缺口 | 影响 | 需要补的证据 |
| --- | --- | --- |
| Node 版本约束 | 无法判断运行时最低版本，安装/运行报错时缺少第一手依据 | `nodeVersion` 为空，缺 `.nvmrc` 或 `engines` 采集结果 |
| AI 生成阶段的凭据配置 | 生成阶段若报鉴权类错误，无法定位应设哪个环境变量 | `envVars` 仅含 `CODEBASE_MEMORY_MCP_BINARY` |
| 产物路径与 CLI 命令名 | 4.1 中无法给出确切的本地执行路径 | 缺 `package.json` 的 `bin` 与 `tsup.config.ts` 的 `outDir` |
| 日志输出位置 | 无法给出"日志在哪看"的确定答案 | 缺日志框架/路径证据 |
## Related

- 同目录：[onboarding.md](onboarding.md) · [testing.md](testing.md)
- 共享 5 个源文件、共享 110 个符号：[constraints.md](../06-constraints/constraints.md)
- 共享 6 个源文件、共享 24 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 9 个源文件、共享 18 个符号：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)
