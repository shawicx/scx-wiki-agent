好的，这是根据您提供的JSON数据生成的模块文档页面。

# 项目模块文档

本项目采用分层和功能域相结合的模块组织方式，整体结构清晰，职责分明。代码主要分为两大层级：底层基础设施（`src/core`）和上层业务服务（`src/services`）。`src/cli` 作为用户交互入口，调用各服务；`src/strategy` 和 `src/knowledge` 为特定功能领域提供支持；`src/shared` 提供跨模块的通用工具函数。测试代码则按照主模块结构镜像组织，确保各层级的可测试性。

## 1. 核心基础设施 (`src/core`)

### 做什么
该模块是整个项目的基石，负责代码解析、静态分析、数据库存储和图结构建模等所有底层操作。它不依赖于任何上层业务逻辑，是纯数据与元数据的提供者。

### 为什么存在
将核心的代码分析能力抽象出来，形成一个独立的、可复用的底层库。这样做可以隔离复杂性，使得上层的索引、查询、问答等服务可以基于这些稳定、可靠的基础组件来构建，而无需关心 AST 解析、文件扫描、数据库事务等底层细节。

### 怎么交互
`src/core` 模块是纯粹的底层模块，它不主动依赖 `src/services` 或 `src/cli` 等其他任何业务模块。上层的 `IndexService`、`RetrievalService` 等服务会依赖本模块的 `FileScanner`、`TreeSitterParser`、`DatabaseConnection` 和 `RelationGraph` 等核心类来完成主要工作。`src/cli` 中的命令（如 `index`、`build`）也直接依赖 `createDatabase` 和 `closeDatabase` 来管理数据库生命周期。

### 文件结构

| 文件名 | 关键符号 | 职责 |
| :--- | :--- | :--- |
| `types.ts` | `Language`, `SymbolType`, `RelationType`, `Document`, `Chunk`, `Symbol`, `Relation`, `ModuleInfo`, `ProjectNode` | 定义整个核心模块中使用的所有核心数据结构和枚举类型。 |
| `scanner.ts` | `FileScanner`, `ScanResult`, `ScannedFile` | 遍历项目目录，识别并过滤出需要被分析的文件，生成扫描结果。 |
| `parser.ts` | `TreeSitterParser` | 封装 Tree-sitter 库，将源代码文件解析成 AST（抽象语法树）。 |
| `symbol-extractor.ts` | `extractSymbols`, `extractCalls`, `ExtractedSymbol`, `ExtractedCall` | 从 AST 中提取函数、类、变量、导入语句等符号信息，以及函数调用关系。 |
| `symbol-resolver.ts` | `SymbolResolver`, `ImportInfo`, `SymbolLocation` | 解析符号的跨文件引用，建立导入链，定位符号的实际定义位置。 |
| `path-resolver.ts` | `PathResolver` | 处理 TypeScript 路径别名（如 `@/`），将模糊路径解析为实际的文件系统路径。 |
| `module-index.ts` | `ModuleIndex` | 根据提取的符号和文件信息，构建项目模块索引，提供模块间的依赖关系。 |
| `database.ts` | `DatabaseConnection`, `createDatabase`, `closeDatabase` | 管理 SQLite 数据库的连接、创建、关闭和 schema 迁移，是数据持久化的基础。 |

## 2. 图数据库与查询 (`src/core/graph`)

### 做什么
在核心模块之上，构建了一个轻量级的图数据库引擎，用于存储和查询代码实体（节点）及其之间的关系（边），支持路径、调用链等复杂查询。

### 为什么存在
关系型数据库在处理“A 调用了 B 哪些方法？”或“从入口点到数据处理函数的调用链路是什么？”这类连续、多跳的图遍历问题时效率不高。引入图结构可以更自然地建模代码的拓扑关系，为后续的智能查询和分析提供高效的数据结构支持。

### 怎么交互
该模块强依赖 `src/core/database.ts` 中的 `DatabaseConnection`，将图数据持久化到 SQLite 表中。`IndexService` 在索引完成后，会将实体和关系写入 `RelationGraph`。`RetrievalService` 中的 `GraphSearch` 和 `QAService` 会通过 `GraphQuery` 进行图遍历查询，以获取代码之间的深层联系。

### 文件结构

| 文件名 | 关键符号 | 职责 |
| :--- | :--- | :--- |
| `types.ts` | `GraphNode`, `GraphEdge`, `GraphPath` | 定义图的基本元素类型：节点、边和路径。 |
| `relation-graph.ts` | `RelationGraph` | 图的核心类，提供添加节点/边、根据节点ID查询、以及从数据库构建/恢复图的功能。 |
| `graph-query.ts` | `GraphQuery` | 提供高级图查询能力，如查找两个节点之间的最短路径或调用链 (`findCallChain`)。 |

## 3. 检索服务 (`src/core/retrieval`)

### 做什么
提供多策略的代码信息检索能力，包括全文搜索（FTS）、符号搜索、基于图的邻近搜索，以及意图分类和混合排序器，用于理解用户查询意图并返回最佳结果。

### 为什么存在
单纯的文本搜索或符号匹配无法满足智能问答场景。该项目需要一个能够理解“查询一个函数的调用者”或“查找涉及特定模块的代码片段”这类复杂查询的系统。该模块通过组合不同的检索策略和意图分类，实现了对用户查询的深度理解和精准响应。

### 怎么交互
该模块是 `RetrievalService` 的核心依赖。`RetrievalService` 会根据 `IntentClassifier` 判断出的查询意图（如 `SearchSymbol`, `SearchText`），组合使用 `FtsSearch`、`SymbolSearch` 和 `GraphSearch` 进行多路召回，最后通过 `HybridRanker` 合并并排序所有结果。

### 文件结构

| 文件名 | 关键符号 | 职责 |
| :--- | :--- | :--- |
| `types.ts` | `ClassifiedQuery`, `RetrievalResult`, `QueryIntent`, `RankedResult` | 定义检索相关的数据结构和枚举，如意图分类、原始检索结果和排序后的结果。 |
| `intent-classifier.ts` | `IntentClassifier` | 对用户输入的查询文本进行意图分类（如查找符号、查找文本、查找关系）。 |
| `fts-search.ts` | `FtsSearch` | 执行 SQLite 的全文搜索，快速定位包含特定关键词的代码片段或注释。 |
| `symbol-search.ts` | `SymbolSearch` | 根据符号名称、类型或所属文件进行精确查找。 |
| `graph-search.ts` | `GraphSearch` | 根据符号ID，在图数据库中查找其相关的节点（如调用者、被调用者、相邻模块）。 |
| `hybrid-ranker.ts` | `HybridRanker` | 接收来自不同检索器的结果，根据权重和相关性进行混合排序，输出最终排名。 |

## 4. 业务服务层 (`src/services`)

### 做什么
将底层核心模块的能力编排成高层次的业务服务，如索引（`IndexService`）、扫描（`ScanService`）、问答（`QAService`）、检索（`RetrievalService`）、wiki构建（`WikiService`）和更新（`UpdateService`）。

### 为什么存在
通过业务服务层来封装复杂的业务流程和依赖关系。CLI 命令只需调用一个简单的服务方法（如 `service.buildWiki()`），而不必关心内部是用了图查询还是全文搜索。这符合单一职责原则和门面模式，使得CLI层代码非常简洁。

### 怎么交互
该模块是 `src/cli` 层的直接消费者。CLI 命令在执行时会实例化相应的 Service，并传入必要的数据库连接或配置参数。例如，`build` 命令会调用 `WikiService.build`，`ask` 命令会调用 `QAService.ask`。Services 之间也存在协作，如 `QAService` 会依赖 `RetrievalService` 来获取上下文。

### 文件结构

| 文件名 | 关键符号 | 职责 |
| :--- | :--- | :--- |
| `scan-service.ts` | `ScanService` | 提供简化版的项目扫描能力，是 `FileScanner` 的门面。 |
| `index-service.ts` | `IndexService` | 负责完整的代码索引流程，协调扫描、解析、符号提取、调用关系分析、图构建和模块索引。 |
| `retrieval-service.ts` | `RetrievalService` | 编排检索流程，整合意图分类、多路检索和混合排序，对外提供统一的 `searchByIntent` 接口。 |
| `qa-service.ts` | `QAService` | 实现问答功能。接收问题后，通过 `RetrievalService` 获取相关上下文，然后调用 LLM 生成答案。 |
| `wiki-service.ts` | `WikiService` | 封装构建项目 wiki 文档的完整流程，从上下文构建到分页生成和文件写入。 |
| `update-service.ts` | `UpdateService` | 基于 Git diff 检测项目文件的增量变化，提供增量更新的能力。 |

## 5. 知识库构建 (`src/knowledge`)

### 做什么
负责构建项目知识库，具体来说是将索引后的代码元数据转化为结构化的、适合 AI 理解或人类阅读的 wiki 页面。它定义了 wiki 的上下文结构，并提供了多种构建策略。

### 为什么存在
代码分析的结果（符号、关系）是碎片化的，需要一种机制将其组织成有逻辑、有层次的文档。该模块定义了统一的文档上下文模型（如架构上下文 `ArchitectureContext`、业务上下文 `BusinessContext`），并通过策略模式支持不同类型项目（如后端、前端、CLI）的差异化文档生成。

### 怎么交互
`WikiService` 是本模块的主要使用者。`WikiService` 会调用 `WikiContextBuilder` 和 `WikiFallbackBuilder` 来构建上下文数据，然后使用 `WikiPageGenerator`（或其他策略）来生成最终的 wiki 文本。`WikiPageGenerator` 依赖 OpenAI 等 LLM 来生成自然语言描述。`LazySummary` 模块用于延迟计算和缓存符号摘要。

### 文件结构

| 文件名 | 关键符号 | 职责 |
| :--- | :--- | :--- |
| `types.ts` | `WikiPageContext`, `WikiBuildOptions`, `ArchitectureContext`, `BusinessContext` 等 | 定义构建 wiki 所需的所有上下文数据结构和配置选项。 |
| `wiki-builder.ts` | `WikiBuilder` | 定义wiki构建的基类和通用接口。 |
| `wiki-context-builder.ts` | `WikiContextBuilder` | 从数据库和扫描结果中提取并组装各种上下文信息。 |
| `wiki-page-generator.ts` | `WikiPageGenerator` | 使用 LLM 将上下文信息 `WikiPageContext` 渲染成最终的 Markdown 页面文本。 |
| `wiki-fallback-builder.ts` | `WikiFallbackBuilder` | 提供不使用 LLM 的备用构建方案，基于模板生成简单的文档。 |
| `lazy-summary.ts` | `LazySummary` | 延迟计算和缓存代码片段的摘要，避免重复的 LLM 调用。 |