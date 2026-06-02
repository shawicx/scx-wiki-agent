# scx-wiki-agent

Local knowledge base agent for software projects. Scans code, builds a searchable index, generates structured wiki documentation, and answers questions using retrieval-augmented generation.

## Features

- **Project scanning** — Detects tech stack, frameworks, and project structure
- **Multi-layer indexing** — AST parsing via Tree-sitter, symbol extraction, chunking, and FTS5 full-text search
- **Multi-path retrieval** — Keyword, semantic, and graph-based search with intent classification
- **LLM-enhanced wiki generation** — Rule-based page skeletons + LLM semantic descriptions, with pure-rules fallback
- **Streaming Q&A** — Ask questions about your codebase with streaming responses
- **Incremental updates** — Re-index only changed files based on git diff

## Quick Start

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Initialize in your project
scx-wiki-agent init

# Scan project structure
scx-wiki-agent scan

# Build the search index
scx-wiki-agent index

# Generate wiki documentation (pure rules, no LLM needed)
scx-wiki-agent build --no-llm

# Generate wiki with LLM-enhanced descriptions
scx-wiki-agent build

# Ask a question
scx-wiki-agent ask "How does the retrieval pipeline work?"

# Update index after code changes
scx-wiki-agent update
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize wiki-agent in the project |
| `scan` | Scan project structure and identify tech stack |
| `index` | Build local index (AST, symbols, chunks, FTS5) |
| `ask <question>` | Ask a question about the project (supports `--stream`) |
| `build` | Generate wiki documentation |
| `update` | Incremental update based on git changes |

### Build Options

The `build` command supports these options:

| Option | Default | Description |
|--------|---------|-------------|
| `--model <name>` | `gpt-4o-mini` | LLM model for semantic descriptions |
| `--base-url <url>` | — | OpenAI-compatible API base URL (e.g. `http://localhost:11434/v1` for Ollama) |
| `--no-llm` | off | Generate wiki without LLM (pure rule-based) |
| `--pages <list>` | `all` | Comma-separated page names to generate |

### Generated Wiki Pages

The `build` command generates 8 markdown files in `.wiki/`:

| Page | Content |
|------|---------|
| `overview.md` | Project type, tech stack, entry files, key symbols |
| `architecture.md` | Module structure and inter-module dependencies |
| `data-flow.md` | Execution pipelines traced from entry points |
| `modules.md` | Per-module symbols, dependencies, code snippets |
| `api.md` | CLI commands, exported functions, framework nodes |
| `business.md` | Service classes, methods, dependency relationships |
| `design-decisions.md` | Detected design patterns and technology choices |
| `glossary.md` | Deduplicated symbol table |

## Supported Project Types

Built-in framework resolvers for:

- React (create-react-app, Next.js, Vite React)
- Vue (Vue 2/3, Nuxt)
- NestJS
- Tauri
- LangGraph
- Mastra
- Commander CLI

General TypeScript/JavaScript projects are also supported out of the box.

## Configuration

### Environment Variables

```bash
# Required for ask and LLM-enhanced wiki generation
export OPENAI_API_KEY="sk-..."

# For Ollama or other OpenAI-compatible providers
export OPENAI_BASE_URL="http://localhost:11434/v1"
```

### Using with Ollama

```bash
scx-wiki-agent build --model qwen2.5 --base-url http://localhost:11434/v1
```

## Architecture

```
src/
├── cli/commands/        # CLI command handlers (init, scan, index, ask, build, update)
├── core/                # Core scanning, parsing, and database layer
│   ├── database.ts      # SQLite schema and connection management
│   ├── scanner.ts       # File system scanning and tech detection
│   ├── parser.ts        # Tree-sitter AST parsing
│   ├── graph/           # Relation graph and graph queries
│   ├── retrieval/       # Multi-path retrieval (FTS, graph, symbol, hybrid)
│   └── ...
├── knowledge/           # Wiki generation pipeline
│   ├── types.ts         # Wiki context type definitions
│   ├── wiki-context-builder.ts   # Extract page context from SQLite
│   ├── wiki-skeleton-builder.ts  # Generate markdown page skeletons
│   ├── wiki-page-generator.ts    # LLM-powered semantic content
│   └── wiki-builder.ts           # Fluent markdown builder utility
├── services/            # Business logic services
│   ├── wiki-service.ts  # Orchestrates wiki generation pipeline
│   ├── qa-service.ts    # Streaming Q&A with retrieval
│   └── ...
├── strategy/            # Framework detection and resolution
│   ├── resolver-registry.ts      # Strategy pattern registry
│   └── resolvers/       # Per-framework resolvers
└── shared/              # Constants and utilities
```

## Development

```bash
pnpm install       # Install dependencies
pnpm build         # Build with tsup
pnpm test          # Run tests with vitest
pnpm test:watch    # Run tests in watch mode
pnpm lint          # Type-check with tsc --noEmit
```

## License

MIT
