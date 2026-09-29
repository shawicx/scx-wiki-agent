# Getting Started

<details>
<summary>Relevant source files</summary>

- src/bin.ts
- src/cli/commands/build.ts
- src/cli/commands/init.ts
- src/cli/commands/scan.ts
- src/cli/commands/types.ts
- src/cli/confirm-interaction.ts
- src/cli/index.ts
- src/core/scanner.ts
- src/knowledge/wiki-page-generator.ts
- src/shared/config.ts
- tsup.config.ts
- vitest.config.ts
</details>

## Prerequisites

- TypeScript
- pnpm

## Installation

```bash
# Install dependencies
pnpm install
```

## First Run (最小示例)

复制执行以下命令验证环境是否就绪

```bash
pnpm install
tsup
node dist/bin.js build
```

## Available Scripts

| 命令 | 脚本 |
| --- | --- |
| `build` | `tsup` |
| `dev` | `tsup --watch` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `lint` | `tsc --noEmit` |

## CLI Commands

| Command | Description |
| --- | --- |
| build | Generate wiki documentation from codebase knowledge graph |
| init | Initialize wiki-agent in the project |
| scan | Scan project structure and identify tech stack |

## Entry Points

- `src/cli/index.ts`

## Project Structure

- src/
## Related

- 同目录：[testing.md](testing.md) · [troubleshooting.md](troubleshooting.md)
- 总入口：[README](../README.md)
