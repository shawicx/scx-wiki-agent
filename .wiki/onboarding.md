# Getting Started

## Prerequisites

- TypeScript
- pnpm

## Installation

```bash
# Install dependencies
pnpm install
```

## Project Initialization

```bash
# Initialize the project
pnpm run init
```

## CLI Commands



| Command | Description |
| --- | --- |
| registerBuildCommand | CLI command in src/cli/commands/build.ts |
| registerInitCommand | CLI command in src/cli/commands/init.ts |
| registerScanCommand | CLI command in src/cli/commands/scan.ts |
| createProgram | CLI command in src/cli/index.ts |
| findProjectRoot | CLI command in src/cli/utils.ts |
| computeHash | CLI command in src/shared/utils.ts |
| getFileLanguage | CLI command in src/shared/utils.ts |
| relativePath | CLI command in src/shared/utils.ts |
| generateId | CLI command in src/shared/utils.ts |

## Entry Points

- `src/cli/index.ts`
- `tests/fixtures/sample-project/src/index.ts`

## Project Structure

- src/