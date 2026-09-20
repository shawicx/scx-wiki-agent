# Tech Stack

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/wiki-page-generator.ts
- tsup.config.ts
- vitest.config.ts
</details>

技术栈与依赖说明。每个依赖均标注源码首个 import 点（R3 拒绝编造用途）。

## 核心依赖

| 依赖 | 版本 | 首个 import 点 |
| --- | --- | --- |
| `@ai-sdk/openai` | ^3.0.67 | `src/knowledge/wiki-page-generator.ts` |
| `ai` | ^6.0.193 | `src/knowledge/wiki-page-generator.ts` |
| `commander` | ^15.0.0 | `src/cli/commands/build.ts` |
| `ignore` | ^7.0.5 | `src/core/scanner.ts` |

## 开发依赖

仅开发环境使用

| 依赖 | 版本 | 首个 import 点 |
| --- | --- | --- |
| `tsup` | ^8.5.1 | `tsup.config.ts` |
| `vitest` | ^4.1.7 | `vitest.config.ts` |

## 声明未用依赖

⚠️ package.json 声明但源码中 0 import，请确认是否需要

| 依赖 | 版本 |
| --- | --- |
| `@types/node` | ^25.9.1 |
| `typescript` | ^6.0.3 |

## 运行时与构建

| 项 | 值 |
| --- | --- |
| 模块系统 | ESM |
| 构建工具 | tsup |
| 包管理器 | pnpm |
## Related

- 同目录：[overview.md](overview.md) · [environment.md](environment.md)
- 总入口：[README](../README.md)
