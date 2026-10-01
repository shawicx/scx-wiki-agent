# 运行环境

<details>
<summary>Relevant source files</summary>

- src/mcp/codebase-memory-client.ts
</details>

## 项目信息

| 项 | 值 |
| --- | --- |
| 包名 | @scxfe/wiki-agent |
| 版本 | 0.1.6 |
| 运行时 | ESM |
| Node 版本 | 未指定 |
| 包管理器 | pnpm |

## 脚本命令

| 命令 | 脚本 |
| --- | --- |
| build | `tsup` |
| dev | `tsup --watch` |
| test | `vitest run` |
| test:watch | `vitest` |
| lint | `tsc --noEmit && node scripts/check-file-lines.mjs` |

## 环境变量

从生产源码 process.env 引用提取；用途列仅采集注释/缺省值/.env.example 等确定性证据

| 变量名 | 敏感 | 用途 | 生产引用 |
| --- | --- | --- | --- |
| CODEBASE_MEMORY_MCP_BINARY | 否 | 见生产引用 | src/mcp/codebase-memory-client.ts |

## 本页确定知道的事实

- 脚本命令 5 条（来自 package.json）
- 生产环境变量 1 个（敏感 0 个），其中 0 个带确定性用途证据

## 未知项

- 1 个环境变量未检出用途证据（引用点无相邻注释/缺省值，.env.example 未提供）
- 未指定 Node 版本要求（.nvmrc / engines.node 均未检出）
## Related

- 同目录：[overview.md](overview.md) · [tech-stack.md](tech-stack.md)
- 共享 5 个符号：[onboarding.md](../05-guides/onboarding.md)
- 共享 5 个符号：[troubleshooting.md](../05-guides/troubleshooting.md)
- 共享 1 个源文件：[architecture.md](../02-architecture/architecture.md)
- 总入口：[README](../README.md)
