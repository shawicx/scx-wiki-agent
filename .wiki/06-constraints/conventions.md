# Conventions

## 工具链检测



| 工具 | 状态 | 配置文件 |
| --- | --- | --- |
| Linter | ❌ 未检测到 | - |
| EditorConfig | ❌ 未检测到 | - |

> ⚠️ **待确认**：未检测到 lint 配置（eslint/biome），以下命名/格式规约（证据不足，禁止猜测；请人工补充后移除本标记）

## AI 协作规约（AGENTS.md）



### Prerequisites

Before making any code changes, read the `.wiki/` directory to understand the current project state and architecture. These generated docs reflect the actual codebase.

The `build` command requires the external `codebase-memory-mcp` binary to be installed (knowledge-graph data source). It is resolved via `CODEBASE_MEMORY_MCP_BINARY` or PATH.

### Commands

```bash
pnpm build          # Build with tsup → dist/
pnpm dev            # Watch mode build
pnpm test           # Run all tests (vitest run)
pnpm test:watch     # Watch mode tests
pnpm lint           # Type check with tsc --noEmit

# Run a single test file
npx vitest run tests/knowledge/wiki-quality-validator.test.ts
# Run tests matching a pattern
npx vitest run -t "evidence"
```

### Architecture

This is a CLI tool that generates a structured Chinese Markdown wiki from a codebase knowledge graph, with LLM-enhanced narration and a pure-rule fallback. ESM-only TypeScript project using ES2022.

### Data Pipeline

The core workflow is 3 commands:

1. **Init** (`scx-wiki-agent init`) → idempotently creates `.wiki/` and `.scx-wiki-agent/cache/`
2. **Scan** (`scx-wiki-agent scan`) → `FileScanner` walks the project (gitignore-aware), detects tech stack (dead-dependency filtered) and project type
## Related

- 同目录：[constraints.md](constraints.md)
- 总入口：[README](../README.md)
