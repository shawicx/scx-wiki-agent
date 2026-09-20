# API 参考

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/knowledge/page-registry.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-fallback-builder.ts
- src/mcp/codebase-memory-client.ts
</details>

本页基于 `src/` 下的数据源，梳理项目的对外接口与可复用导出符号。对外交互主要通过 CLI 命令注册机制（`src/cli/index.ts`）以及一组可复用的导出函数完成：CLI 侧提供命令注册入口，函数侧分为三类——MCP 客户端数据适配、Wiki Markdown 构建、以及 Wiki 上下文与页面注册。

> 说明：所提供的 JSON 数据中，`frameworkNodes` 与 `supplementalSymbols` 均为空，故本文不涉及框架节点（Controller / Router）章节。

---

## CLI 命令

CLI 命令通过"注册函数"形式注入到命令程序中：每个 `registerXxxCommand` 负责把一个子命令挂载到 CLI 程序对象上。下表列出数据中出现的全部命令注册函数。

| 命令注册函数 | 说明 | 源文件位置 |
| --- | --- | --- |
| `registerBuildCommand` | 注册 build 命令 | `src/cli/commands/build.ts:9` |
| `registerInitCommand` | 注册 init 命令 | `src/cli/commands/init.ts:6` |
| `registerScanCommand` | 注册 scan 命令 | `src/cli/commands/scan.ts:4` |

### 命令说明

- **`registerBuildCommand`**（`src/cli/commands/build.ts:9`）：注册构建相关子命令。数据中 `description` 为空，具体命令名、参数与使用场景「待确认」——缺少该函数的源码体与 docstring 证据。
- **`registerInitCommand`**（`src/cli/commands/init.ts:6`）：注册初始化相关子命令。`description` 为空，参数与使用场景「待确认」。
- **`registerScanCommand`**（`src/cli/commands/scan.ts:4`）：注册扫描相关子命令。`description` 为空，参数与使用场景「待确认」。

### CLI 程序入口

| 符号 | 签名 | 源文件位置 |
| --- | --- | --- |
| `createProgram` | 信息不足（`signature` 为 null） | `src/cli/index.ts:6` |

`createProgram` 位于 CLI 入口文件 `src/cli/index.ts`，从命名与位置推断其为程序对象的创建入口，但数据中缺少签名与 docstring，其返回值与调用方式「待确认」。

---

## 导出函数

导出函数按职责分为四组：**数据适配（MCP 客户端）**、**Markdown 构建（wiki-builder）**、**Wiki 上下文构建**、**页面注册表**。

### 一、MCP 客户端数据适配

这一组函数负责把 codebase-memory MCP 服务返回的"列式表"结构转换为下游可消费的对象数组/扁平数组，是 MCP 返回格式与内部数据结构之间的适配层。位置集中在 `src/mcp/codebase-memory-client.ts`。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `adaptArchitecture` | `(raw: Record<string, any>)` | `get_architecture` 列式表 → `ArchitectureData` 对象数组 | `src/mcp/codebase-memory-client.ts:45` |
| `adaptTrace` | `(raw: Record<string, any>)` | `trace_path` 分组列式表 → 扁平 `TraceNode[]` | `src/mcp/codebase-memory-client.ts:92` |
| `adaptSide` | `(side: unknown)` | 数据中无 docstring，用途「待确认」 | `src/mcp/codebase-memory-client.ts:93` |
| `asObjects` | `(raw: Record<string, unknown>, key: string)` | 兼容两种形态：旧版对象数组 / 新版列式表 | `src/mcp/codebase-memory-client.ts:35` |

- **`adaptArchitecture`**：将 `get_architecture` 工具返回的列式表还原为 `ArchitectureData` 对象数组，供上层直接以对象方式访问架构信息。
- **`adaptTrace`**：将 `trace_path` 返回的分组列式表拍平为 `TraceNode[]`，便于按节点顺序遍历调用链。
- **`asObjects`**：底层通用适配函数，同时兼容"旧版对象数组"与"新版列式表"两种返回形态；`adaptArchitecture` / `adaptTrace` 应基于它完成形态归一。
- **`adaptSide`**：无 docstring，仅凭签名 `(side: unknown)` 无法判断其转换目标，「待确认」。

### 二、Markdown 构建（wiki-builder）

这一组函数围绕一个 Markdown 文档构建器展开：每个函数向构建器追加一种结构性内容（标题、章节、正文、代码块、表格、列表），最后由 `build()` 汇总输出。位置集中在 `src/knowledge/wiki-builder.ts`。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `addTitle` | `(title: string)` | 添加一级标题：`# title` | `src/knowledge/wiki-builder.ts:11` |
| `addSection` | `(title: string, content: string)` | 添加二级章节：`## title\n\ncontent` | `src/knowledge/wiki-builder.ts:17` |
| `addSubSection` | `(title: string, content: string)` | 添加三级子章节：`### title\n\ncontent` | `src/knowledge/wiki-builder.ts:23` |
| `addParagraph` | `(text: string)` | 添加普通段落 | `src/knowledge/wiki-builder.ts:29` |
| `addCodeBlock` | `(language: string, code: string)` | 添加带可选语言标注的围栏代码块 | `src/knowledge/wiki-builder.ts:35` |
| `addTable` | `(headers: string[], rows: string[][])` | 由表头与行数据生成 Markdown 表格 | `src/knowledge/wiki-builder.ts:41` |
| `addBulletList` | `(items: string[])` | 添加无序列表 | `src/knowledge/wiki-builder.ts:50` |
| `addNewline` | `()` | 添加一个空行 | `src/knowledge/wiki-builder.ts:56` |
| `build` | `()` | 用换行连接所有章节并返回最终文档 | `src/knowledge/wiki-builder.ts:62` |

- **层级类**（`addTitle` / `addSection` / `addSubSection`）分别对应 Markdown 的 `#`、`##`、`###` 三级标题；后两者同时接收正文内容，标题与内容之间自动插入空行。
- **正文类**（`addParagraph` / `addCodeBlock` / `addTable` / `addBulletList`）覆盖文档常见内容块：段落、围栏代码块、表格、无序列表。`addTable` 接收表头数组与二维行数组，适合生成结构化数据展示。
- **排版类**（`addNewline`）用于显式插入空行，控制输出间距。
- **`build`** 是构建器的终结方法，将所有已追加的章节按换行拼接成完整文档字符串返回；调用方在完成全部 `addXxx` 调用后调用它取得最终结果。

### 三、Wiki 上下文与回退构建

这一组函数负责组装 Wiki 生成所需的上下文（`ApiContext`）以及在该上下文上产出 API 页面，位于 `src/knowledge/` 下两个不同文件中。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `buildApiContext` | `()` | 构建 API 上下文 | `src/knowledge/wiki-context-builder.ts:370` |
| `buildApi` | `(ctx: ApiContext)` | 基于 `ApiContext` 构建 API 页面 | `src/knowledge/wiki-fallback-builder.ts:208` |

- **`buildApiContext`**：无参调用，返回一个上下文对象（下游 `buildApi` 的入参类型为 `ApiContext`，据此推断其产出类型）。数据中无 docstring，其收集的具体字段「待确认」。
- **`buildApi`**：接收 `ApiContext` 并产出一份 API 相关页面内容。该函数位于 `wiki-fallback-builder.ts`，从文件名推断属于回退（fallback）构建路径，用于在常规构建不可用时提供 API 页面产出；具体触发条件与输出「待确认」。

### 四、页面注册表（page-registry）

这一组函数服务于 Wiki 页面注册与导航，位置集中在 `src/knowledge/page-registry.ts`。数据中均无签名与 docstring，各函数用途依据命名与行号顺序列出。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `tier2PagesFor` | 信息不足 | 用途「待确认」 | `src/knowledge/page-registry.ts:83` |
| `findPageDescriptor` | 信息不足 | 用途「待确认」 | `src/knowledge/page-registry.ts:88` |
| `pageRelPath` | 信息不足 | 用途「待确认」 | `src/knowledge/page-registry.ts:96` |
| `buildRelatedSection` | 信息不足 | 用途「待确认」 | `src/knowledge/page-registry.ts:118` |

- **`tier2PagesFor`** / **`findPageDescriptor`**：从命名看分别涉及"二级页面集合查询"与"页面描述符查找"，但因缺少签名与 docstring，参数与返回值「待确认」。
- **`pageRelPath`**：命名提示与"页面相对路径"相关，具体输入输出「待确认」。
- **`buildRelatedSection`**：命名提示用于构建"相关章节"（Related section），具体产出格式「待确认」。

---

## 待确认汇总

以下方面因数据不足，无法在本文中给出确切描述，已在对应位置标注，此处汇总：

| 方面 | 缺失证据 |
| --- | --- |
| 各 CLI 命令的名称、参数、使用场景 | `registerBuildCommand` / `registerInitCommand` / `registerScanCommand` 的 `description` 为空，无源码体 |
| `createProgram` 的签名与调用方式 | JSON 中 `signature` 与 `docstring` 均为 null |
| `adaptSide` 的转换目标 | 无 docstring，签名为 `(side: unknown)` |
| `buildApiContext` 产出的上下文字段 | 无 docstring |
| `buildApi` 的触发条件与输出 | 无 docstring |
| `tier2PagesFor` / `findPageDescriptor` / `pageRelPath` / `buildRelatedSection` 的参数与行为 | 无签名与 docstring |
## Related

- 同目录：[cli.md](cli.md)
- 总入口：[README](../README.md)
