# Agents.md

This file provides guidance to AI when working with code in this repository.

## Prerequisites

Before making any code changes, read the `.wiki/` directory to understand the current project state and architecture. These generated docs reflect the actual codebase.

## Commands

```bash
pnpm build          # Build with tsup → dist/
pnpm dev            # Watch mode build
pnpm test           # Run all tests (vitest run)
pnpm test:watch     # Watch mode tests
pnpm lint           # Type check with tsc --noEmit

# Run a single test file
npx vitest run tests/core/symbol-extractor.test.ts
# Run tests matching a pattern
npx vitest run -t "extractCalls"
```

## Architecture

This is a CLI tool that analyzes source code projects and generates structured wiki documentation with LLM-enhanced descriptions. ESM-only TypeScript project using ES2022.

### Data Pipeline

The core workflow is a 3-stage pipeline, each stage corresponds to a CLI command:

1. **Scan** (`scx-wiki-agent scan`) → `FileScanner` detects tech stack, project type, source dirs
2. **Index** (`scx-wiki-agent index`) → `IndexService` orchestrates:
   - `TreeSitterParser` → AST → `extractSymbols()` + `extractCalls()` → symbols & call relations
   - `ResolverRegistry` → framework-specific nodes/relations (NestJS, React, Vue, etc.)
   - Chunks + FTS5 full-text index → SQLite database
3. **Build** (`scx-wiki-agent build`) → `WikiService` → `WikiContextBuilder` extracts page contexts from DB → `WikiPageGenerator` (LLM) or `WikiFallbackBuilder` (pure rules)

### Layer Dependencies (top → bottom)

```
cli/commands/     → Commander.js handlers, thin wrappers
services/         → Business logic orchestration (IndexService, QAService, WikiService, etc.)
knowledge/        → Wiki generation: context building, page generation, fallback templates
strategy/         → Pluggable framework resolvers via Strategy Pattern (ResolverRegistry)
core/             → Infrastructure: database, scanner, parser, symbol-extractor, graph, retrieval
shared/           → Constants and utilities
```

### Key Design Decisions

- **SQLite (better-sqlite3)** stores everything: documents, symbols, relations, chunks, FTS5 index. Schema in `src/core/database.ts`, migration system included.
- **Relations table** has a `call_line` column for temporal ordering of `calls` relations, used to generate Mermaid sequence diagrams.
- **`extractCalls()`** is a separate AST pass from `extractSymbols()` — it walks `call_expression`/`new_expression` nodes to populate `calls` relations with caller scope and line number.
- **RelationGraph** is an in-memory adjacency list loaded from DB (`fromDatabase()`), used by retrieval and wiki context building.
- **Wiki generation** has dual paths: LLM streaming (Vercel AI SDK `streamText`) and pure-rule fallback. The fallback path generates Mermaid diagrams directly.
- **LLM prompts** are in Chinese. All wiki output is in Chinese.
- **AI SDK v6** uses `maxOutputTokens` (not `maxTokens`).

### Adding a New Framework Resolver

1. Create `src/strategy/resolvers/<name>-resolver.ts` implementing `FrameworkResolver` interface
2. Register in `IndexService` constructor (`src/services/index-service.ts`)
3. The resolver's `detect()` determines applicability, `extractNodes()`/`extractRelations()` extract framework-specific data

### Testing

Tests use vitest with real SQLite databases (created in temp dirs). Test fixtures live in `tests/fixtures/`. Integration tests run the full scan→index→build pipeline.
