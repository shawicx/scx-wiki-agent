# API 参考文档

本文档汇总了项目的对外接口，包括 CLI 命令、核心功能函数以及共享工具函数。通过这些接口，开发者可以完成代码库的分析、索引、构建、查询等操作。所有接口均以 TypeScript 实现，源文件路径及行号已标出。

## CLI 命令

命令行接口提供了六个核心命令，用于初始化、扫描、索引、构建和问答等操作。命令通过 `createProgram` 函数注册。

| 命令 | 说明 | 源文件位置 |
|------|------|------------|
| `registerAskCommand` | 注册问答命令，支持基于知识库的自然语言查询 | `src/cli/commands/ask.ts:8` |
| `registerIndexCommand` | 注册索引命令，对代码仓库构建索引 | `src/cli/commands/index.ts:7` |
| `registerInitCommand` | 注册初始化命令，创建项目配置文件 | `src/cli/commands/init.ts:6` |
| `registerScanCommand` | 注册扫描命令，分析代码文件并提取符号 | `src/cli/commands/scan.ts:4` |
| `registerBuildCommand` | 注册构建命令，根据索引生成知识库 | `src/cli/commands/build.ts:8` |
| `registerUpdateCommand` | 注册更新命令，增量更新已有索引 | `src/cli/commands/update.ts:7` |

## 核心功能函数

### 数据库操作

以下函数管理 SQLite 数据库的创建与关闭，用于持久化存储代码索引和知识库。

| 函数名 | 源文件:行号 |
|--------|-------------|
| `createDatabase` | `src/core/database.ts:68` |
| `closeDatabase` | `src/core/database.ts:82` |

### 符号提取

以下函数从源代码中提取符号（类、函数、变量等）及其可见性、导入关系等信息。

| 函数名 | 源文件:行号 |
|--------|-------------|
| `extractSymbols` | `src/core/symbol-extractor.ts:33` |
| `extractMethod` | `src/core/symbol-extractor.ts:130` |
| `extractImport` | `src/core/symbol-extractor.ts:155` |
| `extractImportNames` | `src/core/symbol-extractor.ts:199` |
| `detectVisibility` | `src/core/symbol-extractor.ts:238` |
| `getExportedName` | `src/core/symbol-extractor.ts:255` |
| `makeSymbol` | `src/core/symbol-extractor.ts:266` |

### 共享工具函数

提供哈希计算、ID 生成、语言检测等通用功能。

| 函数名 | 源文件:行号 |
|--------|-------------|
| `computeHash` | `src/shared/utils.ts:18` |
| `generateId` | `src/shared/utils.ts:31` |
| `getFileLanguage` | `src/shared/utils.ts:22` |

### CLI 辅助函数

用于定位项目根目录和创建命令行程序入口。

| 函数名 | 源文件:行号 |
|--------|-------------|
| `createProgram` | `src/cli/index.ts:7` |
| `findProjectRoot` | `src/cli/utils.ts:4` |

## 测试辅助函数

以下函数仅在测试环境使用，用于构建测试数据。

| 函数名 | 源文件:行号 |
|--------|-------------|
| `makeBackendScanResult` | `tests/services/wiki-service.test.ts:11` |
| `makeScanResult` | `tests/knowledge/strategies/agent-wiki.test.ts:11` |

## 框架节点

当前版本未使用 Controller、Router 等框架节点，所有逻辑均通过 CLI 命令和核心函数直接调用。