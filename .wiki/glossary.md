# 关键概念

本页面列出了项目中最重要的顶层类型和函数，按功能分组，帮助您快速了解项目的核心模块和数据结构。

## 核心数据类型

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `Chunk` | 导出类型 | `src/core/types.ts` | 表示代码块的通用数据结构，用于知识检索的片段。 |
| `ChunkMetadata` | 导出类型 | `src/core/types.ts` | 代码块的元数据，包含位置、上下文等信息。 |
| `ChunkType` | 导出类型 | `src/core/types.ts` | 枚举，定义代码块类型（如函数、类、模块等）。 |
| `Document` | 导出类型 | `src/core/types.ts` | 表示一个完整文档（文件）的数据结构。 |
| `ChunkRow` | 接口 | `src/core/retrieval/fts-search.ts` | 全文本搜索结果的单行数据接口。 |
| `CallType` | 导出类型 | `src/core/symbol-extractor.ts` | 定义函数调用类型的枚举（如内部调用、外部调用等）。 |

## 数据库模块

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `DatabaseConnection` | 导出类型 | `src/core/database.ts` | 数据库连接接口，封装了 SQLite 操作（基于 better-sqlite3）。 |

## 知识库策略

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `AgentWikiStrategy` | 导出类 | `src/knowledge/strategies/agent-wiki.ts` | 实现了 Agent Wiki 的知识库策略，针对代理场景的知识管理。 |
| `BackendWikiStrategy` | 导出类 | `src/knowledge/strategies/backend-wiki.ts` | 后端知识库策略，处理后端技术栈的知识存储与检索。 |
| `CliWikiStrategy` | 导出类 | `src/knowledge/strategies/cli-wiki.ts` | CLI 知识库策略，管理命令行工具相关的知识条目。 |

## 知识库上下文类型

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `ApiContext` | 导出类型 | `src/knowledge/types.ts` | API 相关上下文，描述接口调用信息。 |
| `ArchitectureContext` | 导出类型 | `src/knowledge/types.ts` | 架构上下文，存储系统架构相关的知识。 |
| `BusinessContext` | 导出类型 | `src/knowledge/types.ts` | 业务上下文，包含业务逻辑领域的语义信息。 |
| `DataFlowContext` | 导出类型 | `src/knowledge/types.ts` | 数据流上下文，描述数据在系统内的流转路径。 |
| `DesignDecisionsContext` | 导出类型 | `src/knowledge/types.ts` | 设计决策上下文，记录关键设计选择及理由。 |
| `DesignPattern` | 导出类型 | `src/knowledge/types.ts` | 设计模式类型，用于标识代码中使用的设计模式。 |
| `ExecutionPipeline` | 导出类型 | `src/knowledge/types.ts` | 执行管道类型，表示知识处理或代码分析的处理流程。 |

## CLI 与命令

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `CommandOptions` | 导出类型 | `src/cli/commands/types.ts` | CLI 命令选项的配置接口。 |

## 其它

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `ClassifiedQuery` | 导入类型 | `src/core/retrieval/intent-classifier.ts` | 意图分类后的查询结果，用于决定检索策略。 |