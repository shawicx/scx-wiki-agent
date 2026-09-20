# Getting Started

<details>
<summary>Relevant source files</summary>

- src/cli/index.ts
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
| build | CLI command in src/cli/commands/build.ts |
| init | CLI command in src/cli/commands/init.ts |
| scan | CLI command in src/cli/commands/scan.ts |

## Entry Points

- `src/cli/index.ts`

## Project Structure

- src/
## Related

- 同目录：[testing.md](testing.md) · [troubleshooting.md](troubleshooting.md)
- 总入口：[README](../README.md)
