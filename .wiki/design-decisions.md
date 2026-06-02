# Design Decisions

## Design Patterns



### Strategy Pattern

- ResolverRegistry acts as a registry with a register() method
- Multiple implementations: CommanderResolver, LangGraphResolver, MastraResolver, NestResolver, PathResolver, ReactResolver, ResolverRegistry, SymbolResolver, TauriResolver, VueResolver

### Service Layer

- 6 service classes in src/services/
- Services: IndexService, QAService, RetrievalService, ScanService, UpdateService, WikiService
- Each service encapsulates a distinct business capability

### Builder Pattern

- WikiBuilder provides fluent construction API with build() method
- Separates object construction from representation

### Command Pattern

- 6 command handlers in commands/ directory
- Each command encapsulates a single CLI operation
- Commands: ask.ts, build.ts, index.ts, init.ts, scan.ts, update.ts

## Technology Choices



| Technology | Category | Evidence |
| --- | --- | --- |
| SQLite (better-sqlite3) | Database | Embedded SQL database with FTS5 full-text search for local code index |
| Tree-sitter | Code Parsing | Incremental WASM-based AST parsing for precise symbol extraction |
| Commander.js | CLI Framework | Declarative command-line interface with options and sub-commands |
| Vercel AI SDK | LLM Integration | Streaming LLM responses with provider abstraction |
| OpenAI Provider | AI Model | OpenAI-compatible API integration for text generation |
| tsup (esbuild) | Build Tool | Fast esbuild-based bundler targeting ESM output |
| Vitest | Testing | Vite-native test framework with ESM support |
| TypeScript | Language | Static type checking for code safety and IDE support |