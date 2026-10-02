# API 参考

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/knowledge/claim-verifier.ts
- src/knowledge/confirmation/types.ts
- src/knowledge/context/shared.ts
- src/knowledge/fallback/shared.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-evidence.ts
- src/mcp/codebase-memory-client.ts
</details>

本页基于代码库知识图谱导出的符号数据，整理 wiki-agent 项目的对外接口：CLI 子命令注册入口与模块级导出函数。对外交互由两条主线构成——命令行侧通过 `registerBuildCommand`（src/cli/commands/build.ts:11）、`registerInitCommand`（src/cli/commands/init.ts:8）、`registerScanCommand`（src/cli/commands/scan.ts:4）注册三个子命令；库侧则由一组按文件分布的导出函数提供能力，覆盖 MCP 客户端数据适配（src/mcp/codebase-memory-client.ts:45）、Wiki Markdown 构建（src/knowledge/wiki-builder.ts:11）、证据登记与确认待办（src/knowledge/wiki-evidence.ts:117、src/knowledge/confirmation/types.ts:49）、源码回落与上下文补强（src/knowledge/fallback/shared.ts:115、src/knowledge/context/shared.ts:288）以及声明校验（src/knowledge/claim-verifier.ts:72）。

需要说明的是，本页数据中不包含调用边表（调用方→被调用方），因此下文不对函数之间的调用先后顺序作断言，全部内容以函数签名、docstring 与文件位置为准；数据中 `frameworkNodes` 与 `supplementalSymbols` 均为空，故不存在可列的框架节点。

---

## CLI 命令

CLI 命令是项目最主要的对外交互面。三个命令各自位于独立的命令模块中，均为 `register*Command` 形式的注册入口，其描述性信息来自数据中的 `description` 字段。

| 命令名 | 说明 | 源文件位置 |
| --- | --- | --- |
| `registerBuildCommand` | Generate wiki documentation from codebase knowledge graph | src/cli/commands/build.ts:11 |
| `registerInitCommand` | Initialize wiki-agent in the project | src/cli/commands/init.ts:8 |
| `registerScanCommand` | Scan project structure and identify tech stack | src/cli/commands/scan.ts:4 |

### registerBuildCommand

- 位置：src/cli/commands/build.ts:11
- 职责（来源：description）：从代码库知识图谱生成 Wiki 文档。

该命令是三个命令中唯一与文档产物直接相关的入口，其描述明确指向"codebase knowledge graph"作为输入来源，说明 build 阶段依赖前置阶段产出的知识图谱数据。

### registerInitCommand

- 位置：src/cli/commands/init.ts:8
- 职责（来源：description）：在项目中初始化 wiki-agent。

按描述，该命令的作用范围是"项目内初始化"，属于使用流程的起点类命令。

### registerScanCommand

- 位置：src/cli/commands/scan.ts:4
- 职责（来源：description）：扫描项目结构并识别技术栈。

该命令描述的关键词为"project structure"与"tech stack"，表明其产出为结构信息与技术栈识别结果。

> 使用场景与命令间的先后依赖（如 init → scan → build 的顺序）：数据中未提供命令间调用边或阶段编排信息，无法确认。

---

## 导出函数

以下导出函数按所属文件分组呈现。分组依据仅为文件路径，不代表数据中存在模块依赖声明。部分函数在数据中带有 docstring，可据此说明其用途；无 docstring 的函数仅列出签名与位置，不作用途断言。

### MCP 客户端数据适配（src/mcp/codebase-memory-client.ts）

该文件内的导出函数均为列式/原始数据到内部结构的适配器，docstring 中用箭头形式写出了"输入形态 → 输出形态"的转换关系。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `adaptArchitecture` | `(raw: Record<string, any>)` | `get_architecture` 列式表 → `ArchitectureData` 对象数组 | src/mcp/codebase-memory-client.ts:45 |
| `adaptSide` | `(side: unknown)` | 无 docstring | src/mcp/codebase-memory-client.ts:93 |
| `adaptTrace` | `(raw: Record<string, any>)` | `trace_path` 分组列式表 → 扁平 `TraceNode[]` | src/mcp/codebase-memory-client.ts:92 |

- `adaptArchitecture`（src/mcp/codebase-memory-client.ts:45）：接收通用记录对象，把 `get_architecture` 返回的列式表转换为 `ArchitectureData` 对象数组，是架构数据进入内部模型的转换点。
- `adaptTrace`（src/mcp/codebase-memory-client.ts:92）：把 `trace_path` 的分组列式表压平为 `TraceNode[]`，即将分组结构转为一维节点序列。
- `adaptSide`（src/mcp/codebase-memory-client.ts:93）：签名为 `(side: unknown)`，参数类型为 `unknown`，无 docstring，功能无法从数据确认。

### Markdown 构建器（src/knowledge/wiki-builder.ts）

该文件是一组链式/追加式写入原语的集合，围绕 Markdown 语法层级展开：从一级标题到二级、三级标题，再到段落、代码块、表格、列表与空行。每个函数的 docstring 均描述了它写入的 Markdown 形态。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `addTitle` | `(title: string)` | 添加一级标题：`# title` | src/knowledge/wiki-builder.ts:11 |
| `addSection` | `(title: string, content: string)` | 添加二级章节：`## title` +（content 非空时）`\n\ncontent` | src/knowledge/wiki-builder.ts:17 |
| `addSubSection` | `(title: string, content: string)` | 添加三级子章节：`### title` +（content 非空时）`\n\ncontent` | src/knowledge/wiki-builder.ts:23 |
| `addParagraph` | `(text: string)` | 添加普通段落 | src/knowledge/wiki-builder.ts:29 |
| `addCodeBlock` | `(language: string, code: string)` | 添加带可选语言提示的围栏代码块 | src/knowledge/wiki-builder.ts:35 |
| `addTable` | `(headers: string[], rows: string[][])` | 由表头与行数据添加 Markdown 表格 | src/knowledge/wiki-builder.ts:41 |
| `addBulletList` | `(items: string[])` | 添加无序列表 | src/knowledge/wiki-builder.ts:50 |
| `addNewline` | `()` | 添加一个空行 | src/knowledge/wiki-builder.ts:56 |

- `addTitle` 与 `addSection` / `addSubSection`（src/knowledge/wiki-builder.ts:11、17、23）：三者构成标题层级写入序列，其中后两者在 `content` 非空时才追加正文，空内容不会产生多余空行。
- `addCodeBlock`（src/knowledge/wiki-builder.ts:35）：语言提示为可选参数，说明调用方可以只输出无语言标注的围栏块。
- `addTable`（src/knowledge/wiki-builder.ts:41）：入参为表头数组与二维行数组，天然对应 Markdown 表结构。
- `addParagraph`、`addBulletList`、`addNewline`（src/knowledge/wiki-builder.ts:29、50、56）：分别负责正文段落、列表与空行三种排版原子操作。

### 证据登记与确认待办（src/knowledge/wiki-evidence.ts、src/knowledge/confirmation/types.ts）

该组函数涉及"证据分级登记"与"待确认项收集"两类数据管理操作，两者在数据中均无 docstring，故仅列出签名与位置。

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `add` | `(file: string, tier: number)` | 无 docstring | src/knowledge/wiki-evidence.ts:117 |
| `addPending` | `(\n  byKey: Map<string, PendingConfirmation>,\n  kind: PendingKind,\n  text: string,\n  contextLine: string,\n  page: string,\n)` | 无 docstring | src/knowledge/confirmation/types.ts:49 |

- `add`（src/knowledge/wiki-evidence.ts:117）：入参为文件路径与数字型 `tier`，签名本身呈现出"按文件 + 等级登记"的形态，具体语义无 docstring 佐证。
- `addPending`（src/knowledge/confirmation/types.ts:49）：入参为 `Map<string, PendingConfirmation>` 索引表，以及 `PendingKind` 类别、文本、上下文行、页面五个维度，签名显示待确认项需要同时携带分类与来源页面信息。

### 源码回落与上下文补强（src/knowledge/fallback/shared.ts、src/knowledge/context/shared.ts）

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `anchorText` | `(file: string, line: number)` | 无 docstring | src/knowledge/fallback/shared.ts:115 |
| `appendSourceFallback` | `(deps: ContextDeps, existing: Array<{ name: string }>)` | 源码回落：图谱补强未覆盖的热点/入口名，交正则探测补齐。找到的名字记入 `fallbackSymbolNames`（供断言校验 universe 回填） | src/knowledge/context/shared.ts:288 |

- `appendSourceFallback`（src/knowledge/context/shared.ts:288）：其 docstring 明确了两件事——一是触发条件为"图谱补强未覆盖的热点/入口名"，二是补齐手段为"正则探测"，并把命中名字记入 `fallbackSymbolNames` 以供断言校验时回填 universe。
- `anchorText`（src/knowledge/fallback/shared.ts:115)：入参为文件路径与行号，返回形态未在数据中给出。

### CLI 入口与确认交互（src/cli/index.ts、src/cli/confirm-interaction.ts）

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `createProgram` | 未在数据中提供 | 无 docstring | src/cli/index.ts:23 |
| `runConfirmationSession` | 未在数据中提供 | 无 docstring | src/cli/confirm-interaction.ts:23 |

- `createProgram`（src/cli/index.ts:23）与 `runConfirmationSession`（src/cli/confirm-interaction.ts:23）：两者在数据中均无签名与 docstring，仅可确认其位于 CLI 目录下的入口/交互文件内。

### 声明校验（src/knowledge/claim-verifier.ts）

| 函数名 | 签名 | 说明 | 源文件:行号 |
| --- | --- | --- | --- |
| `extractClaims` | 未在数据中提供 | 无 docstring | src/knowledge/claim-verifier.ts:72 |
| `verifyAndAnnotateClaims` | 未在数据中提供 | 无 docstring | src/knowledge/claim-verifier.ts:120 |
| `isCommentLine` | 未在数据中提供 | 无 docstring | src/knowledge/claim-verifier.ts:0 |

- `extractClaims`（src/knowledge/claim-verifier.ts:72）与 `verifyAndAnnotateClaims`（src/knowledge/claim-verifier.ts:120）：命名上呈现"抽取"与"校验并标注"两个动作，但数据中无 docstring，不作为事实断言。
- `isCommentLine`（src/knowledge/claim-verifier.ts:0）：记录行号为 0，与同文件其余符号（72、120）差异明显，其真实定义位置无法从数据确认。

> 推断（依据：命名与签名特征）：`createProgram` 的命名与位于 src/cli/index.ts:23 的位置，指向一个构造 CLI 程序对象的工厂；`adaptSide`（src/mcp/codebase-memory-client.ts:93）的 `side` 入参与其同文件 `adaptArchitecture`/`adaptTrace` 的适配器命名一致，指向对某一"单侧"数据的适配。以上仅为推断，数据中无 docstring 或调用点佐证。

---

## 框架节点

数据中 `frameworkNodes` 为空数组，未发现 Controller、Router 等框架级节点；`supplementalSymbols` 同样为空。因此本页不提供框架组件表，也没有可绘制的类层次图（数据中不含继承关系）。

---

## 待确认

1. **CLI 命令的参数与选项**：`commands` 数据仅含 `name`、`description`、`file` 三个字段，三个命令的具体参数、选项与使用示例均无数据支撑，无法列出。
2. **无 docstring 函数的用途**：`adaptSide`（src/mcp/codebase-memory-client.ts:93）、`add`（src/knowledge/wiki-evidence.ts:117）、`addPending`（src/knowledge/confirmation/types.ts:49）、`anchorText`（src/knowledge/fallback/shared.ts:115）、`createProgram`（src/cli/index.ts:23）、`runConfirmationSession`（src/cli/confirm-interaction.ts:23）、`extractClaims`（src/knowledge/claim-verifier.ts:72）、`verifyAndAnnotateClaims`（src/knowledge/claim-verifier.ts:120）、`isCommentLine`（src/knowledge/claim-verifier.ts:0）缺少 docstring，其用途与返回结构无法从本页数据确认。
## Related

- 同目录：[cli.md](cli.md)
- 共享 3 个源文件、共享 15 个符号：[glossary.md](../07-reference/glossary.md)
- 共享 6 个源文件、共享 6 个符号：[architecture.md](../02-architecture/architecture.md)
- 共享 6 个源文件、共享 5 个符号：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)
