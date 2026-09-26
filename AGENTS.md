# Agents.md

This file provides guidance to AI when working with code in this repository.

## Prerequisites

Before making any code changes, read the `.wiki/` directory to understand the current project state and architecture. These generated docs reflect the actual codebase.

The `build` command requires the external `codebase-memory-mcp` binary to be installed (knowledge-graph data source). It is resolved via `CODEBASE_MEMORY_MCP_BINARY` or PATH.

## Global Config

`~/.scx/wiki-agent/config.yaml` (YAML; created with a commented template by `init`). Priority: CLI flags > config file > built-in defaults. Sections: `provider` (name/model/api_key/base_url/timeout — api_key supports `${ENV_VAR}` refs; base_url defaults mapped by provider name for openai/deepseek/glm/anthropic/ollama) and `build` (mode/max_output_tokens/no_llm). Parse/load lives in `src/shared/config.ts` (pure parser + IO shell, fail-open: missing/broken config never blocks a build). `provider.timeout` becomes a per-request `AbortSignal.timeout`; `build.max_output_tokens` replaces the per-page hardcoded 8000 budget.

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
2. **Scan** (`scx-wiki-agent scan`) → `FileScanner` walks the project (gitignore-aware), detects tech stack (dead-dependency filtered; import extraction covers `.ts/.js/.vue` and CSS `@import`) and project type
3. **Build** (`scx-wiki-agent build`) → `WikiService` orchestrates:
   - `CodebaseMemoryClient.ensureIndexed` (subprocess to codebase-memory-mcp)
   - `WikiContextBuilder` → per-page context from graph queries (getArchitecture / queryGraph / getCodeSnippet), with hotspot-based enrichment for thin-evidence pages
   - `WikiPageGenerator` (LLM via Vercel AI SDK `streamText`) or `WikiFallbackBuilder` (pure rules)
   - Deterministic page-header evidence block (`wiki-evidence.ts`) + page-bottom Related section
   - `validatePageContent` quality gate (error rules block writing, warn rules go to the build report)
   - Stale-output governance: retired-path cleanup, owned-numbered-dir cleanup (registered page names only — user files in numbered dirs are never touched), and `--prune-stale` for deleting foreign numbered dirs (reported by default)

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
- **PageRegistry (17 pages, three tiers)** — structure / operations / surface. Directory structure is deterministic (numbered dirs), NOT LLM-generated. The `decisions` (ADR) page was retired (2026-09): without a real ADR data source, auto-derived entries read as fabricated decisions.
- **Dual-path generation** — every page tries LLM first, falls back per-page to rule templates on `--no-llm` / no model / empty output / error / gate failure. Every registered page must have all three builder cases (context/generator/fallback); a missing generator case silently forces the fallback path.
- **Graph-edge defense-in-depth** (`wiki-context-builder.ts`) — CALLS edges from the graph are untrusted upstream: consumer-side filters drop cross-language edges (ts↔rust), non-code callees (json/toml), same-name collisions (BFS keyed by `name@file`), and edges without lexical evidence (callee name absent from caller source).
- **Package attribution is segment-exact** (`matchPackageForFile` in `shared/utils.ts`) — files map to packages by exact path-segment runs (longest/deepest wins), never by substring, so `src-tauri/src/*.rs` and `src/*.ts` cannot collapse into one `src` module.
- **Package manager detection is single-sourced** — `ConfigDetector.detectEnvironment` is the only authority (packageManager field > bun.lock > pnpm-lock > yarn.lock > npm); tech-stack reuses it. Test dirs are also reverse-derived from `*.test.*` file locations, not just root-level conventions.
- **Source-fallback for graph-missing symbols** (`source-fallback.ts`) — regex-level source scanning fills in symbols the MCP graph fails to index (.vue SFCs, some Rust items), feeding the existing `supplementalSymbols` channel and `outlineKnown.symbols`; found names are merged back into the claim-verification symbol universe (`getSymbolUniverse`) so tool-injected evidence is never re-flagged as 待确认.
- **Tauri IPC surface** (`tauri-ipc.ts`) — for projects with `src-tauri/tauri.conf.json`, `api` page is driven by a regex-paired table: frontend `invoke/listen/emit` ↔ Rust `#[tauri::command] fn` / `emit` (camelCase↔snake_case merge, one-side orphans flagged honestly; Vue component emits filtered by tauri-event import detection).
- **Repo docs are consumed and legacy wiki docs indexed** — overview absorbs a README excerpt + `docs/` listing; README renders a Related-Docs group (`../` links to repo files) and a hand-written-docs group enumerating `.wiki` files outside the tool's page namespace (indexed only, never modified; cleanup runs before indexing so `--prune-stale` stays consistent).
- **data-flow precheck** — pages with no execution sequences are removed before `plannedPaths`/README-index computation (no dead links), with the prebuilt context reused to avoid duplicate graph queries.
- **Anti-hallucination rules R1-R6** are injected into every LLM system prompt (`ANTI_HALLUCINATION` in `src/knowledge/wiki-page-generator.ts`): anchor enforcement, edge tables over sequence diagrams, no fabricated usage, structured output, 待确认 markers, diagram truthfulness.
- **Quality gate is pure-function** (`wiki-quality-validator.ts`): empty-shell & secret are errors; dead-link / broken-anchor / thin-evidence / mermaid-ghost / diagram-misuse are warnings surfaced in the build report.
- **Evidence anchoring is deterministic** — the `<details>` source-file block is injected by the tool from scanned file lists; LLMs never generate it.
- **Adaptive topic pages** — up to 4 repo-specific cross-module topics (08-topics/) are derived deterministically from graph clusters (boundaries as fallback; skip when none qualify). Definitions are locked in `.scx-wiki-agent/topics.json` (hand-editable; `--refresh-topics` re-detects). Topic page names use the `topic:<id>` form throughout the pipeline.
- **LLM prompts and all wiki output are in Chinese.** AI SDK v6 uses `maxOutputTokens` (not `maxTokens`).

### Adding a New Wiki Page

1. Append a descriptor to `PAGE_REGISTRY` in `src/knowledge/page-registry.ts`
2. Add a case in each of the three builders: `WikiContextBuilder.dispatchContext` / `WikiPageGenerator.generateByName` / `WikiFallbackBuilder.buildByName`
3. Add the Context interface in `src/knowledge/types.ts` if the LLM path is needed

Missing any case silently produces empty content (context null → page skipped with a build-report reason).

### Testing

Tests use vitest. `tests/helpers/mock-mcp-client.ts` mocks the MCP client for unit tests. Integration tests (`tests/integration/`) run against a real codebase-memory-mcp binary and auto-skip when absent.
