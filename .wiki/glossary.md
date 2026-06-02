# 关键概念

本文档列出了该项目的主要类型和函数，帮助您快速了解项目的核心架构和功能模块。符号按功能分组，涵盖核心服务、数据模型、知识管理、工具函数和 CLI 命令等。

## 核心服务

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `DatabaseConnection` | export | `src/core/database.ts` | 数据库连接管理，提供与 SQLite 数据库交互的基础接口 |
| `CommanderResolver` | import | `src/services/index-service.ts` | 命令解析器，用于解析和调度 CLI 命令 |

## 数据模型

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `Document` | export | `src/core/types.ts` | 文档表示，描述一个代码文档或知识条目 |
| `Chunk` | export | `src/core/types.ts` | 文档片段，表示文档的一个分割单元 |
| `ChunkType` | export | `src/core/types.ts` | 片段类型枚举，可能定义不同的片段分类（如函数、类等） |
| `ChunkMetadata` | export | `src/core/types.ts` | 片段元数据，存储片段的附加信息（如位置、上下文） |
| `ChunkRow` | interface | `src/core/retrieval/fts-search.ts` | 数据库行结构，用于全文搜索的结果映射 |
| `ExtractedSymbol` | export | `src/core/symbol-extractor.ts` | 提取的符号结构，表示从代码中解析出的关键符号信息 |

## 知识管理策略

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `AgentWikiStrategy` | export | `src/knowledge/strategies/agent-wiki.ts` | 代理维基策略，可能用于生成或查询代理相关的知识 |
| `BackendWikiStrategy` | export | `src/knowledge/strategies/backend-wiki.ts` | 后端维基策略，处理后端技术栈的知识管理 |
| `CliWikiStrategy` | export | `src/knowledge/strategies/cli-wiki.ts` | CLI 维基策略，专注于命令行工具的知识组织 |
| `BaseWikiStrategy` | import | `src/knowledge/strategies/agent-wiki.ts` | 维基策略基类，提供策略模式的公共接口和实现 |

## 知识上下文类型

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `ApiContext` | export | `src/knowledge/types.ts` | API 上下文，描述项目中与 API 相关的知识信息 |
| `ArchitectureContext` | export | `src/knowledge/types.ts` | 架构上下文，包含系统架构设计相关的知识 |
| `BusinessContext` | export | `src/knowledge/types.ts` | 业务上下文，描述业务逻辑和领域知识 |
| `DataFlowContext` | export | `src/knowledge/types.ts` | 数据流上下文，说明数据在系统中的流向和转换 |
| `DesignDecisionsContext` | export | `src/knowledge/types.ts` | 设计决策上下文，记录关键设计选择和理由 |
| `DesignPattern` | export | `src/knowledge/types.ts` | 设计模式，描述使用的设计模式及其应用场景 |
| `ExecutionPipeline` | export | `src/knowledge/types.ts` | 执行管道，定义知识查询或处理的工作流 |

## CLI 命令

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `CommandOptions` | export | `src/cli/commands/types.ts` | 命令选项类型，定义 CLI 命令的参数和配置 |
| `Command` | import | `src/cli/commands/ask.ts` | 命令处理器，用于实现具体的 CLI 命令逻辑 |

## 常量和工具

| 名称 | 类型 | 所属文件 | 简要说明 |
|------|------|----------|----------|
| `AGENT_DIR` | import | `src/cli/commands/ask.ts` | 代理目录常量，指定存储代理相关文件的路径 |
| `CACHE_DIR` | import | `src/cli/commands/init.ts` | 缓存目录常量，配置缓存文件的存储位置 |
| `CODE_EXTENSIONS` | import | `src/core/scanner.ts` | 代码扩展名集合，定义扫描时支持的文件类型 |
| `DB_NAME` | import | `src/cli/commands/ask.ts` | 数据库名称常量，指定 SQLite 数据库文件的名称 |
| `ClassifiedQuery` | import | `src/core/retrieval/intent-classifier.ts` | 分类查询结构，用于表示经过意图分类后的查询对象 |