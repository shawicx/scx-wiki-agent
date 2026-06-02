# 设计决策文档

## 设计哲学概述

本项目的设计哲学是**策略化可扩展性**，核心思想是“变化隔离，组合复用”。系统将同类问题的不同解决方案抽象为可互换的策略组件，并通过统一的注册机制动态组合。这种设计使得新增一种框架或工具的支持，无需修改核心逻辑，只需添加一个独立的策略实现即可，从而实现了高内聚低耦合、易于测试和持续演进的架构目标。

## 设计模式分析

### 策略模式

**在项目中的具体应用**

策略模式是项目的核心架构模式。系统定义了一个统一的解析器接口，并针对不同框架和工具提供了多种具体实现，包括PathResolver、SymbolResolver、CommanderResolver、LangGraphResolver、MastraResolver、NestResolver、ReactResolver、TauriResolver和VueResolver等。所有这些解析器通过一个名为ResolverRegistry的注册中心进行统一管理。当系统需要解析某个模块或符号时，它会查询注册中心，获取合适的解析器实例来执行具体的解析逻辑。

**带来的好处**

这种设计带来了几个关键优势。首先，新增对一种框架或工具的支持变得非常简单，只需创建一个新的解析器并注册即可，完全不影响现有代码。其次，每个解析器可以独立开发和测试，降低了复杂度。最后，系统在运行时可以根据上下文动态选择合适的解析策略，具有很高的灵活性。

**相关文件**

- src/strategy/resolver-registry.ts
- src/core/path-resolver.ts
- src/core/symbol-resolver.ts
- src/strategy/resolvers/commander-resolver.ts
- src/strategy/resolvers/langgraph-resolver.ts
- src/strategy/resolvers/mastra-resolver.ts
- src/strategy/resolvers/nest-resolver.ts
- src/strategy/resolvers/react-resolver.ts
- src/strategy/resolvers/tauri-resolver.ts
- src/strategy/resolvers/vue-resolver.ts

## 技术选型说明

### SQLite（通过 better-sqlite3 库）

**选型理由**

SQLite被选为系统的主要数据存储方案，主要是因为它的嵌入式和零配置特性。作为一个文件数据库，它不需要单独的数据库服务器进程，简化了部署和运维。特别是它内置的FTS5全文搜索引擎，为代码符号的快速检索提供了原生支持，这对于代码分析工具来说至关重要。

**在项目中的角色**

SQLite扮演着持久化数据存储的核心角色。它存储了经过解析的代码结构信息，包括模块路径、符号定义、引用关系等元数据。系统通过FTS5全文搜索能力，支持对代码符号进行高效的模糊查询和模式匹配，为用户提供快速的导航和搜索体验。

### Tree-sitter

**选型理由**

Tree-sitter的选型基于其对增量式AST解析的支持。传统的解析器每次都需要重新解析整个源文件，而Tree-sitter可以复用之前的解析结果，只对修改的部分进行增量更新。这种机制特别适合代码编辑器的场景，能够在用户修改代码时提供近乎实时的语法树更新。

**在项目中的角色**

Tree-sitter在系统中承担代码解析引擎的角色。它负责将源代码文件解析为结构化的抽象语法树，并从中提取出变量定义、函数声明、类定义等符号信息。这些信息随后被传递给解析器策略进行进一步处理，最终存入SQLite数据库中用于检索。