# 项目概述

## 一句话定位

scx-wiki-agent 是一个基于 **codebase-memory-mcp 知识图谱**的项目 Wiki 生成 CLI：读取图谱中的符号、调用关系与复杂度数据，为任意代码项目生成结构化 Markdown 文档，支持 LLM 语义增强与纯规则回退双路径。

## 解决什么问题

- 人工写项目文档慢、易过时；纯 LLM 生成又容易**幻觉**（编造不存在的模块/接口）。
- 本工具的答案：以**外部知识图谱的精确结构数据**为唯一事实来源（R1 锚点强制：每条事实声明必须带 `file:line` 或 `qualified_name` 锚点），LLM 只负责「把 JSON 数据组织成可读的中文叙述」，无数据支撑的内容禁止写入。

## 三个命令

| 命令 | 职责 | 实现入口 |
| --- | --- | --- |
| `init` | 创建 `.scx-wiki-agent/cache/` 与 `.wiki/` 目录 | `src/cli/commands/init.ts` → `registerInitCommand` |
| `scan` | 扫描文件、检测技术栈与项目类型（gitignore 过滤、死依赖过滤） | `src/cli/commands/scan.ts` → `ScanService` → `FileScanner` |
| `build` | 索引图谱并生成 Wiki 页面（LLM 流式 / 纯规则） | `src/cli/commands/build.ts` → `WikiService` |

> 早期版本的 `index` / `ask` / `update` 命令（自建 SQLite 索引、检索问答）已在 2026-06 的 MCP 重构中删除，见 [decisions#ADR-001](../04-design/decisions.md)。

## 核心能力

1. **知识图谱数据源** — 通过子进程调用 `codebase-memory-mcp cli <tool> <json>`，获得 LSP 级符号数据（docstring/signature/complexity/fan-in）与 CALLS 调用边；封装在 `src/mcp/codebase-memory-client.ts`。
2. **页面注册表（PageRegistry）** — 18 个页面描述符分三层（structure 结构层 / operations 运行规约层 / surface 表层），按项目类型动态激活表层页面，见 [page-registry](../04-design/page-registry.md)。
3. **双路径生成** — 每页先走 LLM（`WikiPageGenerator`，Vercel AI SDK `streamText`）；无模型、`--no-llm` 或生成失败时自动回退纯规则模板（`WikiFallbackBuilder`）。
4. **检测式配置探测** — `ConfigDetector` 探测 package.json / lockfile / linter / 测试配置，有则提取、无则诚实标注缺失。
5. **输出清理** — `sanitizeWikiOutput` 确定性清除 LLM 寒暄前导语与 markdown 围栏（不调用 LLM）。
6. **反幻觉铁律** — R1 锚点强制、R2 边表优于时序图、R3 拒绝编造用途、R4 结构化优先，注入每次 LLM 调用的 system prompt（`src/knowledge/wiki-page-generator.ts` 的 `ANTI_HALLUCINATION`）。

## 目录总览

```
src/
├── bin.ts               # 可执行入口：createProgram().parse()
├── cli/                 # Commander 命令注册（thin wrappers）
│   ├── index.ts         # createProgram：注册 init/scan/build
│   └── commands/        # 每命令一个 register*Command
├── services/            # 编排层：ScanService、WikiService
├── knowledge/           # Wiki 生成管线（核心，~2900 行）
│   ├── page-registry.ts     # 页面描述符注册表
│   ├── config-detector.ts   # 配置探测
│   ├── wiki-context-builder.ts   # 图谱 → 页面上下文
│   ├── wiki-page-generator.ts    # LLM 生成
│   ├── wiki-fallback-builder.ts  # 纯规则生成
│   └── wiki-output-sanitizer.ts  # LLM 输出清理
├── mcp/                 # codebase-memory-mcp 子进程客户端
├── core/                # FileScanner（文件扫描/技术栈检测）+ 领域类型
└── shared/              # 常量与工具函数
```

各模块详情见 [modules](../02-architecture/modules.md)。

## 对外依赖（关键）

- **codebase-memory-mcp（外部二进制，必须预装）** — 知识图谱服务；未安装时 build 会失败并提示安装（`src/mcp/codebase-memory-client.ts` 的 `exec` 错误分支）。
- **LLM API（可选）** — OpenAI 兼容接口（含 Ollama）；不配置则全部页面走纯规则路径。

## Related

- Code: `src/cli/index.ts` · `src/services/wiki-service.ts` · `src/knowledge/page-registry.ts`
- Docs: [architecture](../02-architecture/architecture.md) · [tech-stack](tech-stack.md) · [data-flow](../02-architecture/data-flow.md) · [onboarding](../05-guides/onboarding.md)
