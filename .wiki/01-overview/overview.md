# Project Overview

<details>
<summary>Relevant source files</summary>

- README.md
- pnpm-lock.yaml
- pnpm-workspace.yaml
- src/bin.ts
- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/wiki-page-generator.ts
- src/shared/config.ts
- tsup.config.ts
- vitest.config.ts
</details>

从代码知识图谱生成结构化中文 Markdown Wiki 的 CLI 工具（LLM 增强叙述 + 纯规则回退）

A cli project with 78 files.

## Tech Stack

- @ai-sdk/openai
- ai
- commander
- ignore
- yaml
- tsup
- vitest

## Entry Files

- `src/cli/index.ts`

## Source Directories

- src

## Hotspots (high fan-in)

| Symbol | Type | Complexity |
| --- | --- | --- |
| isTestPath | function | 29 |
| generate | function | 14 |
| languageDomainOf | function | 12 |
| intentTable | function | 9 |
| matchPackageForFile | function | 9 |
| isChapterPage | function | 9 |
| hasIntent | function | 8 |
| isTopicPage | function | 8 |
| intentToPrompt | function | 7 |
| labelToSymbolType | function | 6 |

## 设计依据（意图证据）

从源码注释、git 提交与仓库文档确定性提取（每条带锚点，可回溯验证）

| 证据 | 类型 | 目标 | 锚点 |
| --- | --- | --- | --- |
| scx-wiki-agent：基于 codebase-memory-mcp 知识图谱的项目 Wiki 生成 CLI。读取图谱中的符号、调用关系与复杂度数据，为任意代码项目生成结构化中文 Markdown 文档；以图谱的精确结构数据为唯一事实来源，LLM 只负责叙述，反幻觉铁律 + 写盘前质量闸门双重兜底。 | 文档小节 | README.md | README.md#scx-wiki-agent |
| 功能特性：- **知识图谱数据源** — 通过子进程调用 `codebase-memory-mcp` 获取 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边 - **意图证据层（Intent Evidence）** — 图谱只回答「是什么」，动机类叙述的证据由确定性提取器补充：源码注释（文件头/符号注释/TODO 标记/常量注释）、git | 文档小节 | README.md | README.md#功能特性 |
| 前置依赖：- Node.js ≥ 18，pnpm - **codebase-memory-mcp 必须预装**（build 命令数据源）。查找顺序：`CODEBASE_MEMORY_MCP_BINARY` 环境变量 → PATH 中的 `codebase-memory-mcp` - LLM API 可选（OpenAI 兼容接口，含 Ollama）；不配置则全部页面走纯规则路径 | 文档小节 | README.md | README.md#前置依赖 |
| 仓库首次提交：feat: 优化 Wiki 生成质量，新增入门指南与故障排除页面 | 提交记录 | - | commit:35cd7031 (2026-06-02) |
## Related

- 同目录：[tech-stack.md](tech-stack.md) · [environment.md](environment.md)
- 总入口：[README](../README.md)
