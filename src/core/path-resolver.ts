import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve, normalize } from 'path';

export class PathResolver {
  private rootDir: string;
  private pathAliases: Map<string, string> = new Map();
  private baseUrl: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.baseUrl = rootDir;
    this.loadTsConfigPaths();
  }

  resolve(importPath: string, fromFilePath: string): string | null {
    // External package — starts with a package name (not . or @/ alias)
    if (!importPath.startsWith('.') && !this.isAlias(importPath)) {
      return null;
    }

    let resolved: string;

    if (importPath.startsWith('.')) {
      const fromDir = dirname(join(this.rootDir, fromFilePath));
      resolved = resolve(fromDir, importPath);
    } else {
      const alias = this.resolveAlias(importPath);
      if (!alias) return null;
      resolved = alias;
    }

    // Strip .js/.mjs/.cjs extension (TypeScript convention)
    resolved = resolved.replace(/\.(js|mjs|cjs)$/, '.ts');

    // Try exact path, then with extensions
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
    for (const ext of extensions) {
      const candidate = resolved + ext;
      if (existsSync(candidate)) {
        return normalize(candidate);
      }
    }

    return null;
  }

  private isAlias(importPath: string): boolean {
    for (const alias of this.pathAliases.keys()) {
      if (importPath === alias || importPath.startsWith(alias + '/')) return true;
    }
    return false;
  }

  private resolveAlias(importPath: string): string | null {
    for (const [alias, target] of this.pathAliases.entries()) {
      if (importPath === alias || importPath.startsWith(alias + '/')) {
        const rest = importPath.slice(alias.length);
        return join(this.baseUrl, target, rest);
      }
    }
    return null;
  }

  private loadTsConfigPaths(): void {
    const tsconfigPath = join(this.rootDir, 'tsconfig.json');
    if (!existsSync(tsconfigPath)) return;

    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
    const paths = tsconfig.compilerOptions?.paths;
    const baseUrl = tsconfig.compilerOptions?.baseUrl;

    if (baseUrl) {
      this.baseUrl = join(this.rootDir, baseUrl);
    }

    if (paths) {
      for (const [pattern, targets] of Object.entries(paths)) {
        const alias = pattern.replace(/\/\*$/, '');
        const target = (targets as string[])[0].replace(/\/\*$/, '').replace(/^\.\//, '');
        this.pathAliases.set(alias, target);
      }
    }
  }
}
