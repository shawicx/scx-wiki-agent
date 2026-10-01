# 快速上手

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
- src/knowledge/config-detector/index.ts
- src/knowledge/confirmation/index.ts
- src/knowledge/context/cli.ts
- src/knowledge/context/index.ts
- src/knowledge/crosspage/index.ts
- src/knowledge/dataflow/index.ts
- src/knowledge/fallback/index.ts
- src/knowledge/generator/index.ts
- src/knowledge/intent/index.ts
- src/knowledge/quality/index.ts
- src/knowledge/types/index.ts
- src/services/wiki/index.ts
- src/bin.ts
- src/cli/commands/build.ts
</details>

## 环境要求

- TypeScript
- pnpm

## 安装

```bash
# 安装依赖
pnpm install
```

## 首次运行（最小示例）

复制执行以下命令验证环境是否就绪

```bash
pnpm install
tsup
node dist/bin.js build
```

## 可用脚本

| 命令 | 脚本 |
| --- | --- |
| `build` | `tsup` |
| `dev` | `tsup --watch` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `lint` | `tsc --noEmit && node scripts/check-file-lines.mjs` |

## CLI 命令

| 命令 | 说明 |
| --- | --- |
| build | Generate wiki documentation from codebase knowledge graph |
| init | Initialize wiki-agent in the project |
| scan | Scan project structure and identify tech stack |

## 入口文件

- `src/cli/index.ts`
- `src/knowledge/config-detector/index.ts`
- `src/knowledge/confirmation/index.ts`
- `src/knowledge/context/cli.ts`
- `src/knowledge/context/index.ts`
- `src/knowledge/crosspage/index.ts`
- `src/knowledge/dataflow/index.ts`
- `src/knowledge/fallback/index.ts`
- `src/knowledge/generator/index.ts`
- `src/knowledge/intent/index.ts`
- `src/knowledge/quality/index.ts`
- `src/knowledge/types/index.ts`
- `src/services/wiki/index.ts`

## 项目结构

- src/

## 环境变量

仅统计生产源码引用

| 变量名 | 敏感 | 用途 | 生产引用 |
| --- | --- | --- | --- |
| CODEBASE_MEMORY_MCP_BINARY | 否 | 见生产引用 | src/mcp/codebase-memory-client.ts |

## 本页确定知道的事实

- 入口文件 13 个、源码目录 1 个
- 可用脚本 5 条、CLI 命令 3 个
- 生产环境变量 1 个（敏感 0 个）

## 未知项

- 未指定 Node.js 版本要求（.nvmrc / engines.node 均未检出）
## Related

- 同目录：[testing.md](testing.md) · [troubleshooting.md](troubleshooting.md)
- 共享 13 个源文件、共享 13 个符号：[overview.md](../01-overview/overview.md)
- 共享 3 个源文件、共享 3 个符号：[tech-stack.md](../01-overview/tech-stack.md)
- 共享 3 个源文件、共享 3 个符号：[modules.md](../02-architecture/modules.md)
- 总入口：[README](../README.md)
