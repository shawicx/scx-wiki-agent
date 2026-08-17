# 技术栈

> 依据 R3（拒绝编造用途）：每项依赖的用途必须有源码 import 点佐证；无 import 点的标「声明未用」。

## 核心依赖（dependencies）

| 依赖 | 版本范围 | 用途（源码佐证） |
| --- | --- | --- |
| `commander` | ^15.0.0 | CLI 命令注册与参数解析。import 于 `src/cli/index.ts`、`src/cli/commands/init.ts`、`src/cli/commands/scan.ts`、`src/cli/commands/build.ts` |
| `ai` | ^6.0.193 | Vercel AI SDK 核心：`streamText` 流式生成。import 于 `src/knowledge/wiki-page-generator.ts` |
| `@ai-sdk/openai` | ^3.0.67 | OpenAI 兼容 provider 工厂（`createOpenAI`，支持 baseURL 覆盖指向 Ollama 等）。import 于 `src/knowledge/wiki-page-generator.ts` |
| `ignore` | ^7.0.5 | 解析 `.gitignore` 规则过滤扫描结果。import 于 `src/core/scanner.ts` |

## 开发依赖（devDependencies）

| 依赖 | 版本范围 | 用途 |
| --- | --- | --- |
| `tsup` | ^8.5.1 | 构建：单入口 `src/bin.ts` → `dist/bin.js`（ESM，node18，shebang banner），见 `tsup.config.ts` |
| `typescript` | ^6.0.3 | 类型检查（`pnpm lint` = `tsc --noEmit`），tsconfig：ES2022 / strict / moduleResolution bundler |
| `vitest` | ^4.1.7 | 测试框架（`tests/` 下 14 个测试文件） |
| `@types/node` | ^25.9.1 | Node 类型 |

## 声明未用依赖

无。package.json 声明的 8 项依赖全部有源码 import 点（如上表佐证）。

## 外部系统依赖（不在 package.json 中）

| 依赖 | 必要性 | 说明 |
| --- | --- | --- |
| `codebase-memory-mcp` | build 命令必需 | 知识图谱二进制，通过 `execFileSync` 子进程调用其 `cli` 子命令。查找顺序：`CODEBASE_MEMORY_MCP_BINARY` 环境变量 → PATH 中的 `codebase-memory-mcp`（`src/mcp/codebase-memory-client.ts:findBinary`） |
| LLM API（OpenAI 兼容） | 可选 | 不配置时全部页面走纯规则 fallback |

## 运行时与构建事实

- **模块体系**：ESM（`package.json` `"type": "module"`）；源码内相对导入必须带 `.js` 后缀。
- **构建工具**：tsup（`src/bin.ts` 单入口，`dist/bin.js`，`bin` 字段注册为 `scx-wiki-agent` 命令）。
- **包管理器**：pnpm（探测依据 `pnpm-lock.yaml`；package.json 无 `packageManager` 字段）。
- **Node 版本**：tsup target `node18`；package.json 无 `engines` 字段，无 `.nvmrc`（待确认：实际最低 Node 版本以运行时 API 使用为准）。

## Related

- Code: `package.json` · `tsup.config.ts` · `src/core/scanner.ts`（死依赖过滤逻辑 `collectImportedPackages`）
- Docs: [environment](environment.md) · [project-overview](project-overview.md) · [decisions](../04-design/decisions.md)
