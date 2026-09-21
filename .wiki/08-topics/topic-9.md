# registerBuildCommand 协作面

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/mcp/codebase-memory-client.ts
</details>

> 本页覆盖的主题横跨 `src/cli`（命令注册与程序装配）、`src/core`（文件扫描与项目元信息提取）、`src/mcp`（MCP 子进程客户端与列式表适配）三层。其核心协作问题是：**CLI 命令（build / scan）如何把「本地文件扫描结果」与「MCP 图谱索引能力」串联起来**，使一条命令既能识别项目技术栈，又能驱动外部 codebase-memory 子进程完成索引与查询。之所以单独成页，是因为它对应的是固定文档未覆盖的「装配面」——`createProgram` 如何挂载命令、`registerBuildCommand` 如何跨层消费 `FileScanner` 与 `CodebaseMemoryClient`、MCP 客户端的执行链如何用适配器与列式表兼容层兜住外部格式差异。

---

## 职责与范围

本主题覆盖 5 个文件，按职责分工如下：

| 文件 | 层 | 分工 |
| --- | --- | --- |
| `src/cli/index.ts` | CLI 装配 | 遍历注册命令，`createProgram` 调用 `registerScanCommand` / `registerBuildCommand`（`src/cli/commands/scan.ts:4`、`src/cli/commands/build.ts:9`） |
| `src/cli/commands/build.ts` | CLI 命令 | 定义 `registerBuildCommand`，跨层实例化 `FileScanner` 与 `CodebaseMemoryClient`（`src/core/scanner.ts:37`、`src/mcp/codebase-memory-client.ts:119`） |
| `src/cli/commands/scan.ts` | CLI 命令 | 定义 `registerScanCommand`，与 build 同属被 `createProgram` 挂载的命令注册点 |
| `src/core/scanner.ts` | 核心扫描 | `FileScanner` 负责目录遍历、技术栈探测、导入包收集、项目类型与源码目录识别 |
| `src/mcp/codebase-memory-client.ts` | MCP 客户端 | `CodebaseMemoryClient` 封装对 codebase-memory 子进程的 exec 调用、JSON 解析、列式表适配与图谱查询 |

锚点说明：`createProgram` 的调用关系见 `src/cli/commands/scan.ts:4` 与 `src/cli/commands/build.ts:9`（edges 表），但这两个文件内 `createProgram` 自身的定义位置未在数据中给出，**待确认**（缺证据：`createProgram` 的定义 file:line）。

---

## 关键符号

### CLI 装配与命令注册

- **`registerBuildCommand`**（`src/cli/commands/build.ts:9`）：build 命令的注册入口。其角色是「跨层装配点」——数据中的两条出边表明它直接构造 `FileScanner`（`src/core/scanner.ts:37`）与 `CodebaseMemoryClient`（`src/mcp/codebase-memory-client.ts:119`），从而把 core 与 mcp 两个模块缝合到 CLI 命令中。这是本主题中被跨模块耦合的关键节点。

- **`createProgram`**：程序装配函数，负责把 `registerScanCommand` 与 `registerBuildCommand` 挂载为可用命令（`src/cli/commands/scan.ts:4`、`src/cli/commands/build.ts:9`）。它本身不直接触碰扫描或 MCP 逻辑，只做命令注册分发。

> 注：`registerScanCommand` 在 edges 中仅作为 `createProgram` 的被调用者出现，其内部实现与签名未在 symbols 数据中提供，**待确认**。

### 文件扫描（core/scanner.ts）

- **`collectImportedPackages`**（`src/core/scanner.ts:170`）：方法，签名 `(files: ScannedFile[])`。docstring 明确「扫描源文件，提取所有 import 语句引用的包名；只保留被实际 import 的依赖，过滤死依赖」。它由 `detectTechStack` 调用（`src/core/scanner.ts:170`），是技术栈识别中「依赖使用情况」判定的实际执行者——是否把某依赖计入技术栈，取决于它是否被真实 import。

- **`FileScanner`**（`src/core/scanner.ts:37`）：扫描器类。数据中可见其构造过程依赖 `loadGitignore`（`src/core/scanner.ts:47`），内部方法 `scan` 编排 `walkDirectory`（`src/core/scanner.ts:84`）、`detectTechStack`（`src/core/scanner.ts:139`）、`detectProjectType`（`src/core/scanner.ts:198`）、`detectSourceDirs`（`src/core/scanner.ts:222`）。`walkDirectory` 进一步借助 `shouldSkipDir`（`src/core/scanner.ts:129`）与 `isIgnored`（`src/core/scanner.ts:59`）做忽略判定。

### MCP 客户端（mcp/codebase-memory-client.ts）

- **`CodebaseMemoryClient`**（`src/mcp/codebase-memory-client.ts:119`）：对外封装 MCP 子进程能力的客户端类。构造时调用 `findBinary`（`src/mcp/codebase-memory-client.ts:231`）定位可执行文件、调用 `toProjectName`（`src/mcp/codebase-memory-client.ts:227`）把仓库路径转成 MCP 项目标识符。其公共查询方法（`getArchitecture` / `tracePath` / `getCodeSnippet` / `queryGraph` / `ensureIndexed`）均收敛到内部 `exec`。

- **`exec`**（`src/mcp/codebase-memory-client.ts:188`）：内部方法，签名 `(tool, args)`。它是客户端所有工具调用的**唯一出口**，被 `ensureIndexed`（`src/mcp/codebase-memory-client.ts:188`）、`getArchitecture`、`getCodeSnippet`、`queryGraph`、`tracePath` 共同调用；自身再调用 `parseJsonOutput`（`src/mcp/codebase-memory-client.ts:211`）解析子进程 stdout。

- **`parseJsonOutput`**（`src/mcp/codebase-memory-client.ts:211`）：从 stdout 末尾向前寻找最后一个完整 JSON 对象，原因是「MCP 的 info 日志（`level=info msg=...`）可能泄漏到 stdout」。这是针对外部子进程输出污染的实际容错。

- **`ensureIndexed`**（`src/mcp/codebase-memory-client.ts:131`）：幂等地确保图谱已索引，签名含索引模式 `'fast' | 'moderate' | 'full'`，默认 `'moderate'`。

- **`getArchitecture`**（`src/mcp/codebase-memory-client.ts:140`）/ **`tracePath`**（`src/mcp/codebase-memory-client.ts:150`）：分别是架构概览与双向调用链追踪的公共入口，均先 `exec` 再进入各自的适配器。`tracePath` 签名支持 `direction: 'inbound' | 'outbound' | 'both'` 与 `depth`（默认 6）。

- **`getCodeSnippet`**（`src/mcp/codebase-memory-client.ts:166`）/ **`queryGraph`**（`src/mcp/codebase-memory-client.ts:175`）：分别按 `qualifiedName` 取代码片段、按 Cypher 查询（`maxRows` 默认 100）。两者同样经 `exec` 出站。

#### 列式表兼容适配层

MCP v0.10.x 的 `format=json` 返回的是**列式表** `{cols, rows}`，而消费方期望对象数组，因此形成一组适配函数：

- **`tableToObjects`**（`src/mcp/codebase-memory-client.ts:27`）：最小原语，把列式表转成对象数组。
- **`asObjects`**（`src/mcp/codebase-memory-client.ts:35`）：兼容层，签名 `(raw, key)`，docstring 说明「兼容两种形态：旧版对象数组 / 新版列式表」；内部对列式形态调用 `tableToObjects`（`src/mcp/codebase-memory-client.ts:27`）。
- **`adaptArchitecture`**（`src/mcp/codebase-memory-client.ts:45`）：把 `get_architecture` 的列式表适配为 `ArchitectureData` 对象数组；依赖 `asObjects` 与 `lastSegment`（`src/mcp/codebase-memory-client.ts:42`）。
- **`adaptTrace`**（`src/mcp/codebase-memory-client.ts:92`）：把 `trace_path` 的分组列式表摊平为 `TraceNode[]`；依赖 `adaptSide`（`src/mcp/codebase-memory-client.ts:93`）。

> 说明：`lastSegment`、`adaptSide` 仅在 edges 中作为被调用者出现，其定义与签名未在 symbols 中提供，**待确认**。

---

## 协作方式

主题内文件通过「CLI 装配 → 跨层实例化 → 各自内部编排」的方式配合。调用方向如下（列式边表，满足静态可达性表达）：

| 调用方 | 被调用方 | 位置 |
| --- | --- | --- |
| `createProgram` | `registerScanCommand` | `src/cli/commands/scan.ts:4` |
| `createProgram` | `registerBuildCommand` | `src/cli/commands/build.ts:9` |
| `registerBuildCommand` | `FileScanner` | `src/core/scanner.ts:37` |
| `registerBuildCommand` | `CodebaseMemoryClient` | `src/mcp/codebase-memory-client.ts:119` |
| `constructor`（scanner） | `loadGitignore` | `src/core/scanner.ts:47` |
| `constructor`（client） | `findBinary` | `src/mcp/codebase-memory-client.ts:231` |
| `constructor`（client） | `toProjectName` | `src/mcp/codebase-memory-client.ts:227` |
| `scan` | `walkDirectory` | `src/core/scanner.ts:84` |
| `scan` | `detectTechStack` | `src/core/scanner.ts:139` |
| `scan` | `detectProjectType` | `src/core/scanner.ts:198` |
| `scan` | `detectSourceDirs` | `src/core/scanner.ts:222` |
| `detectTechStack` | `collectImportedPackages` | `src/core/scanner.ts:170` |
| `walkDirectory` | `shouldSkipDir` | `src/core/scanner.ts:129` |
| `walkDirectory` | `isIgnored` | `src/core/scanner.ts:59` |
| `ensureIndexed` | `exec` | `src/mcp/codebase-memory-client.ts:188` |
| `getArchitecture` | `exec` | `src/mcp/codebase-memory-client.ts:188` |
| `getArchitecture` | `adaptArchitecture` | `src/mcp/codebase-memory-client.ts:45` |
| `getCodeSnippet` | `exec` | `src/mcp/codebase-memory-client.ts:188` |
| `queryGraph` | `exec` | `src/mcp/codebase-memory-client.ts:188` |
| `tracePath` | `exec` | `src/mcp/codebase-memory-client.ts:188` |
| `tracePath` | `adaptTrace` | `src/mcp/codebase-memory-client.ts:92` |
| `exec` | `parseJsonOutput` | `src/mcp/codebase-memory-client.ts:211` |
| `adaptArchitecture` | `asObjects` | `src/mcp/codebase-memory-client.ts:35` |
| `adaptArchitecture` | `lastSegment` | `src/mcp/codebase-memory-client.ts:42` |
| `adaptTrace` | `adaptSide` | `src/mcp/codebase-memory-client.ts:93` |
| `asObjects` | `tableToObjects` | `src/mcp/codebase-memory-client.ts:27 |

数据流可归纳为两个阶段：

| 阶段 | 输入 | 处理链 | 输出 |
| --- | --- | --- | --- |
| 本地扫描阶段 | 仓库目录 | `scan` → `walkDirectory`（含 `shouldSkipDir`/`isIgnored` 过滤）→ `detectTechStack`（→`collectImportedPackages`）/`detectProjectType`/`detectSourceDirs` | 项目元信息（技术栈、类型、源码目录） |
| MCP 查询阶段 | 工具名 + 参数 | `getArchitecture`/`tracePath`/`getCodeSnippet`/`queryGraph`/`ensureIndexed` → `exec` → `parseJsonOutput` → `adaptArchitecture`/`adaptTrace` → `asObjects` → `tableToObjects` | 适配后的对象数组（`ArchitectureData` / `TraceNode[]`） |

---

## 跨模块边界

boundaries 数据给出以下跨层调用计数：

| 从 | 到 | 调用数 |
| --- | --- | --- |
| core | shared | 2 |
| cli | services | 2 |
| services | cli | 1 |
| services | core | 1 |
| cli | core | 1 |

结合主题内边表可读出的耦合点与修改代价：

- **cli → core（`src/cli/commands/build.ts:9` → `src/core/scanner.ts:37`）**：`registerBuildCommand` 直接依赖 `FileScanner` 类。修改 `FileScanner` 构造函数（如新增扫描配置）会波及 CLI 命令的装配代码。调用数虽为 1，但属于「命令直接 new 具体类」的强耦合，**推断**：不利于替换扫描实现。
- **cli → services（2 次）**：对应 `registerBuildCommand` 对 `CodebaseMemoryClient`（`src/mcp/codebase-memory-client.ts:119`）的构造。MCP 客户端位于 services 语义层，被 CLI 直接实例化，是 CLI 与 MCP 子进程能力的耦合面。
- **services → cli（1 次）与 services → core（1 次）**：表明 services 层存在对 cli 与 core 的反向引用，构成双向耦合。数据未给出这些反向边的具体调用方，**待确认**（缺证据：services→cli、services→core 的具体 caller/callee）。
- **core → shared（2 次）**：core 依赖 shared 工具层，属于较低风险的依赖方向。

综合来看，本主题的主要修改代价集中在 **CLI 命令层直接实例化具体类**（`FileScanner`、`CodebaseMemoryClient`）：任何被实例化类的构造签名或生命周期变化，都会直接传导到 `registerBuildCommand`。MCP 侧的适配链（exec → parseJsonOutput → adapt → asObjects → tableToObjects）是隔离外部格式变化的缓冲区，其修改代价被局限在 `codebase-memory-client.ts` 内部。

---

## 设计动机

> 以下为基于符号命名与协作模式的**推断**，非源码显式声明。

1. **以「命令」为最小装配单元**：`createProgram` 只负责挂载 `registerScanCommand` / `registerBuildCommand`，而每个 register 函数自持其依赖（`FileScanner`、`CodebaseMemoryClient`）。**推断**：意图是让每条命令自包含、可独立演进，代价是命令层直接耦合了具体类。
2. **适配层隔离外部格式漂移**：`tableToObjects` → `asObjects` → `adaptArchitecture`/`adaptTrace` 的多级分层，配合 `asObjects` 的「兼容两种形态」docstring，**推断**：这是为跨 MCP 版本（旧版对象数组 vs v0.10.x 列式表）演进而设计的防腐层，把格式差异收敛到客户端内部。
3. **stdout 容错单独成函数**：`parseJsonOutput` 专为「info 日志泄漏到 stdout」而设，从末尾向前找 JSON。**推断**：将外部子进程的不可控输出行为封装为单一可测试函数，避免污染每个查询方法。
4. **单一执行出口 `exec`**：所有查询方法收敛到 `exec`，**推断**：统一子进程调用、参数序列化与错误处理路径，降低重复。
5. **幂等索引 `ensureIndexed`**：命名含「ensure」并标注幂等，**推断**：意图是允许调用方按需触发索引而不必先查询状态。

---

## 待确认清单

| 方面 | 缺失证据 |
| --- | --- |
| `createProgram` 定义位置与签名 | 数据未提供该符号的 file:line 与签名 |
| `registerScanCommand` 实现与内部依赖 | 仅作为被调用者出现，无 symbols 数据 |
| `lastSegment` / `adaptSide` 定义 | 仅在 edges 中作为被调用者出现 |
| services→cli、services→core 反向调用 | boundaries 有计数，无具体 caller/callee |
| `FileScanner`、`CodebaseMemoryClient` 的完整方法与字段 | symbols 仅覆盖部分方法 |
| build 与 scan 命令的运行时行为差异 | 数据未提供命令选项与执行流程描述 |
## Related

- 同目录：[topic-6.md](topic-6.md)
- 总入口：[README](../README.md)
