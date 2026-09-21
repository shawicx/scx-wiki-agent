# scx-wiki-agent 项目概述

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/config-detector.ts
- src/knowledge/topic-discovery.ts
- src/mcp/codebase-memory-client.ts
- src/services/scan-service.ts
</details>

## 一句话职责

`scx-wiki-agent` 是一个基于 TypeScript 构建的命令行工具（CLI），通过扫描本地代码库、发现知识主题，并借助 AI 能力生成项目 Wiki 文档。它面向需要为代码仓库自动产出结构化文档的开发者场景。

## 项目定位与面向场景

`scx-wiki-agent` 是一个以命令行方式运行的代码文档生成代理。它通过扫描代码库文件、识别主题页面、采集证据文件，并调用 AI 模型（基于 `@ai-sdk/openai` 与 `ai`）来生成项目 Wiki 内容。项目以 `scx-wiki-agent` 作为 npm 包名发布，同时支持 TypeScript 编写与 `tsup` 打包构建，测试使用 `vitest`。面向的场景是为代码仓库自动化产出结构化、AI 友好的项目文档。

## 核心设计思路

从数据可见，项目采用典型的分层 CLI 架构：`src/cli/index.ts` 作为唯一入口点，负责命令注册与调度，底层由核心层（`src/core`）、服务层（`src/services`）、知识层（`src/knowledge`）和 MCP 客户端层（`src/mcp`）协同工作。这种分层结构将文件扫描（`FileScanner`）、扫描编排（`ScanService`）、知识发现（`TopicDiscovery`、`ConfigDetector`）以及外部代码库记忆访问（`CodebaseMemoryClient`）等职责清晰解耦，便于独立演进与测试。

在技术选型上，项目使用 `commander` 处理 CLI 参数解析，使用 `ai` 与 `@ai-sdk/openai` 对接大模型完成文档内容的生成，使用 `ignore` 处理 `.gitignore` 类似的忽略规则以过滤扫描文件。构建工具采用 `tsup`（面向 TypeScript 的快速打包器），测试框架采用 `vitest`，整体形成"CLI 驱动 + AI 生成 + 规则过滤"的设计闭环。

`src/cli/index.ts` 是唯一切入点，整个程序以命令行的方式启动，用户交互完全通过命令行完成，没有其他运行时入口（如 HTTP 服务或库导出）。这种单入口设计降低了使用复杂度，符合文档生成工具的定位。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| `@ai-sdk/openai` | 提供 OpenAI 模型接入能力，供 AI 文档生成使用 |
| `ai` | AI SDK 核心库，用于调用大模型生成内容 |
| `commander` | CLI 命令行参数解析与命令注册 |
| `ignore` | 按忽略规则（如 `.gitignore` 风格）过滤扫描文件 |
| `tsup` | TypeScript 项目打包构建工具 |
| `vitest` | 单元测试框架 |
| TypeScript | 项目主语言（`hasTypeScript: true`） |

技术选型的合理性在于：`commander` 是 Node.js 生态中最成熟的 CLI 框架之一，与项目"纯 CLI 工具"的定位高度契合；`ai` + `@ai-sdk/openai` 组合提供了对多模型/流式生成的统一抽象，便于文档生成逻辑的编写；`ignore` 直接复用成熟的忽略规则解析能力，避免自研扫描过滤逻辑；`tsup` 与 `vitest` 则分别覆盖构建与测试环节，构成完整的 TypeScript 工程链路。

## 项目结构

项目源代码集中在 `src` 目录下（唯一 sourceDir），按职责划分为多个子模块：

| 目录 | 职责 | 关键符号 |
| --- | --- | --- |
| `src/cli` | 命令行入口，解析参数并调度各模块 | 入口文件 `src/cli/index.ts` |
| `src/core` | 核心扫描能力，负责遍历文件 | `FileScanner`（`src/core/scanner.ts`） |
| `src/services` | 服务编排层，将扫描等能力组合为服务 | `ScanService`（`src/services/scan-service.ts`） |
| `src/knowledge` | 知识层，负责主题发现与配置探测 | `TopicDiscovery`（`src/knowledge/topic-discovery.ts`）、`ConfigDetector`（`src/knowledge/config-detector.ts`） |
| `src/mcp` | MCP 客户端层，访问代码库记忆 | `CodebaseMemoryClient`（`src/mcp/codebase-memory-client.ts`） |

目录间的关系呈现自顶向下的依赖链：`cli` 作为入口调用服务层（`services`），服务层依赖核心层的 `FileScanner` 完成文件扫描，同时结合知识层（`knowledge`）进行主题发现与配置探测，并可能通过 `mcp` 层访问代码库记忆。这种划分使每一层职责单一、边界清晰。

## 入口文件

项目只有一个入口点：`src/cli/index.ts`。

该文件作为 CLI 启动入口，承担以下职责：通过 `commander` 解析并注册命令行参数，进而调度 `ScanService` 等服务完成扫描、主题发现与文档生成流程。用户所有操作均从此入口进入，程序以命令行方式交互运行。

> 注：入口文件的逐行启动步骤（如具体注册了哪些子命令、调用顺序）在提供的 JSON 数据中未展开，**待确认**——缺少 `src/cli/index.ts` 的函数级调用链证据。

## 核心组件

从 `topSymbols` 数据看，项目中复杂度最高、最值得关注的组件集中在"主题判定"与"内容生成"两类逻辑上。`isTestPath`（复杂度 15）是复杂度最高的函数，用于判定某个路径是否为测试路径，属于扫描过滤环节的关键判定逻辑；`generate`（复杂度 12）是 AI 文档生成的主函数，承担内容生成的核心流程；`isTopicPage`（复杂度 8）用于判定某页是否为主题页面，与知识发现环节相关。此外 `labelToSymbolType` 负责将标签映射为符号类型，`safeGetSnippet` 负责安全地获取代码片段，`pageRelPath` 负责计算页面的相对路径，`findPageDescriptor` 用于查找页面描述符，`collectEvidenceFiles` 采集证据文件，`validatePageContent` 校验页面内容——这些函数共同构成了"扫描文件 → 发现主题 → 采集证据 → AI 生成 → 校验输出"的完整流水线。

在类组件层，`supplementalSymbols` 提供了五个无复杂度标注的核心类：`CodebaseMemoryClient`（代码库记忆客户端，位于 `src/mcp`）、`ConfigDetector`（配置探测，位于 `src/knowledge`）、`FileScanner`（文件扫描，位于 `src/core`）、`ScanService`（扫描服务，位于 `src/services`）、`TopicDiscovery`（主题发现，位于 `src/knowledge`）。这五个类分别对应 MCP 访问、配置识别、文件遍历、服务编排和主题发现五类职责，构成了项目的主干能力。

## 外部依赖与工具链

除了运行时依赖，项目还集成了构建与测试工具链：`tsup` 用于将 TypeScript 源码打包为可分发的 CLI 产物，`vitest` 用于单元测试。项目共包含 57 个文件（`fileCount: 57`），规模适中。

> **待确认**：项目的 npm scripts（如 `build`、`test`、`dev` 具体命令）、配置文件细节以及各依赖的确切版本，在提供的数据中缺失，无法描述。
## Related

- 同目录：[tech-stack.md](tech-stack.md) · [environment.md](environment.md)
- 总入口：[README](../README.md)
