import * as WebTreeSitter from 'web-tree-sitter';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync } from 'fs';

const esmRequire = createRequire(import.meta.url);

/**
 * Tree-sitter parser wrapper for TypeScript/TSX files.
 *
 * Uses web-tree-sitter (WASM-based) to parse source code into AST trees
 * that can be queried for symbol extraction.
 */
export class TreeSitterParser {
  private parser: WebTreeSitter.Parser | null = null;
  private typescriptLang: WebTreeSitter.Language | null = null;
  private tsxLang: WebTreeSitter.Language | null = null;

  /**
   * Initialize the parser by loading the web-tree-sitter WASM module
   * and the TypeScript/TSX grammar WASM files.
   */
  async init(): Promise<void> {
    await WebTreeSitter.Parser.init();

    this.parser = new WebTreeSitter.Parser();

    const tsWasmPath = this.resolveGrammarPath('tree-sitter-typescript');
    const tsxWasmPath = this.resolveGrammarPath('tree-sitter-tsx');

    this.typescriptLang = await WebTreeSitter.Language.load(tsWasmPath);
    this.tsxLang = await WebTreeSitter.Language.load(tsxWasmPath);
  }

  /**
   * Parse source code and return a syntax tree.
   *
   * @param code - The source code to parse.
   * @param filePath - Optional file path used to determine language (TSX vs TS).
   * @returns The parsed syntax tree. Caller is responsible for calling tree.delete().
   */
  parse(code: string, filePath?: string): WebTreeSitter.Tree {
    if (!this.parser) {
      throw new Error('Parser not initialized. Call init() first.');
    }

    const isTsx = filePath?.endsWith('.tsx') || filePath?.endsWith('.jsx');
    this.parser.setLanguage(isTsx ? this.tsxLang : this.typescriptLang);

    const tree = this.parser.parse(code);
    if (!tree) {
      throw new Error('Failed to parse code');
    }
    return tree;
  }

  /**
   * Clean up parser resources.
   */
  dispose(): void {
    this.parser?.delete();
    this.parser = null;
  }

  /**
   * Resolve the path to a tree-sitter grammar WASM file.
   *
   * Looks for the WASM file in the tree-sitter-typescript package directory,
   * which contains both tree-sitter-typescript.wasm and tree-sitter-tsx.wasm.
   */
  private resolveGrammarPath(grammar: string): string {
    const pkgName = 'tree-sitter-typescript';

    // Strategy 1: Use createRequire-based resolution (ESM-compatible)
    // Works when the package is installed alongside this tool
    try {
      const pkgJsonPath = esmRequire.resolve(`${pkgName}/package.json`);
      const pkgDir = dirname(pkgJsonPath);
      const wasmPath = resolve(pkgDir, `${grammar}.wasm`);
      if (existsSync(wasmPath)) {
        return wasmPath;
      }
    } catch {
      // Package not resolvable, try other strategies
    }

    // Strategy 2: Resolve relative to this file's location
    // Handles both bundled output (dist/) and source (src/core/)
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const candidateRelPaths = [
      ['..', 'node_modules'], // bundled at dist/bin.js
      ['..', '..', 'node_modules'], // source at src/core/parser.ts
    ];
    for (const parts of candidateRelPaths) {
      const wasmPath = resolve(thisDir, ...parts, pkgName, `${grammar}.wasm`);
      if (existsSync(wasmPath)) {
        return wasmPath;
      }
    }

    // Strategy 3: Scan pnpm .pnpm directory for versioned package
    for (const nodeModulesRel of [['..', 'node_modules'], ['..', '..', 'node_modules']]) {
      const pnpmDir = resolve(thisDir, ...nodeModulesRel, '.pnpm');
      if (existsSync(pnpmDir)) {
        try {
          const entries = readdirSync(pnpmDir);
          const match = entries.find((e) => e.startsWith('tree-sitter-typescript@'));
          if (match) {
            const wasmPath = resolve(pnpmDir, match, 'node_modules', pkgName, `${grammar}.wasm`);
            if (existsSync(wasmPath)) {
              return wasmPath;
            }
          }
        } catch {
          // Ignore readdir errors
        }
      }
    }

    // Strategy 4: Resolve from CWD (works when running from project root)
    const fromCwd = resolve(process.cwd(), 'node_modules', pkgName, `${grammar}.wasm`);
    if (existsSync(fromCwd)) {
      return fromCwd;
    }

    throw new Error(
      `Could not find ${grammar}.wasm. Searched in tree-sitter-typescript package, ` +
      `node_modules relative to source, pnpm store, and CWD.`,
    );
  }
}
