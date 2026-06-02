# API 参考文档

本项目的对外接口主要由命令行界面（CLI）和核心导出的工具函数组成。CLI 提供了六个注册命令，用于执行扫描、构建、索引等操作；核心模块导出了一系列与数据库管理、符号提取、哈希计算等相关的函数，供内部模块或外部使用者调用。以下按功能分类详细列出。

## 命令行接口

CLI 模块通过 `createProgram` 函数创建入口程序，并注册了六个命令。各命令的说明和源文件位置如下：

| 命令名 | 说明 | 源文件位置 |
|--------|------|------------|
| `registerAskCommand` | 注册“询问”命令，用于提交查询并获取回答 | `src/cli/commands/ask.ts:8` |
| `registerBuildCommand` | 注册“构建”命令，用于触发项目构建流程 | `src/cli/commands/build.ts:9` |
| `registerIndexCommand` | 注册“索引”命令，用于创建或更新索引数据 | `src/cli/commands/index.ts:7` |
| `registerInitCommand` | 注册“初始化”命令，用于初始化项目配置 | `src/cli/commands/init.ts:6` |
| `registerScanCommand` | 注册“扫描”命令，用于扫描代码源文件并提取信息 | `src/cli/commands/scan.ts:4` |
| `registerUpdateCommand` | 注册“更新”命令，用于更新已有数据或配置 | `src/cli/commands/update.ts:7` |

此外，CLI 还提供了辅助工具函数 `findProjectRoot`（位于 `src/cli/utils.ts:4`），用于查找项目的根目录路径。

## 导出函数

### 数据库管理

以下函数用于数据库的创建与关闭，定义在 `src/core/database.ts` 中：

| 函数名 | 源文件:行号 |
|--------|-------------|
| `createDatabase` | `src/core/database.ts:68` |
| `closeDatabase` | `src/core/database.ts:106` |

### 符号提取与分析

核心的符号提取逻辑集中在 `src/core/symbol-extractor.ts` 中，提供了一系列用于分析和提取代码符号的函数：

| 函数名 | 源文件:行号 |
|--------|-------------|
| `extractSymbols` | `src/core/symbol-extractor.ts:33` |
| `extractMethod` | `src/core/symbol-extractor.ts:130` |
| `extractImport` | `src/core/symbol-extractor.ts:155` |
| `extractImportNames` | `src/core/symbol-extractor.ts:199` |
| `detectVisibility` | `src/core/symbol-extractor.ts:238` |
| `getExportedName` | `src/core/symbol-extractor.ts:255` |
| `makeSymbol` | `src/core/symbol-extractor.ts:266` |
| `extractCalls` | `src/core/symbol-extractor.ts:311` |
| `currentScope` | `src/core/symbol-extractor.ts:324` |
| `popScope` | `src/core/symbol-extractor.ts:332` |
| `extractCallExpression` | `src/core/symbol-extractor.ts:431` |

### 通用工具函数

共享工具函数位于 `src/shared/utils.ts` 中，提供基础计算与语言检测能力：

| 函数名 | 源文件:行号 |
|--------|-------------|
| `computeHash` | `src/shared/utils.ts:18` |
| `getFileLanguage` | `src/shared/utils.ts:22` |
| `generateId` | `src/shared/utils.ts:31` |

### 入口函数

`createProgram` 函数位于 `src/cli/index.ts:9`，作为 CLI 程序的创建入口，负责组装和启动命令行应用。

## 框架相关节点

文档中未提供框架相关的节点（如 Controller、Router）信息。