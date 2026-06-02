import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseConnection } from '../core/database.js';
import type { ScanResult } from '../core/scanner.js';
import type { SymbolType, RelationType } from '../core/types.js';
import type {
  OverviewContext,
  ArchitectureContext,
  ModuleSummary,
  DataFlowContext,
  ExecutionSequence,
  SequenceParticipant,
  SequenceMessage,
  OnboardingContext,
  TroubleshootingContext,
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
    const entryPoints = this.db
      .prepare(
        `SELECT DISTINCT name, type, file_path, start_line FROM symbols
         WHERE scope IS NULL AND file_path NOT LIKE 'tests/%' AND file_path NOT LIKE 'test/%'
         AND (
           name LIKE 'register%' OR name = 'main' OR name LIKE 'create%'
           OR (type = 'function' AND name NOT LIKE '_%' AND name NOT LIKE '%Helper' AND name NOT LIKE '%Util')
         )
         AND type IN ('function', 'class', 'method')
         ORDER BY file_path, start_line`
      )
      .all() as Array<{ name: string; type: SymbolType; file_path: string; start_line: number }>;

    const sequences: ExecutionSequence[] = [];
    const seenNames = new Set<string>();

    for (const entry of entryPoints) {
      if (seenNames.has(entry.name)) continue;
      seenNames.add(entry.name);
      const seq = this.buildSequence(entry.name, new Set(), 8);
      if (seq.messages.length > 0) {
        sequences.push(seq);
      }
    }

    return { sequences };
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
        `SELECT DISTINCT name, file_path FROM symbols
         WHERE type = 'class' AND (name LIKE '%Service%' OR name LIKE '%Repository%')
         AND file_path NOT LIKE 'tests/%' AND file_path NOT LIKE 'test/%'
         ORDER BY name`
      )
      .all() as Array<{ name: string; file_path: string }>;

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
    const seenPatterns = new Set<string>();

    // Strategy Pattern: *Registry with register() and multiple *Resolver implementations
    const registries = this.db
      .prepare(
        "SELECT DISTINCT name, file_path FROM symbols WHERE type = 'class' AND name LIKE '%Registry%' AND file_path NOT LIKE 'tests/%'"
      )
      .all() as Array<{ name: string; file_path: string }>;

    for (const reg of registries) {
      const registerMethod = this.db
        .prepare("SELECT name FROM symbols WHERE type = 'method' AND scope = ? AND name = 'register'")
        .get(reg.name) as { name: string } | undefined;

      if (registerMethod) {
        const impls = this.db
          .prepare(
            "SELECT DISTINCT name, file_path FROM symbols WHERE type = 'class' AND name LIKE '%Resolver%' AND file_path NOT LIKE 'tests/%'"
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
        seenPatterns.add('Strategy Pattern');
      }
    }

    // Service Layer: multiple *Service classes in same directory
    const serviceClasses = this.db
      .prepare(
        `SELECT DISTINCT name, file_path FROM symbols
         WHERE type = 'class' AND name LIKE '%Service'
         AND file_path NOT LIKE 'tests/%' AND file_path NOT LIKE 'test/%'`
      )
      .all() as Array<{ name: string; file_path: string }>;

    if (serviceClasses.length >= 2) {
      const serviceDir = serviceClasses[0].file_path.replace(/\/[^/]+$/, '');
      const sameDir = serviceClasses.filter(s => s.file_path.startsWith(serviceDir));
      if (sameDir.length >= 2 && !seenPatterns.has('Service Layer')) {
        patterns.push({
          pattern: 'Service Layer',
          evidence: [
            `${sameDir.length} service classes in ${serviceDir}/`,
            `Services: ${sameDir.map(s => s.name).join(', ')}`,
            'Each service encapsulates a distinct business capability',
          ],
          files: sameDir.map(s => s.file_path),
        });
        seenPatterns.add('Service Layer');
      }
    }

    // Builder Pattern: *Builder class with build() method
    const builders = this.db
      .prepare(
        `SELECT DISTINCT name, file_path FROM symbols
         WHERE type = 'class' AND name LIKE '%Builder%'
         AND file_path NOT LIKE 'tests/%'`
      )
      .all() as Array<{ name: string; file_path: string }>;

    for (const b of builders) {
      const buildMethod = this.db
        .prepare("SELECT name FROM symbols WHERE type = 'method' AND scope = ? AND name = 'build'")
        .get(b.name);
      if (buildMethod && !seenPatterns.has('Builder Pattern')) {
        patterns.push({
          pattern: 'Builder Pattern',
          evidence: [
            `${b.name} provides fluent construction API with build() method`,
            'Separates object construction from representation',
          ],
          files: [b.file_path],
        });
        seenPatterns.add('Builder Pattern');
      }
    }

    // Repository Pattern: *Repository classes
    const repos = this.db
      .prepare(
        `SELECT DISTINCT name, file_path FROM symbols
         WHERE type = 'class' AND name LIKE '%Repository%'
         AND file_path NOT LIKE 'tests/%'`
      )
      .all() as Array<{ name: string; file_path: string }>;

    if (repos.length > 0 && !seenPatterns.has('Repository Pattern')) {
      patterns.push({
        pattern: 'Repository Pattern',
        evidence: repos.map(r => `${r.name} encapsulates data access logic (${r.file_path})`),
        files: repos.map(r => r.file_path),
      });
      seenPatterns.add('Repository Pattern');
    }

    // Command Pattern: multiple command handler files in commands/ directory
    const commandFiles = this.db
      .prepare(
        `SELECT DISTINCT file_path FROM symbols
         WHERE type = 'function' AND name LIKE 'register%'
         AND file_path NOT LIKE 'tests/%'`
      )
      .all() as Array<{ file_path: string }>;

    if (commandFiles.length >= 2 && !seenPatterns.has('Command Pattern')) {
      patterns.push({
        pattern: 'Command Pattern',
        evidence: [
          `${commandFiles.length} command handlers in commands/ directory`,
          'Each command encapsulates a single CLI operation',
          'Commands: ' + commandFiles.map(f => f.file_path.split('/').pop()).join(', '),
        ],
        files: commandFiles.map(f => f.file_path),
      });
      seenPatterns.add('Command Pattern');
    }

    // Detect tech choices
    const techChoices: Array<{ technology: string; category: string; evidence: string[] }> = [];

    const techMap: Array<[string[], string, string, string]> = [
      [['sqlite', 'better-sqlite3'], 'SQLite (better-sqlite3)', 'Database', 'Embedded SQL database with FTS5 full-text search for local code index'],
      [['tree-sitter', 'web-tree-sitter'], 'Tree-sitter', 'Code Parsing', 'Incremental WASM-based AST parsing for precise symbol extraction'],
      [['commander'], 'Commander.js', 'CLI Framework', 'Declarative command-line interface with options and sub-commands'],
      [['ai', '@ai-sdk'], 'Vercel AI SDK', 'LLM Integration', 'Streaming LLM responses with provider abstraction'],
      [['@ai-sdk/openai'], 'OpenAI Provider', 'AI Model', 'OpenAI-compatible API integration for text generation'],
      [['tsup'], 'tsup (esbuild)', 'Build Tool', 'Fast esbuild-based bundler targeting ESM output'],
      [['vitest'], 'Vitest', 'Testing', 'Vite-native test framework with ESM support'],
      [['typescript'], 'TypeScript', 'Language', 'Static type checking for code safety and IDE support'],
    ];

    for (const [keywords, tech, category, evidence] of techMap) {
      if (keywords.some(k => this.scanResult.techStack.some(t => t.includes(k)))) {
        techChoices.push({ technology: tech, category, evidence: [evidence] });
      }
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

  buildOnboardingContext(): OnboardingContext {
    const entryFiles = this.scanResult.files
      .filter(f => ENTRY_FILE_NAMES.some(e => f.relativePath.endsWith('/' + e) || f.relativePath === e))
      .map(f => ({ name: f.relativePath.split('/').pop()!, path: f.relativePath }));

    // Read package.json for package manager and Node.js version
    let packageManager = 'npm';
    let nodeVersion = '';
    try {
      const pkgPath = join(this.scanResult.rootDir, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.packageManager) {
          const pm = pkg.packageManager as string;
          packageManager = pm.split('@')[0];
        }
        if (pkg.engines?.node) {
          nodeVersion = pkg.engines.node as string;
        }
      }
    } catch { /* ignore */ }

    // Detect lock file if packageManager field is missing
    if (packageManager === 'npm') {
      if (existsSync(join(this.scanResult.rootDir, 'pnpm-lock.yaml'))) packageManager = 'pnpm';
      else if (existsSync(join(this.scanResult.rootDir, 'yarn.lock'))) packageManager = 'yarn';
    }

    // Extract CLI commands from database
    const cliCommands = (this.db
      .prepare(
        "SELECT name, file_path FROM symbols WHERE name LIKE 'register%' AND type = 'function' AND file_path NOT LIKE 'tests/%'"
      )
      .all() as Array<{ name: string; file_path: string }>)
      .map(c => {
        const cmdName = c.name.replace(/^register/, '').toLowerCase();
        return { name: cmdName || c.name, description: `CLI command defined in ${c.file_path}` };
      });

    return {
      projectType: this.scanResult.projectType,
      techStack: this.scanResult.techStack,
      entryFiles,
      sourceDirs: this.scanResult.sourceDirs,
      hasTypeScript: this.scanResult.hasTypeScript,
      packageManager,
      nodeVersion,
      cliCommands,
    };
  }

  buildTroubleshootingContext(): TroubleshootingContext {
    const modules = this.db
      .prepare('SELECT name FROM modules')
      .all() as Array<{ name: string }>;

    return {
      projectType: this.scanResult.projectType,
      techStack: this.scanResult.techStack,
      modules,
    };
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

      // Build file-level symbol map
      const fileSymbols = paths.map(filePath => {
        const fileSyms = this.db
          .prepare(
            "SELECT name, type FROM symbols WHERE file_path = ? AND scope IS NULL ORDER BY start_line"
          )
          .all(filePath) as Array<{ name: string; type: SymbolType }>;
        return { file: filePath, symbols: fileSyms };
      }).filter(fs => fs.symbols.length > 0);

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
        fileSymbols,
        outgoingRelations: outgoingRelations.filter((v, i, a) => a.findIndex(t => t.target === v.target) === i),
        incomingRelations: incomingRelations.filter((v, i, a) => a.findIndex(t => t.source === v.source) === i),
        codeSnippets,
      };
    });
  }

  private buildSequence(
    entryName: string,
    globalVisited: Set<string>,
    maxDepth: number,
  ): ExecutionSequence {
    const participants: SequenceParticipant[] = [];
    const messages: SequenceMessage[] = [];
    const participantSet = new Set<string>();

    // Pre-load all known symbol names for filtering out generic method calls
    const knownSymbolNames = new Set(
      (this.db.prepare('SELECT DISTINCT name FROM symbols').all() as Array<{ name: string }>).map(s => s.name),
    );

    const addParticipant = (name: string) => {
      if (participantSet.has(name)) return;
      participantSet.add(name);
      const sym = this.db
        .prepare("SELECT type, file_path FROM symbols WHERE name = ? LIMIT 1")
        .get(name) as { type: SymbolType; file_path: string } | undefined;
      participants.push({
        name,
        type: sym?.type ?? 'function',
        filePath: sym?.file_path ?? '',
      });
    };

    // BFS traversal following calls relations
    const queue: Array<{ symbolName: string; depth: number }> = [{ symbolName: entryName, depth: 0 }];
    const visited = new Set<string>([entryName]);

    addParticipant(entryName);

    while (queue.length > 0) {
      const { symbolName, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const calls = this.db
        .prepare("SELECT target, call_line, file_path FROM relations WHERE source = ? AND type = 'calls' ORDER BY call_line ASC")
        .all(symbolName) as Array<{ target: string; call_line: number | null; file_path: string }>;

      for (const call of calls) {
        const calleeName = call.target;

        // Skip calls to names not in the symbol table (filters out generic method names
        // like 'option', 'description', 'action' from fluent API chains)
        if (!knownSymbolNames.has(calleeName)) continue;

        // Skip if we've seen this edge before
        const edgeKey = `${symbolName}->${calleeName}`;
        if (globalVisited.has(edgeKey)) continue;
        globalVisited.add(edgeKey);

        messages.push({
          from: symbolName,
          to: calleeName,
          label: calleeName,
          callLine: call.call_line ?? 0,
          filePath: call.file_path,
        });

        addParticipant(calleeName);

        if (!visited.has(calleeName)) {
          visited.add(calleeName);
          queue.push({ symbolName: calleeName, depth: depth + 1 });
        }
      }
    }

    return {
      name: entryName,
      entrySymbol: entryName,
      participants,
      messages,
    };
  }
}
