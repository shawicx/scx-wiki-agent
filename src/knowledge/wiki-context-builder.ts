import type { DatabaseConnection } from '../core/database.js';
import type { ScanResult } from '../core/scanner.js';
import type { SymbolType, RelationType } from '../core/types.js';
import type {
  OverviewContext,
  ArchitectureContext,
  ModuleSummary,
  DataFlowContext,
  ExecutionPipeline,
  PipelineStep,
  ModulesContext,
  ApiContext,
  BusinessContext,
  DesignDecisionsContext,
  DesignPattern,
  GlossaryContext,
} from './types.js';

const ENTRY_FILE_NAMES = ['index.ts', 'index.js', 'main.ts', 'main.js', 'cli.ts', 'cli.js'];

export class WikiContextBuilder {
  private db: DatabaseConnection;
  private scanResult: ScanResult;

  constructor(db: DatabaseConnection, scanResult: ScanResult) {
    this.db = db;
    this.scanResult = scanResult;
  }

  buildOverviewContext(): OverviewContext {
    const entryFiles = this.scanResult.files
      .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
      .map(f => ({ name: f.relativePath.split('/').pop()!, path: f.relativePath }));

    const topSymbols = (this.db
      .prepare("SELECT DISTINCT name, type FROM symbols WHERE scope IS NULL ORDER BY name LIMIT 15")
      .all() as Array<{ name: string; type: SymbolType }>);

    return {
      projectType: this.scanResult.projectType,
      hasTypeScript: this.scanResult.hasTypeScript,
      fileCount: this.scanResult.files.length,
      techStack: this.scanResult.techStack,
      sourceDirs: this.scanResult.sourceDirs,
      entryFiles,
      topSymbols,
    };
  }

  buildArchitectureContext(): ArchitectureContext {
    const modules = this.buildModuleSummaries();

    // Collect all symbol names grouped by module
    const symbolToModule = new Map<string, string>();
    for (const mod of modules) {
      for (const sym of mod.symbols) {
        symbolToModule.set(sym.name, mod.name);
      }
    }

    // Only keep inter-module relations
    const allRelations = this.db
      .prepare('SELECT source, target, type FROM relations')
      .all() as Array<{ source: string; target: string; type: RelationType }>;

    const interModuleRelations = allRelations.filter(r => {
      const srcMod = symbolToModule.get(r.source);
      const tgtMod = symbolToModule.get(r.target);
      return srcMod && tgtMod && srcMod !== tgtMod;
    });

    return { modules, interModuleRelations };
  }

  buildDataFlowContext(): DataFlowContext {
    // Find entry point symbols (CLI commands, main functions)
    const entryPoints = this.db
      .prepare(
        "SELECT name, type, file_path, start_line FROM symbols WHERE (name LIKE 'register%' OR name = 'main' OR name = 'createProgram') AND scope IS NULL"
      )
      .all() as Array<{ name: string; type: SymbolType; file_path: string; start_line: number }>;

    const pipelines: ExecutionPipeline[] = [];

    for (const entry of entryPoints) {
      const steps = this.traceCallChain(entry.name, new Set(), 0, 5);
      if (steps.length > 0) {
        pipelines.push({
          name: entry.name,
          entrySymbol: entry.name,
          steps,
        });
      }
    }

    return { pipelines };
  }

  buildModulesContext(): ModulesContext {
    return { modules: this.buildModuleSummaries() };
  }

  buildApiContext(): ApiContext {
    const commands = this.db
      .prepare(
        "SELECT name, file_path, start_line FROM symbols WHERE name LIKE 'register%' AND type = 'function'"
      )
      .all() as Array<{ name: string; file_path: string; start_line: number }>;

    const exportedFunctions = this.db
      .prepare(
        "SELECT name, file_path, start_line FROM symbols WHERE type = 'function' AND scope IS NULL ORDER BY name"
      )
      .all() as Array<{ name: string; file_path: string; start_line: number }>;

    return {
      commands: commands.map(c => ({ name: c.name, filePath: c.file_path, startLine: c.start_line, description: '' })),
      exportedFunctions: exportedFunctions.map(f => ({ name: f.name, filePath: f.file_path, startLine: f.start_line })),
      frameworkNodes: [],
    };
  }

  buildBusinessContext(): BusinessContext {
    const services = this.db
      .prepare(
        "SELECT id, name, file_path FROM symbols WHERE type = 'class' AND (name LIKE '%Service%' OR name LIKE '%Repository%')"
      )
      .all() as Array<{ id: string; name: string; file_path: string }>;

    return {
      services: services.map(svc => {
        const methods = this.db
          .prepare(
            "SELECT name, visibility FROM symbols WHERE type = 'method' AND scope = ?"
          )
          .all(svc.name) as Array<{ name: string; visibility: string | null }>;

        const dependencies = this.db
          .prepare('SELECT target, type FROM relations WHERE source = ?')
          .all(svc.name) as Array<{ target: string; type: RelationType }>;

        const chunks = this.db
          .prepare(
            "SELECT content, start_line FROM chunks WHERE file_path = ? ORDER BY start_line LIMIT 1"
          )
          .all(svc.file_path) as Array<{ content: string; start_line: number }>;

        return {
          name: svc.name,
          filePath: svc.file_path,
          methods,
          dependencies,
          codeSnippet: chunks.length > 0 ? chunks[0].content.slice(0, 500) : '',
        };
      }),
    };
  }

  buildDesignDecisionsContext(): DesignDecisionsContext {
    const patterns: DesignPattern[] = [];

    // Detect strategy pattern: class named *Registry with register() method
    const registries = this.db
      .prepare(
        "SELECT name, file_path FROM symbols WHERE type = 'class' AND name LIKE '%Registry%'"
      )
      .all() as Array<{ name: string; file_path: string }>;

    for (const reg of registries) {
      const registerMethod = this.db
        .prepare(
          "SELECT name FROM symbols WHERE type = 'method' AND scope = ? AND name = 'register'"
        )
        .get(reg.name) as { name: string } | undefined;

      if (registerMethod) {
        const impls = this.db
          .prepare(
            "SELECT name, file_path FROM symbols WHERE type = 'class' AND name LIKE '%Resolver%'"
          )
          .all() as Array<{ name: string; file_path: string }>;

        patterns.push({
          pattern: 'Strategy Pattern',
          evidence: [
            `${reg.name} acts as a registry with a register() method`,
            `Multiple implementations: ${impls.map(i => i.name).join(', ')}`,
          ],
          files: [reg.file_path, ...impls.map(i => i.file_path)],
        });
      }
    }

    // Detect tech choices
    const techChoices: Array<{ technology: string; category: string; evidence: string[] }> = [];

    if (this.scanResult.techStack.some(t => t.includes('sqlite') || t.includes('better-sqlite3'))) {
      techChoices.push({
        technology: 'SQLite (better-sqlite3)',
        category: 'Database',
        evidence: ['Embedded SQL database with FTS5 full-text search'],
      });
    }

    if (this.scanResult.techStack.some(t => t.includes('tree-sitter'))) {
      techChoices.push({
        technology: 'Tree-sitter',
        category: 'Code Parsing',
        evidence: ['Incremental AST parsing for code symbol extraction'],
      });
    }

    return { patterns, techChoices };
  }

  buildGlossaryContext(): GlossaryContext {
    const rawSymbols = this.db
      .prepare('SELECT name, type, file_path, scope FROM symbols WHERE scope IS NULL ORDER BY name')
      .all() as Array<{ name: string; type: SymbolType; file_path: string; scope: string | null }>;

    // Deduplicate by name, keep first occurrence (top-level only, already filtered)
    const seen = new Set<string>();
    const symbols = rawSymbols.filter(s => {
      if (seen.has(s.name)) return false;
      seen.add(s.name);
      return true;
    }).slice(0, 30)
      .map(s => ({ name: s.name, type: s.type, filePath: s.file_path, scope: s.scope }));

    return { symbols };
  }

  // --- Private helpers ---

  private buildModuleSummaries(): ModuleSummary[] {
    const modules = this.db
      .prepare('SELECT name, paths, symbols, dependencies FROM modules')
      .all() as Array<{ name: string; paths: string; symbols: string; dependencies: string }>;

    return modules.map(mod => {
      const paths = JSON.parse(mod.paths) as string[];
      const symbolNames = JSON.parse(mod.symbols) as string[];

      const symbols = symbolNames.length > 0
        ? (this.db
            .prepare(
              `SELECT DISTINCT name, type FROM symbols WHERE name IN (${symbolNames.map(() => '?').join(',')}) AND scope IS NULL LIMIT 10`
            )
            .all(...symbolNames) as Array<{ name: string; type: SymbolType }>)
        : [];

      const outgoingRelations = this.db
        .prepare('SELECT DISTINCT target, type FROM relations WHERE source IN (SELECT name FROM symbols WHERE file_path LIKE ?)')
        .all(`${paths[0] ?? ''}%`) as Array<{ target: string; type: RelationType }>;

      const incomingRelations = this.db
        .prepare('SELECT DISTINCT source, type FROM relations WHERE target IN (SELECT name FROM symbols WHERE file_path LIKE ?)')
        .all(`${paths[0] ?? ''}%`) as Array<{ source: string; type: RelationType }>;

      // Get code snippets for top 3 symbols
      const codeSnippets: Array<{ symbolName: string; content: string; startLine: number }> = [];
      for (const symName of symbolNames.slice(0, 3)) {
        const chunk = this.db
          .prepare(
            "SELECT content, start_line FROM chunks WHERE content LIKE ? LIMIT 1"
          )
          .get(`%${symName}%`) as { content: string; start_line: number } | undefined;
        if (chunk) {
          codeSnippets.push({
            symbolName: symName,
            content: chunk.content.slice(0, 400),
            startLine: chunk.start_line,
          });
        }
      }

      return {
        name: mod.name,
        files: paths,
        symbols,
        outgoingRelations: outgoingRelations.filter((v, i, a) => a.findIndex(t => t.target === v.target) === i),
        incomingRelations: incomingRelations.filter((v, i, a) => a.findIndex(t => t.source === v.source) === i),
        codeSnippets,
      };
    });
  }

  private traceCallChain(
    symbolName: string,
    visited: Set<string>,
    depth: number,
    maxDepth: number,
  ): PipelineStep[] {
    if (depth >= maxDepth || visited.has(symbolName)) return [];
    visited.add(symbolName);

    const symbol = this.db
      .prepare(
        "SELECT name, type, file_path, start_line FROM symbols WHERE name = ? LIMIT 1"
      )
      .get(symbolName) as { name: string; type: SymbolType; file_path: string; start_line: number } | undefined;

    if (!symbol) return [];

    const chunks = this.db
      .prepare("SELECT content FROM chunks WHERE file_path = ? AND start_line <= ? AND end_line >= ? LIMIT 1")
      .all(symbol.file_path, symbol.start_line, symbol.start_line) as Array<{ content: string }>;

    const step: PipelineStep = {
      symbol: symbol.name,
      type: symbol.type,
      filePath: symbol.file_path,
      startLine: symbol.start_line,
      codeSnippet: chunks.length > 0 ? chunks[0].content.slice(0, 300) : '',
    };

    const calls = this.db
      .prepare("SELECT target FROM relations WHERE source = ? AND type = 'calls'")
      .all(symbolName) as Array<{ target: string }>;

    const nextSteps: PipelineStep[] = [];
    for (const call of calls) {
      const chain = this.traceCallChain(call.target, visited, depth + 1, maxDepth);
      nextSteps.push(...chain);
    }

    return [step, ...nextSteps];
  }
}
