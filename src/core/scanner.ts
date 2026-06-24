import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, extname, basename, relative } from 'path';
import ignore from 'ignore';
import { IGNORED_DIRS, SUPPORTED_EXTENSIONS, CODE_EXTENSIONS } from '../shared/constants.js';
import { getFileLanguage, relativePath } from '../shared/utils.js';
import type { Language } from './types.js';

export type ProjectType = 'backend' | 'frontend' | 'cli' | 'desktop' | 'agent' | 'monorepo' | 'unknown';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  language: Language;
  extension: string;
  size: number;
}

export interface ScanResult {
  rootDir: string;
  files: ScannedFile[];
  techStack: string[];
  projectType: ProjectType;
  hasTypeScript: boolean;
  sourceDirs: string[];
}

const KNOWN_SOURCE_DIRS = ['src', 'app', 'lib', 'packages', 'cmd', 'internal'];

const PROJECT_TYPE_INDICATORS: Record<string, string[]> = {
  backend: ['express', '@nestjs/core', 'fastify', '@fastify'],
  frontend: ['react', 'react-dom', 'vue', 'next', 'nuxt', '@sveltejs'],
  agent: ['langgraph', '@langchain/core', 'mastra'],
  cli: ['commander', 'yargs'],
  desktop: ['@tauri-apps/api'],
};

export class FileScanner {
  private rootDir: string;
  private ig: ReturnType<typeof ignore>;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.ig = ignore();
    this.loadGitignore();
  }

  private loadGitignore(): void {
    const gitignorePath = join(this.rootDir, '.gitignore');
    if (existsSync(gitignorePath)) {
      try {
        const content = readFileSync(gitignorePath, 'utf-8');
        this.ig.add(content);
      } catch {
        // ignore read errors
      }
    }
  }

  private isIgnored(relPath: string): boolean {
    try {
      return this.ig.ignores(relPath);
    } catch {
      return false;
    }
  }

  scan(): ScanResult {
    const files = this.walkDirectory(this.rootDir);
    const techStack = this.detectTechStack(files);
    const projectType = this.detectProjectType(files, techStack);
    const hasTypeScript = files.some((f) => f.extension === '.ts' || f.extension === '.tsx');
    const sourceDirs = this.detectSourceDirs(files);

    return {
      rootDir: this.rootDir,
      files,
      techStack,
      projectType,
      hasTypeScript,
      sourceDirs,
    };
  }

  private walkDirectory(dir: string): ScannedFile[] {
    const results: ScannedFile[] = [];

    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return results;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const rel = relativePath(this.rootDir, fullPath);
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (this.shouldSkipDir(entry) || this.isIgnored(rel)) {
          continue;
        }
        results.push(...this.walkDirectory(fullPath));
      } else if (stat.isFile()) {
        if (this.isIgnored(rel)) {
          continue;
        }
        const ext = extname(entry).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push({
            absolutePath: fullPath,
            relativePath: rel,
            language: getFileLanguage(fullPath),
            extension: ext,
            size: stat.size,
          });
        }
      }
    }

    return results;
  }

  private shouldSkipDir(dirName: string): boolean {
    if (IGNORED_DIRS.includes(dirName)) {
      return true;
    }
    if (dirName.startsWith('.')) {
      return true;
    }
    return false;
  }

  private detectTechStack(files: ScannedFile[]): string[] {
    const pkgPath = join(this.rootDir, 'package.json');
    if (!existsSync(pkgPath)) {
      return [];
    }

    try {
      const content = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ]);

      // 收集源码中实际 import 的包名，过滤死依赖（0 import）
      const importedPackages = this.collectImportedPackages(files);

      // 只保留被实际 import 的依赖；若 import 集合为空（如纯配置项目），回退到全量
      if (importedPackages.size === 0) {
        return [...allDeps];
      }
      return [...allDeps].filter(dep => importedPackages.has(dep));
    } catch {
      return [];
    }
  }

  /**
   * 扫描源文件，提取所有 import 语句引用的包名。
   * 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。
   */
  private collectImportedPackages(files: ScannedFile[]): Set<string> {
    const imported = new Set<string>();
    // 匹配 ES import: import ... from 'pkg'; import 'pkg'; 动态 import('pkg')
    const importRegex = /(?:import\s+(?:[\s\S]*?\s+from\s+)?|require\s*\(\s*)['"]([^'"./][^'"]*)['"]/g;

    for (const file of files) {
      if (!CODE_EXTENSIONS.includes(file.extension)) continue;
      try {
        const source = readFileSync(file.absolutePath, 'utf-8');
        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(source)) !== null) {
          // 取包名（scoped 包含 @scope/name，非 scoped 取首段）
          let pkg = match[1];
          if (pkg.startsWith('@')) {
            pkg = pkg.split('/').slice(0, 2).join('/');
          } else {
            pkg = pkg.split('/')[0];
          }
          imported.add(pkg);
        }
      } catch {
        // skip unreadable files
      }
    }

    return imported;
  }

  private detectProjectType(files: ScannedFile[], techStack: string[]): ProjectType {
    // Check for monorepo indicators
    if (
      existsSync(join(this.rootDir, 'pnpm-workspace.yaml')) ||
      existsSync(join(this.rootDir, 'turbo.json'))
    ) {
      return 'monorepo';
    }

    // Score each project type
    let bestType: ProjectType = 'unknown';
    let bestScore = 0;

    for (const [type, indicators] of Object.entries(PROJECT_TYPE_INDICATORS)) {
      const score = indicators.filter((dep) => techStack.includes(dep)).length;
      if (score > bestScore) {
        bestScore = score;
        bestType = type as ProjectType;
      }
    }

    return bestType;
  }

  private detectSourceDirs(files: ScannedFile[]): string[] {
    const dirSet = new Set<string>();

    for (const file of files) {
      const parts = file.relativePath.split('/');
      if (parts.length > 1) {
        const topDir = parts[0];
        if (KNOWN_SOURCE_DIRS.includes(topDir)) {
          dirSet.add(topDir);
        }
      }
    }

    return Array.from(dirSet);
  }
}
