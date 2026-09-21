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

> **数据充分性说明**：本页严格基于所提供的 JSON 数据生成。数据中不含各 CLI 命令的 options/参数、不含 `createProgram` 等函数的签名与文档字符串、不含任何框架节点（`frameworkNodes` 为空）。因此凡数据未覆盖之处，均按「待确认」标注，不做补全或猜测。

本项目的对外接口分为三类：**CLI 命令**（面向最终用户的可执行入口）、**内部导出函数**（按职责分为 MCP 适配、Wiki 文档构建、上下文与页面注册三组）。CLI 命令通过 `src/cli/index.ts` 暴露的命令行程序注册执行；导出函数则构成从代码知识图谱到 Wiki 文档的转换流水线。

---

## CLI 命令

CLI 命令是本项目面向用户的主要交互方式。以下命令通过 `createProgram` 关联的命令行程序注册（`createProgram` 定义于 `src/cli/index.ts:6`，其签名与实现细节在数据中缺失）。

| 命令注册函数 | 说明 | 源文件位置 |
| --- | --- | --- |
| `registerBuildCommand` | Generate wiki documentation from codebase knowledge graph | `src/cli/commands/build.ts:9` |
| `registerInitCommand` | Initialize wiki-agent in the project | `src/cli/commands/init.ts:6` |
| `registerScanCommand` | Scan project structure and identify tech stack | `src/cli/commands/scan.ts:4` |

以下按功能说明各命令的定位。

### `registerBuildCommand`（`src/cli/commands/build.ts:9`）

- **说明**：根据代码库知识图谱生成 Wiki 文档。这是本项目文档生成能力的主入口，其输出产物对应 `src/knowledge/wiki-builder.ts` 中构建的文档结构。
- **使用场景**：在完成初始化与扫描后，执行文档生成。
- **参数**：数据中未提供该命令的 options/argument 定义。**待确认**：需要命令注册处的 `.option()` / `.argument()` 调用作为证据。
- **使用示例**：数据中无命令名与用法示例，**待确认**。

### `registerInitCommand`（`src/cli/commands/init.ts:6`）

- **说明**：在项目中初始化 wiki-agent。
- **使用场景**：面向新项目首次接入，用于在目标项目内完成 wiki-agent 的基础配置。
- **参数**：数据中未提供 options/argument 定义。**待确认**。
- **使用示例**：数据中无命令名与用法示例，**待确认**。

### `registerScanCommand`（`src/cli/commands/scan.ts:4`）

- **说明**：扫描项目结构并识别技术栈。
- **使用场景**：在生成文档前，先对目标项目进行结构与技术栈的识别，其结果应作为后续 build 的输入之一。
- **参数**：数据中未提供 options/argument 定义。**待确认**。
- **使用示例**：数据中无命令名与用法示例，**待确认**。

> 关于命令注册与执行的时序关系：数据中仅提供注册函数的文件位置，未提供 `createProgram` 调用各注册函数的行号证据，因此本页不绘制命令注册调用图（R2/R6）。

---

## 导出函数

导出函数按职责分为三组：**MCP 客户端适配**（将知识图谱接口返回的列式/对象形态归一化）、**Wiki 文档构建**（Markdown 片段拼装）、**上下文与页面注册**（收集生成上下文、确定页面路径与类型）。此外还包含 `buildApi` 与 `createProgram` 等入口函数。

### MCP 客户端适配（`src/mcp/codebase-memory-client.ts`）

这一组函数用于把 codebase memory（知识图谱）MCP 接口返回的数据结构做兼容与归一化：既能处理旧版对象数组，也能处理新版列式表，最终输出可直接消费的数组结构。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `asObjects` | `(raw: Record<string, unknown>, key: string)` | 兼容两种形态：旧版对象数组 / 新版列式表 | `src/mcp/codebase-memory-client.ts:35` |
| `adaptArchitecture` | `(raw: Record<string, any>)` | `get_architecture` 列式表 → `ArchitectureData` 对象数组 | `src/mcp/codebase-memory-client.ts:45` |
| `adaptTrace` | `(raw: Record<string, any>)` | `trace_path` 分组列式表 → 扁平 `TraceNode[]` | `src/mcp/codebase-memory-client.ts:92` |
| `adaptSide` | `(side: unknown)` | 无文档字符串 | `src/mcp/codebase-memory-client.ts:93` |

- `asObjects` 是这组适配的公共基础：由于上游接口在新旧版本间存在「对象数组 / 列式表」两种返回形态，它作为统一入口屏蔽差异，后续 `adaptArchitecture`、`adaptTrace` 等在其基础上做进一步的领域化转换。
- `adaptArchitecture` 将 `get_architecture` 的列式表转换为 `ArchitectureData[]`，供架构相关文档构建设使用。
- `adaptTrace` 将 `trace_path` 的分组列式表拍平为 `TraceNode[]`，属于调用链/路径追踪类数据的归一化。
- `adaptSide` **声明未用**：数据中仅给出签名 `(side: unknown)` 与文件位置，无 docstring，也无源码调用点证据，其用途与调用方**待确认**。

### Wiki 文档构建（`src/knowledge/wiki-builder.ts`）

这一组函数构成一个 Markdown 文档的片段级构建 API：从标题、章节到表格、代码块，逐段累积，最后通过 `build` 汇总为完整文档。适合以编程方式生成结构化文档。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `addTitle` | `(title: string)` | Add a top-level title: `# title` | `src/knowledge/wiki-builder.ts:11` |
| `addSection` | `(title: string, content: string)` | Add a second-level section: `## title` +（content 非空时）`\n\ncontent` | `src/knowledge/wiki-builder.ts:17` |
| `addSubSection` | `(title: string, content: string)` | Add a third-level sub-section: `### title` +（content 非空时）`\n\ncontent` | `src/knowledge/wiki-builder.ts:23` |
| `addParagraph` | `(text: string)` | Add a plain paragraph. | `src/knowledge/wiki-builder.ts:29` |
| `addCodeBlock` | `(language: string, code: string)` | Add a fenced code block with an optional language hint. | `src/knowledge/wiki-builder.ts:35` |
| `addTable` | `(headers: string[], rows: string[][])` | Add a markdown table from headers and rows. | `src/knowledge/wiki-builder.ts:41` |
| `addBulletList` | `(items: string[])` | Add a bullet list. | `src/knowledge/wiki-builder.ts:50` |
| `addNewline` | `()` | Add an empty line. | `src/knowledge/wiki-builder.ts:56` |
| `build` | `()` | Join all sections with newlines and return the final document. | `src/knowledge/wiki-builder.ts:62` |

- `addTitle`/`addSection`/`addSubSection` 覆盖三级标题，且 `addSection`、`addSubSection` 在 `content` 非空时才追加空行与正文，避免生成多余空行。
- `addParagraph`、`addTable`、`addCodeBlock`、`addBulletList` 分别对应段落、表格、代码块、无序列表四种正文元素，`addCodeBlock` 支持可选语言提示。
- `addNewline` 用于元素之间的间隔控制。
- `build` 是所有片段的收口：将已累积的 sections 以换行连接并返回最终文档字符串，是导出前的最后一步。

### 上下文与页面注册

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `buildApiContext` | `()` | 无文档字符串 | `src/knowledge/wiki-context-builder.ts:397` |
| `buildApi` | `(ctx: ApiContext)` | 无文档字符串 | `src/knowledge/wiki-fallback-builder.ts:216` |
| `tier2PagesFor` | 无 | 无文档字符串 | `src/knowledge/page-registry.ts:83` |
| `findPageDescriptor` | 无 | 无文档字符串 | `src/knowledge/page-registry.ts:88` |
| `pageRelPath` | 无 | 无文档字符串 | `src/knowledge/page-registry.ts:99` |
| `isTopicPage` | 无 | 无文档字符串 | `src/knowledge/page-registry.ts:125` |

- `buildApiContext` 位于 `wiki-context-builder.ts`，从名与所在文件判断其承担**构建 API 文档生成上下文**的职责；但数据中无 docstring，其返回结构与字段**待确认**。
- `buildApi` 接收 `ctx: ApiContext`，位于 `wiki-fallback-builder.ts`，作为**回退（fallback）构建路径**的 API 页构建入口；其与 `buildApiContext` 之间的调用关系在数据中无锚点，**待确认**。
- `page-registry.ts` 中的四个函数共同服务于**页面注册与定位**：`tier2PagesFor` 与 `findPageDescriptor` 关联页面描述符的检索，`pageRelPath` 负责页面相对路径，`isTopicPage` 用于判定某页是否为 topic 页。这些函数的签名在数据中缺失，参数与返回值**待确认**。

### 程序入口

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `createProgram` | 无（null） | 无文档字符串 | `src/cli/index.ts:6` |
| `build` | `()` | Join all sections with newlines and return the final document | `src/knowledge/wiki-builder.ts:62` |

- `createProgram` 是 CLI 的命令行程序构造入口，位于 `src/cli/index.ts:6`；各 `register*Command` 函数应向该程序注册命令，但数据中未提供 `createProgram` 调用 `register*Command` 的行号证据，故不在此绘制调用图。
- `build` 同时出现在文档构建与程序入口说明中，此处仅重申其签名与职责，不再展开。

---

## 框架节点

数据中 `frameworkNodes` 为空数组。**待确认**：本项目的框架相关节点（如 Controller、Router 等）在所提供的 JSON 中不存在，无法列出。

---

## 附：数据完整性备注

| 关注点 | 数据提供情况 |
| --- | --- |
| CLI 命令及其说明 | 已提供（3 条） |
| 每个 CLI 命令的参数/选项 | 未提供 |
| 各命令对应的实际命令行名称与用法示例 | 未提供 |
| 导出函数签名 | 部分提供（`page-registry.ts` 四个函数与 `createProgram` 的签名为 null） |
| 导出函数文档字符串 | 部分为空（`adaptSide`、`buildApi`、`buildApiContext`、`createProgram`、`page-registry.ts` 四个函数） |
| 框架节点（Controller/Router 等） | 未提供（空数组） |
| 函数间调用关系（调用点行号） | 未提供 |
## Related

- 同目录：[cli.md](cli.md)
- 总入口：[README](../README.md)
