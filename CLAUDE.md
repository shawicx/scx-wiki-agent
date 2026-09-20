# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Prerequisites

Before making any code changes, read the `.wiki/` directory to understand the current project state and architecture. These generated docs reflect the actual codebase.

The `build` command requires the external `codebase-memory-mcp` binary to be installed (knowledge-graph data source). It is resolved via `CODEBASE_MEMORY_MCP_BINARY` or PATH.

## Commands

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

## Architecture

This is a CLI tool that generates a structured Chinese Markdown wiki from a codebase knowledge graph, with LLM-enhanced narration and a pure-rule fallback. ESM-only TypeScript project using ES2022.

### Data Pipeline

The core workflow is 3 commands:

1. **Init** (`scx-wiki-agent init`) → idempotently creates `.wiki/` and `.scx-wiki-agent/cache/`
2. **Scan** (`scx-wiki-agent scan`) → `FileScanner` walks the project (gitignore-aware), detects tech stack (dead-dependency filtered) and project type
3. **Build** (`scx-wiki-agent build`) → `WikiService` orchestrates:
   - `CodebaseMemoryClient.ensureIndexed` (subprocess to codebase-memory-mcp)
   - `WikiContextBuilder` → per-page context from graph queries (getArchitecture / queryGraph / getCodeSnippet), with hotspot-based enrichment for thin-evidence pages
   - `WikiPageGenerator` (LLM via Vercel AI SDK `streamText`) or `WikiFallbackBuilder` (pure rules)
   - Deterministic page-header evidence block (`wiki-evidence.ts`) + page-bottom Related section
   - `validatePageContent` quality gate (error rules block writing, warn rules go to the build report)

### Layer Dependencies (top → bottom)

```
cli/commands/     → Commander.js handlers, thin wrappers
services/         → Business logic orchestration (ScanService, WikiService)
knowledge/        → Wiki generation: page registry, context building, LLM generation, fallback, evidence, quality gate
mcp/              → codebase-memory-mcp subprocess client (sole data source)
core/             → FileScanner + domain types
shared/           → Constants and utilities
```

### Key Design Decisions

- **No self-built index** — the old tree-sitter + SQLite/FTS5 pipeline was removed (ADR-001, 2026-06). All code-structure data comes from codebase-memory-mcp subprocess calls. Do not reintroduce local parsing/indexing.
- **PageRegistry (18 pages, three tiers)** — structure / operations / surface. Directory structure is deterministic (numbered dirs), NOT LLM-generated.
- **Dual-path generation** — every page tries LLM first, falls back per-page to rule templates on `--no-llm` / no model / empty output / error / gate failure.
- **Anti-hallucination rules R1-R6** are injected into every LLM system prompt (`ANTI_HALLUCINATION` in `src/knowledge/wiki-page-generator.ts`): anchor enforcement, edge tables over sequence diagrams, no fabricated usage, structured output, 待确认 markers, diagram truthfulness.
- **Quality gate is pure-function** (`wiki-quality-validator.ts`): empty-shell & secret are errors; dead-link / broken-anchor / thin-evidence / mermaid-ghost / diagram-misuse are warnings surfaced in the build report.
- **Evidence anchoring is deterministic** — the `<details>` source-file block is injected by the tool from scanned file lists; LLMs never generate it.
- **LLM prompts and all wiki output are in Chinese.** AI SDK v6 uses `maxOutputTokens` (not `maxTokens`).

### Adding a New Wiki Page

1. Append a descriptor to `PAGE_REGISTRY` in `src/knowledge/page-registry.ts`
2. Add a case in each of the three builders: `WikiContextBuilder.dispatchContext` / `WikiPageGenerator.generateByName` / `WikiFallbackBuilder.buildByName`
3. Add the Context interface in `src/knowledge/types.ts` if the LLM path is needed

Missing any case silently produces empty content (context null → page skipped with a build-report reason).

### Testing

Tests use vitest. `tests/helpers/mock-mcp-client.ts` mocks the MCP client for unit tests. Integration tests (`tests/integration/`) run against a real codebase-memory-mcp binary and auto-skip when absent.
