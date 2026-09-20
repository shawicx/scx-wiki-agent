# 模块文档

<details>
<summary>Relevant source files</summary>

- src/knowledge/page-registry.ts
- src/knowledge/wiki-builder.ts
- src/knowledge/wiki-context-builder.ts
- src/knowledge/wiki-evidence.ts
- src/knowledge/wiki-fallback-builder.ts
- src/knowledge/wiki-quality-validator.ts
- src/mcp/codebase-memory-client.ts
- src/services/wiki-service.ts
</details>

本项目的模块组织围绕"知识库（wiki）生成流水线"展开，职责分层清晰：`services` 层提供面向调用方的构建入口（`buildWiki`），`knowledge` 层承担 Markdown 页面组装、上下文构建、证据生成、页面注册与质量校验，`mcp` 层负责与 codebase-memory 数据源的协议适配（列式表/对象数组兼容）。其余模块（`core`、`fixtures`、`cli`、`shared`、`helpers`）在当前数据中未提供文件与符号信息。整体设计意图是：将"数据获取（mcp）—页面编排（knowledge）—流程编排（services）"三段解耦，并通过质量校验环节保证产出页面的可追溯性（锚点、有效链接、非空壳、Mermaid 合法性、密钥泄漏检查）。

> 说明：本次数据中所有模块的 `dependsOn` 与 `usedBy` 均为空数组，因此"交互方式"小节在无源码调用点佐证时统一标注为「待确认」，不进行推测（遵循 R3/R5）。

---

## 1. knowledge 模块

### 职责

`knowledge` 模块是本项目的核心业务层，负责将结构化的知识数据渲染为 Markdown 页面、构建各类页面所需的上下文、生成证据块、注册相关联页面、并对最终页面执行质量校验。从 `topSymbols` 与 `fileSymbols` 可以看出，它同时覆盖了**输出组装**（`wiki-builder.ts` 的 `addSection` / `addSubSection` / `addParagraph` / `addBulletList` / `addCodeBlock` / `addNewline`）、**降级渲染**（`wiki-fallback-builder.ts` 的 `buildApi` / `buildArchitecture` / `buildByName` / `buildCalls` / `buildClasses`）、**上下文构建**（`wiki-context-builder.ts` 的 `buildApiContext` / `buildArchitectureContext` / `buildByName` / `buildCallChainFromEdges` / `buildCallsContext`）、**证据生成**（`wiki-evidence.ts` 的 `buildEvidenceBlock`）、**相关页注册**（`page-registry.ts` 的 `buildRelatedSection`）以及**质量校验**（`wiki-quality-validator.ts` 的 `checkAnchors` / `checkDeadLinks` / `checkEmptyShell` / `checkMermaid` / `checkSecrets`）六个方面。

### 设计意图

该模块构建了一条从"上下文 → 页面渲染 → 质量把关"的内部链路：

- `wiki-context-builder.ts` 与 `wiki-builder.ts` 构成正常生成路径：先构建上下文，再用 builder 的原子方法拼装页面。
- `wiki-fallback-builder.ts` 提供降级路径（`buildByName` 在上下文构建器与降级构建器中**同名出现**，暗示两条路径以同一分派名对外暴露，用于生成器在正常路径不可用时回退）。
- `wiki-evidence.ts` 与 `page-registry.ts` 分别产出页面的"证据"与"相关页面"内容块，属于页面增强层。
- `wiki-quality-validator.ts` 是出口守卫：`checkAnchors`（锚点）、`checkDeadLinks`（死链）、`checkEmptyShell`（空壳页）、`checkMermaid`（图表）、`checkSecrets`（密钥），五项检查覆盖了本仓库 JSON 数据中体现的所有页面质量铁律的验证需求。

### 交互方式

当前数据中 `knowledge` 模块的 `dependsOn` 与 `usedBy` 均为空数组，未提供任何模块级依赖边。因此模块间的调用/被调用关系「待确认」（缺少调用方→被调用方的 file:line 证据）。可确认的事实仅为：`know‌ledge` 内部存在多个同名符号的"双实现"现象（`buildByName` 同时出现在 `wiki-fallback-builder.ts` 与 `wiki-context-builder.ts`），是否由同一入口分派需补充源码调用点证据。

### 文件结构

| 文件名 | 关键符号 | 职责 |
| --- | --- | --- |
| `src/knowledge/wiki-builder.ts` | `addBulletList`, `addCodeBlock`, `addNewline`, `addParagraph`, `addSection`（及 `addSubSection`） | Markdown 页面的原子拼接：段落、小节、二级/三级标题、列表、代码块、空行 |
| `src/knowledge/wiki-fallback-builder.ts` | `buildApi`, `buildArchitecture`, `buildByName`, `buildCalls`, `buildClasses` | 降级路径的页面构建：按 API、架构、名称、调用、类分别产出页面 |
| `src/knowledge/wiki-context-builder.ts` | `buildApiContext`, `buildArchitectureContext`, `buildByName`, `buildCallChainFromEdges`, `buildCallsContext` | 为各类页面构建上下文；含从边（edges）构建调用链 |
| `src/knowledge/wiki-evidence.ts` | `buildEvidenceBlock(function)` | 构建证据块 |
| `src/knowledge/page-registry.ts` | `buildRelatedSection(function)` | 构建页面的"相关页面"区块 |
| `src/knowledge/wiki-quality-validator.ts` | `checkAnchors`, `checkDeadLinks`, `checkEmptyShell`, `checkMermaid`, `checkSecrets` | 页面质量校验：锚点、死链、空壳、Mermaid 合法性、密钥泄漏 |

### 核心符号

**wiki-builder.ts — 页面原子组装方法**

- `addSection(title: string, content: string)`：添加二级章节，输出形如 `## title\n\ncontent`。
- `addSubSection(title: string, content: string)`：添加三级子章节，输出形如 `### title\n\ncontent`。
- `addParagraph(text: string)`：添加一个纯文本段落。
- `addBulletList(items: string[])`：添加一个无序列表。
- `addCodeBlock(language: string, code: string)`：添加带可选语言提示的围栏代码块。
- `addNewline()`：添加一个空行。

**wiki-fallback-builder.ts — 降级页面构建**

- `buildApi` / `buildArchitecture` / `buildByName` / `buildCalls` / `buildClasses`：按五种页面主题（API、架构、按名称、调用、类）分别产出页面，作为生成路径的 fallback 实现。

**wiki-context-builder.ts — 上下文构建**

- `buildApiContext` / `buildArchitectureContext` / `buildCallsContext`：分别为 API、架构、调用类页面构建上下文数据。
- `buildByName`：与降级构建器同名，用于按名称构建上下文。
- `buildCallChainFromEdges`：从边（edges）数据构建调用链，是调用类页面上下文的底层支撑。

**wiki-evidence.ts**

- `buildEvidenceBlock(function)`：构建证据块，用于在页面中承载事实来源（与质量校验 `checkAnchors` 对应）。

**page-registry.ts**

- `buildRelatedSection(function)`：构建页面中的"相关页面"区块。

**wiki-quality-validator.ts — 页面质量校验**

- `checkAnchors`：检查锚点（对应文档铁律"每条事实声明必须带锚点"）。
- `checkDeadLinks`：检查失效链接。
- `checkEmptyShell`：检查空壳页面（对应"单页最低内容"要求）。
- `checkMermaid`：检查 Mermaid 图表合法性。
- `checkSecrets`：检查密钥泄漏。

> 以上校验函数的 docstring 在提供数据中为空，其具体判定规则「待确认」（缺少函数体/测试数据佐证）。

---

## 2. services 模块

### 职责

`services` 模块对外暴露 wiki 构建的编排入口 `buildWiki(wikiDir: string, options?: WikiBuildOptions)`，并定义页面产出与写盘结果的数据契约：`PageProduced` interface 与 `PageStatus`。

### 设计意图

该模块是调用方与 `knowledge` 模块之间的门面（Facade）：通过 `buildWiki` 一次性接收输出目录（`wikiDir`）与可选项（`WikiBuildOptions`），内部完成全部页面生成与落盘；通过 `PageProduced`（"最终内容 + 走的生成路径"）与 `PageStatus`（"页面写盘结果状态"）把执行结果结构化回传，使调用方无需感知单页渲染与质量校验细节。

### 交互方式

当前数据中 `services` 模块的 `dependsOn` 与 `usedBy` 均为空数组，未提供模块级依赖边；与 `knowledge`、`mcp` 之间的调用关系「待确认」（缺少调用方→被调用方的 file:line 证据）。

### 文件结构

| 文件名 | 关键符号 | 职责 |
| --- | --- | --- |
| `src/services/wiki-service.ts` | `PageProduced`(interface), `PageStatus`(function), `buildWiki`(method) | wiki 构建服务：单页产出契约、写盘状态、总构建入口 |

### 核心符号

- `buildWiki(wikiDir: string, options?: WikiBuildOptions)`：wiki 构建的总入口方法，接收目标目录与可选构建选项。
- `PageProduced`（interface）：单页产出结果契约——**最终内容 + 走的生成路径**，用于区分正常/降级路径的产出。
- `PageStatus`（function）：页面写盘结果状态。

> `WikiBuildOptions` 的类型定义位置在当前数据中未提供「待确认」。

---

## 3. mcp 模块

### 职责

`mcp` 模块是数据来源适配层，位于 `src/mcp/codebase-memory-client.ts`。它负责把 codebase-memory 返回的数据形态转换为本项目内部使用的结构：`adaptArchitecture` 将 get_architecture 的列式表转为 `ArchitectureData` 对象数组；`adaptTrace` 将 trace_path 的分组列式表转为扁平的 `TraceNode[]`；`asObjects` 兼容"旧版对象数组 / 新版列式表"两种形态；`adaptSide` 处理 side 字段的适配。

### 设计意图

该模块存在的直接依据是数据源协议的版本差异：CLIENT 需要同时兼容旧版对象数组与新版列式表两种返回形态（见 `asObjects` 的 docstring"兼容两种形态"）。因此它被设计为一层**纯适配器（Adapter）**，把外部协议细节（列式表、分组列式表、side 字段）转译为下游可直接消费的对象结构（`ArchitectureData` 数组、`TraceNode[]`），从而使 `knowledge` 层无需感知数据源形态。

### 交互方式

当前数据中 `mcp` 模块的 `dependsOn` 与 `usedBy` 均为空数组；与 `knowledge`、`services` 的调用关系「待确认」（缺少调用方→被调用方的 file:line 证据）。

### 文件结构

| 文件名 | 关键符号 | 职责 |
| --- | --- | --- |
| `src/mcp/codebase-memory-client.ts` | `adaptArchitecture`, `adaptSide`, `adaptTrace`, `asObjects` | codebase-memory 数据形态适配：架构列式表、追踪分组列式表、side 字段、双形态兼容 |

### 核心符号

- `adaptArchitecture(raw: Record<string, any>)`：将 `get_architecture` 返回的列式表转换为 `ArchitectureData` 对象数组。
- `adaptTrace(raw: Record<string, any>)`：将 `trace_path` 的分组列式表转换为扁平 `TraceNode[]`。
- `asObjects(raw: Record<string, unknown>, key: string)`：兼容两种返回形态——旧版对象数组 / 新版列式表。
- `adaptSide(side: unknown)`：对 `side` 字段进行适配。

---

## 4. 其余模块

以下模块在当前数据中提供了名称，但 `files`、`topSymbols`、`fileSymbols`、`dependsOn`、`usedBy` 均为空，无任何可锚定的事实，故仅列出名称，内部细节「待确认」：

| 模块名 | 文件 | 规模信息 |
| --- | --- | --- |
| `core` | 无 | 信息不足 |
| `fixtures` | 无 | 信息不足 |
| `cli` | 无 | 信息不足 |
| `shared` | 无 | 信息不足 |
| `helpers` | 无 | 信息不足 |

---

## 5. 文档生成层面的整体观察

基于上述可确认事实，本项目在文档生成功能上呈现出以下结构特征：

| 环节 | 承载模块/文件 | 可确认的关键符号 |
| --- | --- | --- |
| 数据源适配 | `mcp` / `src/mcp/codebase-memory-client.ts` | `adaptArchitecture`, `adaptTrace`, `asObjects`, `adaptSide` |
| 上下文构建 | `knowledge` / `src/knowledge/wiki-context-builder.ts` | `buildApiContext`, `buildArchitectureContext`, `buildByName`, `buildCallChainFromEdges`, `buildCallsContext` |
| 主路径渲染 | `knowledge` / `src/knowledge/wiki-builder.ts` | `addSection`, `addSubSection`, `addParagraph`, `addBulletList`, `addCodeBlock`, `addNewline` |
| 降级路径渲染 | `knowledge` / `src/knowledge/wiki-fallback-builder.ts` | `buildApi`, `buildArchitecture`, `buildByName`, `buildCalls`, `buildClasses` |
| 页面增强 | `knowledge` / `src/knowledge/wiki-evidence.ts`、`src/knowledge/page-registry.ts` | `buildEvidenceBlock`, `buildRelatedSection` |
| 质量校验 | `knowledge` / `src/knowledge/wiki-quality-validator.ts` | `checkAnchors`, `checkDeadLinks`, `checkEmptyShell`, `checkMermaid`, `checkSecrets` |
| 流程编排 | `services` / `src/services/wiki-service.ts` | `buildWiki`, `PageProduced`, `PageStatus` |

> 各环节之间的实际调用顺序、入口如何分派正常/降级路径、质量校验在写出前还是写出后执行——均「待确认」，缺少调用点 file:line 与依赖边数据。
## Related

- 同目录：[architecture.md](architecture.md) · [data-flow.md](data-flow.md)
- 总入口：[README](../README.md)
