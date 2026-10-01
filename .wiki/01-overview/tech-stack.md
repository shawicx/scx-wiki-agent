# 技术栈

<details>
<summary>Relevant source files</summary>

- src/cli/commands/build.ts
- src/cli/confirm-interaction.ts
- src/core/scanner.ts
- src/knowledge/generator/index.ts
- src/knowledge/generator/shared.ts
- src/shared/config.ts
- tsup.config.ts
- vitest.config.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/index.ts
</details>

技术栈与依赖说明。每个依赖均标注源码首个 import 点（R3 拒绝编造用途）。

## 核心依赖

| 依赖 | 版本 | 首个 import 点 |
| --- | --- | --- |
| `@ai-sdk/openai` | ^3.0.67 | `src/knowledge/generator/index.ts` |
| `@clack/prompts` | ^1.8.1 | `src/cli/confirm-interaction.ts` |
| `ai` | ^6.0.193 | `src/knowledge/generator/shared.ts` |
| `commander` | ^15.0.0 | `src/cli/commands/build.ts` |
| `ignore` | ^7.0.5 | `src/core/scanner.ts` |
| `yaml` | ^2.9.1 | `src/shared/config.ts` |

## 开发依赖

仅开发环境使用

| 依赖 | 版本 | 使用方式 | 首个 import 点 |
| --- | --- | --- | --- |
| `tsup` | ^8.5.1 | import | `tsup.config.ts` |
| `vitest` | ^4.1.7 | import | `vitest.config.ts` |

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

## 本页确定知道的事实

- 核心依赖 6 个、开发依赖 2 个、测试专用 0 个
- 声明未用依赖 2 个（package.json 有声明、源码 0 import）
- 模块系统 ESM / 构建工具 tsup / 包管理器 pnpm

## 未知项

- 声明未用依赖的取舍原因未知（需人工确认是否移除）
## Related

- 同目录：[overview.md](overview.md) · [environment.md](environment.md)
- 互补职责：[overview.md](../01-overview/overview.md)
- 共享 6 个源文件、共享 4 个符号：[modules.md](../02-architecture/modules.md)
- 共享 8 个源文件：[calls.md](../07-reference/calls.md)
- 共享 6 个源文件：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)
