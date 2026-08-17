# scx-wiki-agent 项目 Wiki

> 面向 AI 与开发人员的项目知识库。基于仓库真实代码与配置编写；无法从仓库确认的信息一律标注「待确认」。

## 项目元数据

| 项 | 值 | 来源 |
| --- | --- | --- |
| 包名 | `scx-wiki-agent` | `package.json` |
| 版本 | 0.0.1（CLI 内显示 0.1.0，见 [limitations](06-constraints/limitations.md)） | `package.json` / `src/cli/index.ts` |
| License | ISC（README.md 写 MIT，以 package.json 为准） | `package.json` |
| 模块体系 | ESM（`"type": "module"`） | `package.json` |
| 运行时 | Node.js ≥ 18（tsup target node18） | `tsup.config.ts` |
| 包管理器 | pnpm（由 `pnpm-lock.yaml` 探测） | 仓库根 |

## 项目是什么

**scx-wiki-agent** 是一个本地 CLI 工具：调用外部 `codebase-memory-mcp` 知识图谱服务获取代码结构数据（符号、调用关系、复杂度），为任意软件项目生成结构化 Wiki 文档。生成支持 **LLM 语义增强**（Vercel AI SDK 流式输出）与 **纯规则回退** 双路径，并内置四条反幻觉铁律（R1 锚点强制 / R2 边表优于时序图 / R3 拒绝编造用途 / R4 结构化优先）。

详见 [project-overview](01-overview/project-overview.md)。

## 阅读路径

| 你是谁 | 建议路径 |
| --- | --- |
| 新人 / 新会话 AI | overview → architecture → data-flow → cli-commands → onboarding |
| 要改 wiki 生成逻辑 | architecture → modules → page-registry → decisions |
| 要排查运行故障 | troubleshooting → limitations → environment |
| 要查具体符号/调用 | glossary → calls |

## 文档索引

| 文档 | 回答的问题 |
| --- | --- |
| [01-overview/project-overview](01-overview/project-overview.md) | 项目是什么、解决什么问题、三个命令是什么 |
| [01-overview/tech-stack](01-overview/tech-stack.md) | 用了哪些依赖、各自被谁 import |
| [01-overview/environment](01-overview/environment.md) | Node/pnpm/ESM、scripts、环境变量 |
| [02-architecture/architecture](02-architecture/architecture.md) | 分层结构、模块依赖边界 |
| [02-architecture/modules](02-architecture/modules.md) | 每个模块的职责、文件、核心符号 |
| [02-architecture/data-flow](02-architecture/data-flow.md) | build/scan 的数据在各阶段如何变换 |
| [03-interface/cli-commands](03-interface/cli-commands.md) | 有哪些命令、选项、退出码 |
| [04-design/decisions](04-design/decisions.md) | 为什么用 MCP 图谱、为什么三层页面 |
| [04-design/page-registry](04-design/page-registry.md) | 页面注册表如何工作、怎么加新页面 |
| [05-guides/onboarding](05-guides/onboarding.md) | 如何安装、构建、首次运行 |
| [05-guides/testing](05-guides/testing.md) | 测试怎么组织、怎么跑 |
| [05-guides/troubleshooting](05-guides/troubleshooting.md) | 常见错误与解法 |
| [06-constraints/conventions](06-constraints/conventions.md) | 写代码要遵守什么规约 |
| [06-constraints/limitations](06-constraints/limitations.md) | 已知限制与降级行为 |
| [07-reference/calls](07-reference/calls.md) | 谁调用谁（边表） |
| [07-reference/glossary](07-reference/glossary.md) | 符号与术语速查 |

## 与其他文档的关系

- `README.md`（仓库根）：**部分过时**——仍描述已删除的 `index`/`ask`/`update` 命令与 SQLite 架构；命令与选项以 [cli-commands](03-interface/cli-commands.md) 为准。
- `AGENTS.md` / `CLAUDE.md`（仓库根）：**部分过时**——仍含 `strategy/` 分层描述（MCP 重构时已删除）；规约部分见 [conventions](06-constraints/conventions.md)。
- `docs/superpowers/`：本地开发计划与设计文档（已被 .gitignore 排除，未纳入版本库）；ADR 依据见 [decisions](04-design/decisions.md)。

## 重要说明：本目录的维护方式

本 Wiki 目前为**人工维护版**（2026-06 重写，按编号目录组织）。本工具自身的 `scx-wiki-agent build` 命令会在 `.wiki/` 下生成**扁平文件名**的页面（如 `overview.md`、`calls.md`），与本目录结构不同名不冲突，但会覆盖 `.wiki/README.md` 等同名文件。运行 build 前请注意备份本文件。

## Related

- [project-overview](01-overview/project-overview.md) · [architecture](02-architecture/architecture.md) · [onboarding](05-guides/onboarding.md)
