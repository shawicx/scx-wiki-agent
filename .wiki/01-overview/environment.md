# Environment

## 项目信息

| 项 | 值 |
| --- | --- |
| 包名 | scx-wiki-agent |
| 版本 | 0.1.0 |
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
| lint | `tsc --noEmit` |

## 环境变量

从源码 process.env 引用提取

| 变量名 | 敏感 | 用途 |
| --- | --- | --- |
| CODEBASE_MEMORY_MCP_BINARY | 否 | ⚠️ 待确认 |
| API_KEY | ⚠️ 是 | ⚠️ 待确认 |
| BASE_URL | 否 | ⚠️ 待确认 |
## Related

- 同目录：[overview.md](overview.md) · [tech-stack.md](tech-stack.md)
- 总入口：[README](../README.md)
