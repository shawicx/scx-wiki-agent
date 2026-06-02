import { readFileSync } from 'fs';
import { extname, basename } from 'path';
import type { DatabaseConnection } from '../core/database.js';
import { FileScanner } from '../core/scanner.js';
import { TreeSitterParser } from '../core/parser.js';
import { extractSymbols, extractCalls } from '../core/symbol-extractor.js';
import { computeHash, generateId, getFileLanguage } from '../shared/utils.js';
import { CODE_EXTENSIONS } from '../shared/constants.js';
import type { ChunkType, ChunkMetadata } from '../core/types.js';
import { ResolverRegistry } from '../strategy/resolver-registry.js';
import { RelationGraph } from '../core/graph/relation-graph.js';
import { ModuleIndex } from '../core/module-index.js';
import { NestResolver } from '../strategy/resolvers/nest-resolver.js';
import { ReactResolver } from '../strategy/resolvers/react-resolver.js';
import { VueResolver } from '../strategy/resolvers/vue-resolver.js';
import { CommanderResolver } from '../strategy/resolvers/commander-resolver.js';
import { LangGraphResolver } from '../strategy/resolvers/langgraph-resolver.js';
import { MastraResolver } from '../strategy/resolvers/mastra-resolver.js';
import { TauriResolver } from '../strategy/resolvers/tauri-resolver.js';

/**
 * Service that orchestrates scanning, parsing, symbol extraction, chunking,
 * and database storage for a project.
 *
 * No LLM tokens are consumed — all processing is local and deterministic.
 */
export class IndexService {
  private db: DatabaseConnection;
  private parser: TreeSitterParser;
  private resolverRegistry: ResolverRegistry;
  private relationGraph: RelationGraph;

  constructor(db: DatabaseConnection) {
    this.db = db;
    this.parser = new TreeSitterParser();
    this.resolverRegistry = new ResolverRegistry();
    this.resolverRegistry.register(new NestResolver());
    this.resolverRegistry.register(new ReactResolver());
    this.resolverRegistry.register(new VueResolver());
    this.resolverRegistry.register(new CommanderResolver());
    this.resolverRegistry.register(new LangGraphResolver());
    this.resolverRegistry.register(new MastraResolver());
    this.resolverRegistry.register(new TauriResolver());
    this.relationGraph = new RelationGraph();
  }

  /**
   * Initialize the TreeSitterParser (loads WASM grammars).
   */
  async init(): Promise<void> {
    await this.parser.init();
  }

  /**
   * Index all supported files in a project directory.
   *
   * Scans files, parses code, extracts symbols, creates chunks,
   * and populates the FTS5 search index.
   *
   * @returns 0 — zero LLM tokens consumed.
   */
  async indexProject(rootDir: string): Promise<number> {
    const scanner = new FileScanner(rootDir);
    const scanResult = scanner.scan();

    let ftsRowId = this.getNextFtsRowId();

    const transaction = this.db.transaction(() => {
      for (const file of scanResult.files) {
        const content = this.readFileContent(file.absolutePath);
        const hash = computeHash(content);
        const docId = generateId();
        const language = getFileLanguage(file.absolutePath);

        // Insert document record
        this.insertDocument(docId, file.relativePath, content, language, hash);

        const ext = extname(file.absolutePath).toLowerCase();

        if (CODE_EXTENSIONS.includes(ext)) {
          // Code file: parse with tree-sitter, extract symbols, create chunks
          const tree = this.parser.parse(content, file.absolutePath);

          const symbols = extractSymbols(tree, file.relativePath);
          for (const sym of symbols) {
            this.insertSymbol(sym);
          }

          // Extract call expressions and create 'calls' relations
          const extractedCalls = extractCalls(tree, file.relativePath, symbols);
          for (const call of extractedCalls) {
            const relId = generateId();
            const source = call.callerScope ?? '<anonymous>';
            const target = call.calleeName;
            this.relationGraph.addEdge({
              source,
              target,
              type: 'calls',
              filePath: file.relativePath,
              callLine: call.callLine,
            });
            this.insertRelation(relId, source, target, 'calls', file.relativePath, call.callLine);
          }

          // Framework resolver extraction
          const { nodes: frameworkNodes, relations: frameworkRelations } = this.resolverRegistry.extractAll(content, file.relativePath);
          for (const node of frameworkNodes) {
            this.relationGraph.addNode({ id: node.id, name: node.name, type: node.type, filePath: node.filePath, metadata: node.metadata });
          }
          for (const rel of frameworkRelations) {
            this.relationGraph.addEdge({ source: rel.source, target: rel.target, type: rel.type, filePath: rel.filePath });
            this.insertRelation(rel.id, rel.source, rel.target, rel.type, rel.filePath, null);
          }

          // Create chunks per symbol (excluding import/export symbols)
          const codeSymbols = symbols.filter(
            (s) => s.type !== 'import' && s.type !== 'export',
          );
          for (const sym of codeSymbols) {
            const chunkContent = this.extractLines(
              content,
              sym.startLine,
              sym.endLine,
            );
            const chunkId = generateId();
            const metadata: ChunkMetadata = {
              language,
              symbols: [sym.name],
              symbolType: sym.type,
              imports: [],
              exports: [],
              module: basename(file.relativePath, ext),
            };

            this.insertChunk(
              chunkId,
              docId,
              file.relativePath,
              chunkContent,
              sym.startLine,
              sym.endLine,
              'code_symbol',
              metadata,
            );

            // Insert into FTS5
            this.db
              .prepare('INSERT INTO chunks_fts (rowid, content, chunk_id) VALUES (?, ?, ?)')
              .run(ftsRowId++, chunkContent, chunkId);
          }

          tree.delete();
        } else if (ext === '.md') {
          // Markdown: split by headings, create chunks
          const headingChunks = this.splitMarkdownByHeadings(content);
          for (const chunk of headingChunks) {
            const chunkId = generateId();
            const metadata: ChunkMetadata = {
              language: 'markdown',
              symbols: [],
              symbolType: 'unknown',
              imports: [],
              exports: [],
              module: basename(file.relativePath, ext),
            };

            this.insertChunk(
              chunkId,
              docId,
              file.relativePath,
              chunk.content,
              chunk.startLine,
              chunk.endLine,
              'markdown_heading',
              metadata,
            );

            // Insert into FTS5
            this.db
              .prepare('INSERT INTO chunks_fts (rowid, content, chunk_id) VALUES (?, ?, ?)')
              .run(ftsRowId++, chunk.content, chunkId);
          }
        } else if (ext === '.json') {
          // JSON: store full content as one chunk
          const chunkId = generateId();
          const metadata: ChunkMetadata = {
            language: 'json',
            symbols: [],
            symbolType: 'unknown',
            imports: [],
            exports: [],
            module: basename(file.relativePath, ext),
          };

          this.insertChunk(
            chunkId,
            docId,
            file.relativePath,
            content,
            1,
            content.split('\n').length,
            'full_config',
            metadata,
          );

          // Insert into FTS5
          this.db
            .prepare('INSERT INTO chunks_fts (rowid, content, chunk_id) VALUES (?, ?, ?)')
            .run(ftsRowId++, content, chunkId);
        }
      }

      // Build and persist module index from all symbols (inside transaction)
      const moduleIndex = new ModuleIndex();
      const rawSymbols = this.db.prepare('SELECT * FROM symbols').all() as any[];
      // Map DB snake_case columns to Symbol camelCase interface
      const allSymbols = rawSymbols.map((s: any) => ({
        ...s,
        filePath: s.file_path,
        startLine: s.start_line,
        endLine: s.end_line,
      }));
      const modules = moduleIndex.buildFromSymbols(allSymbols);
      const insertModule = this.db.prepare('INSERT OR IGNORE INTO modules (id, name, paths, symbols, dependencies, description) VALUES (?, ?, ?, ?, ?, ?)');
      for (const mod of modules) {
        insertModule.run(mod.id, mod.name, JSON.stringify(mod.paths), JSON.stringify(mod.symbols), JSON.stringify(mod.dependencies), null);
      }
    });

    transaction();

    return 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private readFileContent(absPath: string): string {
    return readFileSync(absPath, 'utf-8');
  }

  private insertDocument(
    id: string,
    path: string,
    content: string,
    language: string,
    hash: string,
  ): void {
    this.db
      .prepare(
        'INSERT INTO documents (id, path, content, language, hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, path, content, language, hash, Date.now());
  }

  private insertSymbol(sym: {
    id: string;
    name: string;
    type: string;
    filePath: string;
    startLine: number;
    endLine: number;
    scope: string | null;
    visibility: string | null;
  }): void {
    this.db
      .prepare(
        'INSERT INTO symbols (id, name, type, file_path, start_line, end_line, scope, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        sym.id,
        sym.name,
        sym.type,
        sym.filePath,
        sym.startLine,
        sym.endLine,
        sym.scope,
        sym.visibility,
      );
  }

  private insertChunk(
    id: string,
    documentId: string,
    filePath: string,
    content: string,
    startLine: number,
    endLine: number,
    chunkType: ChunkType,
    metadata: ChunkMetadata,
  ): void {
    this.db
      .prepare(
        'INSERT INTO chunks (id, document_id, file_path, content, start_line, end_line, chunk_type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        documentId,
        filePath,
        content,
        startLine,
        endLine,
        chunkType,
        JSON.stringify(metadata),
      );
  }

  /**
   * Extract lines from content (1-indexed startLine and endLine inclusive).
   */
  private extractLines(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    // startLine and endLine are 1-indexed, slice is 0-indexed end-exclusive
    const start = startLine - 1;
    const end = endLine; // slice end is exclusive, endLine is inclusive
    return lines.slice(start, end).join('\n');
  }

  /**
   * Split markdown content by ATX headings (# Heading).
   * Each heading and its content become a separate chunk.
   */
  private splitMarkdownByHeadings(
    content: string,
  ): Array<{ content: string; startLine: number; endLine: number }> {
    const lines = content.split('\n');
    const chunks: Array<{ content: string; startLine: number; endLine: number }> = [];
    let currentLines: string[] = [];
    let currentStart = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (/^#{1,6}\s/.test(line) && currentLines.length > 0) {
        // Flush current chunk
        chunks.push({
          content: currentLines.join('\n'),
          startLine: currentStart,
          endLine: lineNum - 1,
        });
        currentLines = [line];
        currentStart = lineNum;
      } else {
        if (currentLines.length === 0 && line.trim().length > 0) {
          currentStart = lineNum;
        }
        currentLines.push(line);
      }
    }

    // Flush remaining
    if (currentLines.length > 0) {
      const trimmed = currentLines.join('\n').trim();
      if (trimmed.length > 0) {
        chunks.push({
          content: trimmed,
          startLine: currentStart,
          endLine: lines.length,
        });
      }
    }

    return chunks;
  }

  /**
   * Get the next available rowid for chunks_fts.
   * FTS5 rowids must be unique positive integers.
   */
  private getNextFtsRowId(): number {
    const result = this.db
      .prepare('SELECT MAX(rowid) as maxId FROM chunks_fts')
      .get() as any;
    return (result?.maxId ?? 0) + 1;
  }

  private insertRelation(id: string, source: string, target: string, type: string, filePath: string, callLine?: number | null): void {
    this.db
      .prepare('INSERT INTO relations (id, source, target, type, file_path, call_line) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, source, target, type, filePath, callLine ?? null);
  }
}
