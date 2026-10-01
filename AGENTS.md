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
   - `IntentEvidenceProvider` — deterministic "why" evidence (comments / git commits / doc sections / test titles), fail-open, git mining cached in `.scx-wiki-agent/cache/intent.json` (HEAD-keyed)
   - `WikiContextBuilder` → per-page context from graph queries (getArchitecture / queryGraph / getCodeSnippet), with hotspot-based enrichment for thin-evidence pages and intent-evidence wiring
   - `WikiPageGenerator` (LLM via Vercel AI SDK `streamText`) or `WikiFallbackBuilder` (pure rules, also renders intent evidence tables)
   - Deterministic page-header evidence block (`wiki-evidence.ts`) + page-bottom Related section
   - `validatePageContent` quality gate (error rules block writing, warn rules go to the build report)
   - decisions precheck: the page is dropped with a reason when git/docs evidence is entirely absent (same pattern as data-flow)
   - Stale-output governance: `.wiki` is a tool-exclusive directory — full builds wipe and recreate it wholesale (no stale paths, no foreign dirs, no warnings); update mode keeps existing files for unchanged-skip, cleaning unplanned tool files, foreign numbered dirs (silently), and empty owned dirs

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
- **Tier-2 surface pages are fully implemented (8 dynamic pages)** — `routes` / `db-schema` (backend), `components` / `state` / `routing` (frontend), `public-api` (library), `workspaces` / `package-boundaries` (monorepo). Each has all three builder cases (`context/` per-family modules: `public-api.ts` / `routes.ts` / `frontend.ts` / `workspaces.ts` / `db-schema.ts`, `generator/tier2.ts`, `fallback/tier2.ts`). Detection is regex-level deterministic with file:line anchors; a page with zero evidence returns a null context and is skipped with a build-report reason (same pattern as data-flow). The `library` project type is detected from package.json shape (`exports` field, or `main`+`types` without `bin`, when no framework indicator hits).
- **PageRegistry (18+8 pages, three tiers)** — structure / operations / surface. Directory structure is deterministic (numbered dirs), NOT LLM-generated. The `decisions` page was revived (2026-09): with git-commit + doc-section evidence channels it renders only real anchored evidence (per-entry commit/doc anchors), never auto-fabricated ADRs; when both channels are empty the page is skipped with a build-report reason.
- **Dual-path generation** — every page tries LLM first, falls back per-page to rule templates on `--no-llm` / no model / empty output / error / gate failure. Every registered page must have all three builder cases (context/generator/fallback); a missing generator case silently forces the fallback path.
- **Graph-edge defense-in-depth** (`wiki-context-builder.ts`) — CALLS edges from the graph are untrusted upstream: consumer-side filters drop cross-language edges (ts↔rust), non-code callees (json/toml), same-name collisions (BFS keyed by `name@file`), and edges without lexical evidence (callee name absent from caller source). The calls page dedupes edges per group (shared mid-chain edges stay in every entry group), backfills with fan-in-hotspot-anchored groups when entry groups are thin (labeled `hotspot`, not app entries), and attaches the Tauri IPC command table (real cross-language execution edges the CALLS graph cannot see).
- **Package attribution is segment-exact** (`matchPackageForFile` in `shared/utils.ts`) — files map to packages by exact path-segment runs (longest/deepest wins), never by substring, so `src-tauri/src/*.rs` and `src/*.ts` cannot collapse into one `src` module.
- **Package manager detection is single-sourced** — `ConfigDetector.detectEnvironment` is the only authority (packageManager field > bun.lock > pnpm-lock > yarn.lock > npm); tech-stack reuses it. Test dirs are also reverse-derived from `*.test.*` file locations, not just root-level conventions.
- **Source-fallback for graph-missing symbols** (`source-fallback.ts`) — regex-level source scanning fills in symbols the MCP graph fails to index (.vue SFCs, some Rust items), feeding the existing `supplementalSymbols` channel and `outlineKnown.symbols`; found names are merged back into the claim-verification symbol universe (`getSymbolUniverse`) so tool-injected evidence is never re-flagged as 待确认.
- **Tauri IPC surface** (`tauri-ipc.ts`) — for projects with `src-tauri/tauri.conf.json`, `api` page is driven by a regex-paired table: frontend `invoke/listen/emit` ↔ Rust `#[tauri::command] fn` / `emit` (camelCase↔snake_case merge, one-side orphans flagged honestly; Vue component emits filtered by tauri-event import detection).
- **Claim verification trusts declaration evidence** (`wiki-service.ts` + `claim-verifier.ts`) — the assertion-verification is name-existence + evidence-kind checking (explicitly NOT semantic verification): tier 1 matches dotted chains against the symbol universe with qualified_name suffix fallback (kills qualified false-negatives); tier 3 probes lexical matches via `search_code` compact mode and classifies each matched line locally (code/import lines = usage evidence; comment/config-only lines = mention → 待确认), with a name→files map feeding same-name ambiguity stats (report-only, never blocks). The symbol universe merges graph symbols, source-fallback names, AND declared dependency names (package.json + detected tech stack), so real dependencies (e.g. rxjs) are never flagged 「无调用点证据」; overview/troubleshooting contexts additionally carry `depUsage` (per-dependency import call sites) so R3/R5 discipline has evidence to anchor instead of marking 待确认. The `unanchored-dependency` gate rule (warn, tech-stack only) flags dependency table rows missing import anchors — R3 post-check. `.wiki/` paths are excluded from probe scope (no self-referential evidence).
- **Evidence-ID pilot on topic pages** (`evidence-id.ts`) — grounded generation trial: topic context ships a deterministic evidence index (E1..En, sorted kind→anchor→name, stable across builds while context is unchanged); the topic system prompt requires factual claims to cite `[E#]` (fabricated IDs forbidden); post-generation the tool determinatically resolves citations (valid/invalid counts = LLM adherence metric, surfaced in the build report as 证据引用) and strips all `[E#]` scaffolding from the final page. Roll out to fixed pages only after adherence stabilizes.
- **Repo docs are consumed** — overview absorbs a README excerpt + `docs/` listing; README renders a Related-Docs group (`../` links to repo files). `.wiki` itself is tool-exclusive: hand-written docs must live outside it (full builds wipe the directory).
- **data-flow is a data-shape evidence page, not a call-edge page** (`data-flow-shape.ts`) — `CALLS` edges only order the stages; the page body is built deterministically from graph signatures (`signature` / `return_type` / `param_types` / `end_line`; the graph stores newlines as literal `\n` and often omits `: void`, so source fallback fills the return type), CALLS edge attributes (`r.line` = call site, `r.args` = call-site argument expressions, `confidence`, `strategy`), per-function-body I/O scanning (fs / process / config / env / stdout; TS+JS+Vue and Rust rules; class bodies are never scanned), and local `interface`/`type`/`enum`/`class` definitions. Call-site and callee-definition anchors are separate fields and must never be mixed. Unknown types stay unknown (only literal `'x'`/`123`/`true`/`[...]`/`{...}` are inferred); `Promise<void>` is rendered as an async completion signal. The LLM only narrates `stages`/`transitions`/`ioEvents`/`typeDefinitions`/`shapeCoverage`; the rule path renders the same deterministic tables.
- **data-flow precheck is shape-coverage based** — the page is dropped before `plannedPaths`/README-index computation (no dead links) unless it has execution sequences AND stages AND `shapeCoverage.dataBearingTransitions > 0` (an edge is data-bearing when it has call args, typed callee params, a non-void return type, or I/O on either endpoint). Control-flow-only repos therefore skip the page with a build-report reason instead of duplicating calls.md; the prebuilt context is reused to avoid duplicate graph queries.
- **Anti-hallucination rules R1-R7** are injected into every LLM system prompt (`ANTI_HALLUCINATION` in `src/knowledge/wiki-page-generator.ts`): anchor enforcement, edge tables over sequence diagrams, no fabricated usage, structured output, 待确认 markers, diagram truthfulness, and R7 rationale anchoring (motive/evolution claims must cite comment `file:line`, `commit:hash+date`, or `doc#section` anchors; uncited rationale must be explicitly marked 「推断」, ≤2 per page).
- **Quality gate is pure-function** (`wiki-quality-validator.ts`): empty-shell & secret are errors; dead-link / broken-anchor / thin-evidence / mermaid-ghost / diagram-misuse / unanchored-rationale (R7 post-check: motive-flavored sections with zero file:line, commit, or doc# anchors) / incomplete-page / unanchored-dependency / claim-support are warnings surfaced in the build report (incomplete-page escalates to error when the page is known-truncated). True-anchor checking stays pure via injected accessors (`readFileLine` / `readFile` / `symbolFiles`, wired from wiki-service's source-line cache + symbol index): line-number range validation, anchor-to-symbol association (unique-resolution names whose definition files exclude the anchor file), doc `path#heading` slug existence (GitHub-style slugs, CJK preserved, `headingSlug`), page-internal `#fragment` link validation, anchor classification stats (usage/comment/doc), and a claim-support ratio (factual lines = lines with backtick identifiers; supported = same-line anchor or honest 「推断」; warn below 50% with ≥5 factual lines) aggregated into the build report.
- **Intent evidence layer** (`intent-evidence.ts`) — the graph only answers "what"; "why" evidence is mined deterministically: file-header/symbol/TODO/const comments, per-file git log (first/last commit, module themes, dep-related subjects), README+docs sections, test titles (behavior promises). Every item carries an anchor; budgets cap prompt growth (text ≤240 chars, module ≤6, page ≤14); git mining is fail-open (no git / timeout → empty) and disk-cached in `.scx-wiki-agent/cache/intent.json` keyed by HEAD. Both LLM and rule paths consume it; the build report prints per-kind coverage. Candidate files for the per-file git channel are ranked by a multi-signal importance score (`intent/ranking.ts`: file fan-in / entry files / boundary-endpoint packages / test pairing / README-docs mention / whole-repo churn via one batched `git log --name-only`), never by file size — the `GIT_FILE_CAP=30` truncation keeps core files, not big files; the report prints the Top-30 entry/tested counts for regression visibility.
- **Evidence anchoring is deterministic** — the `<details>` source-file block is injected by the tool from scanned file lists; LLMs never generate it.
- **Adaptive topic pages** — up to 4 repo-specific cross-module topics (08-topics/) are derived deterministically from graph clusters (boundaries as fallback; skip when none qualify). Definitions are locked in `.scx-wiki-agent/topics.json` (hand-editable; `--refresh-topics` re-detects). Topic page names use the `topic:<id>` form throughout the pipeline.
- **Interactive confirmation pass (two-phase build)** (`confirmation.ts` + `src/cli/confirm-interaction.ts`) — with `--confirm` (or config `build.confirm: true`), pages are ALL generated in memory first, then a single @clack/prompts session adjudicates every 待确认 item (4 kinds: claim `` `x`（待确认） `` / fallback cell `⚠️ 待确认` / unconfirmedNote block / LLM R5 prose), then decisions are applied before the unified gate+write phase. Timing rationale: items are products of generation+verification (can't interact before), and post-write rewriting wastes a pass and bypasses the gate. Confirmed claims persist to `.scx-wiki-agent/confirmations.json` as v2 fingerprinted entries (`{raw, files, hashes, head, confirmedAt}`): a confirmed claim stays auto-exempt only while its fingerprint holds — HEAD unchanged, or (after new commits) every fingerprinted file's content hash unchanged; ambiguous names (0/multi-file resolution, dep names) degrade to HEAD-scoped entries that expire on any commit. Stale entries are pruned from the store, re-enter the 待确认 queue, and are counted in the build report (`持久化确认：N 条指纹有效免标，M 条已过期重新裁决`) — never silently carried over. v1 stores migrate to fingerprint-less entries (re-asked once inside git repos). Collection admission is marker/heuristic-tiered to kill false pending items from quoted evidence (source comments/docstrings/commit subjects/CLI help quoting the literal text): claims are only collected via tool-injected `<!-- wiki:pending:claim:… -->` markers (`wiki-markers.ts`); notes via the line-start tool shape; cells via ⚠️ markers in table rows keyed by nearest-table-header + first column (no cross-table label collisions); prose only from non-table, non-`<details>`, non-fenced lines (observed evidence quotes all live in table rows). Markers are session scaffolding, stripped before writing (kept items retain the visible 待确认 text). User replacements pass `validateReplacement` (secrets / unbalanced backticks / marker injection / length caps → treated as keep).
- **Reasoning is never wiki content** (`wiki-page-generator.ts`) — thinking-only responses (empty text channel, non-empty reasoning channel, typical when a thinking model fails to disable thinking) are never returned as page content: one retry with an explicit "output final Markdown only" system instruction; if the retry still yields no text the page returns empty and degrades to the rule path, marked `provider thinking-only response` in the build report (`thinking-only` notice kind tracks recovered/failed).
- **Truncated pages are tail-healed and gate-checked** — after continuation rounds are exhausted with an abnormal finish, the final raw tail (mid-table-row / unclosed fence) is cut back to the last safe cut point (`findSafeCut` reuse), and the `truncated` fact flows into the quality gate: the `incomplete-page` rule (unclosed code fence / dangling trailing table row, structural signals always-on) escalates from warn to error, degrading the page to the deterministic rule path (`输出仍截断（incomplete-page）` in the build report). Heuristic signals like dangling sentences or missing sections are deliberately not checked (false positives).
- **LLM prompts and all wiki output are in Chinese.** AI SDK v6 uses `maxOutputTokens` (not `maxTokens`).

### Adding a New Wiki Page

1. Append a descriptor to `PAGE_REGISTRY` in `src/knowledge/page-registry.ts`
2. Add a case in each of the three builders: `WikiContextBuilder.dispatchContext` / `WikiPageGenerator.generateByName` / `WikiFallbackBuilder.buildByName`
3. Add the Context interface in `src/knowledge/types.ts` if the LLM path is needed

Missing any case silently produces empty content (context null → page skipped with a build-report reason).

### Testing

Tests use vitest. `tests/helpers/mock-mcp-client.ts` mocks the MCP client for unit tests. Integration tests (`tests/integration/`) run against a real codebase-memory-mcp binary and auto-skip when absent.
