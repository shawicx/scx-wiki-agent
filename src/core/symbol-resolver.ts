import { PathResolver } from './path-resolver.js';

export interface ImportInfo {
  name: string;
  from: string;
}

export interface FileImports {
  filePath: string;
  imports: ImportInfo[];
}

export interface ImportChain {
  symbol: string;
  source: string;
  target: string;
}

export interface SymbolLocation {
  name: string;
  filePath: string;
}

export class SymbolResolver {
  private pathResolver: PathResolver;

  constructor(rootDir: string) {
    this.pathResolver = new PathResolver(rootDir);
  }

  resolveImport(importPath: string, fromFilePath: string): string | null {
    return this.pathResolver.resolve(importPath, fromFilePath);
  }

  buildSymbolMap(fileSymbols: { relativePath: string; symbols: string[] }[]): Map<string, SymbolLocation> {
    const map = new Map<string, SymbolLocation>();
    for (const { relativePath, symbols } of fileSymbols) {
      for (const name of symbols) {
        map.set(name, { name, filePath: relativePath });
      }
    }
    return map;
  }

  traceImportChains(fileImports: FileImports[]): ImportChain[] {
    const chains: ImportChain[] = [];
    for (const file of fileImports) {
      for (const imp of file.imports) {
        const resolvedPath = this.pathResolver.resolve(imp.from, file.filePath);
        if (resolvedPath) {
          chains.push({
            symbol: imp.name,
            source: resolvedPath,
            target: file.filePath,
          });
        }
      }
    }
    return chains;
  }
}
