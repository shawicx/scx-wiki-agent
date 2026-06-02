# scx-wiki-agent

面向软件项目的本地知识库代理。扫描代码、构建可搜索索引、生成结构化 Wiki 文档，并通过检索增强生成回答问题。

## 功能特性

- **项目扫描** — 检测技术栈、框架和项目结构
- **多层索引** — 基于 Tree-sitter 的 AST 解析、符号提取、分块和 FTS5 全文搜索
- **多路检索** — 关键词、语义和图搜索，支持意图分类
- **LLM 增强 Wiki 生成** — 规则模板 + LLM 语义描述，支持纯规则回退
- **流式问答** — 流式响应的代码库问答
- **增量更新** — 基于 git diff 仅重新索引变更文件

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 在项目中初始化
scx-wiki-agent init

# 扫描项目结构
scx-wiki-agent scan

# 构建搜索索引
scx-wiki-agent index

# 生成 Wiki 文档（纯规则，无需 LLM）
scx-wiki-agent build --no-llm

# 使用 LLM 增强描述生成 Wiki
scx-wiki-agent build

# 提问
scx-wiki-agent ask "检索管线是如何工作的？"

# 代码变更后更新索引
scx-wiki-agent update
```

## 命令

| 命令 | 说明 |
|------|------|
| `init` | 在项目中初始化 wiki-agent |
| `scan` | 扫描项目结构，识别技术栈 |
| `index` | 构建本地索引（AST、符号、分块、FTS5） |
| `ask <问题>` | 针对项目提问（支持 `--stream`） |
| `build` | 生成 Wiki 文档 |
| `update` | 基于 git 变更进行增量更新 |

### Build 选项

`build` 命令支持以下选项：

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--model <名称>` | `gpt-4o-mini` | 用于语义描述的 LLM 模型 |
| `--base-url <url>` | — | OpenAI 兼容 API 地址（如 Ollama 用 `http://localhost:11434/v1`） |
| `--no-llm` | 关闭 | 不使用 LLM，纯规则生成 |
| `--pages <列表>` | `all` | 逗号分隔的页面名称列表 |

### 生成的 Wiki 页面

`build` 命令在 `.wiki/` 目录下生成 10 个 Markdown 文件：

| 页面 | 内容 |
|------|------|
| `overview.md` | 项目类型、技术栈、入口文件、关键符号 |
| `architecture.md` | 模块结构与模块间依赖关系 |
| `data-flow.md` | 从入口点追踪的执行时序图 |
| `modules.md` | 各模块的符号、依赖和代码片段 |
| `api.md` | CLI 命令、导出函数、框架节点 |
| `business.md` | 服务类、方法、依赖关系 |
| `design-decisions.md` | 检测到的设计模式和技术选型 |
| `onboarding.md` | 上手指南：环境准备、安装、基本使用 |
| `troubleshooting.md` | 常见问题与故障排除 |
| `glossary.md` | 去重后的符号表 |

## 支持的项目类型

内置框架解析器：

- React（create-react-app、Next.js、Vite React）
- Vue（Vue 2/3、Nuxt）
- NestJS
- Tauri
- LangGraph
- Mastra
- Commander CLI

同时支持通用 TypeScript/JavaScript 项目。

## 配置

### 环境变量

```bash
# ask 命令和 LLM 增强 Wiki 生成所需
export OPENAI_API_KEY="sk-..."

# 使用 Ollama 或其他 OpenAI 兼容提供商
export OPENAI_BASE_URL="http://localhost:11434/v1"
```

### 使用 Ollama

```bash
scx-wiki-agent build --model qwen2.5 --base-url http://localhost:11434/v1
```

## 架构

```
src/
├── cli/commands/        # CLI 命令处理器（init, scan, index, ask, build, update）
├── core/                # 核心扫描、解析和数据库层
│   ├── database.ts      # SQLite Schema 和连接管理
│   ├── scanner.ts       # 文件系统扫描和技术检测
│   ├── parser.ts        # Tree-sitter AST 解析
│   ├── graph/           # 关系图和图查询
│   ├── retrieval/       # 多路检索（FTS、图、符号、混合排序）
│   └── ...
├── knowledge/           # Wiki 生成管线
│   ├── types.ts         # Wiki 上下文类型定义
│   ├── wiki-context-builder.ts   # 从 SQLite 提取页面上下文
│   ├── wiki-page-generator.ts    # LLM 驱动的语义内容生成
│   ├── wiki-fallback-builder.ts  # 纯规则 Markdown 模板
│   └── wiki-builder.ts           # 流式 Markdown 构建工具
├── services/            # 业务逻辑服务
│   ├── wiki-service.ts  # 编排 Wiki 生成管线
│   ├── qa-service.ts    # 流式检索问答
│   └── ...
├── strategy/            # 框架检测和解析
│   ├── resolver-registry.ts      # 策略模式注册表
│   └── resolvers/       # 各框架解析器
└── shared/              # 常量和工具函数
```

## 开发

```bash
pnpm install       # 安装依赖
pnpm build         # 使用 tsup 构建
pnpm test          # 使用 vitest 运行测试
pnpm test:watch    # 监听模式运行测试
pnpm lint          # 使用 tsc --noEmit 类型检查
```

## 许可证

MIT
