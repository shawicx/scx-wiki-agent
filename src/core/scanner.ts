import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, extname, basename } from 'path';
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

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  scan(): ScanResult {
    const files = this.walkDirectory(this.rootDir);
    const techStack = this.detectTechStack();
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
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        if (this.shouldSkipDir(entry)) {
          continue;
        }
        results.push(...this.walkDirectory(fullPath));
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          const rel = relativePath(this.rootDir, fullPath);
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

  private detectTechStack(): string[] {
    const pkgPath = join(this.rootDir, 'package.json');
    if (!existsSync(pkgPath)) {
      return [];
    }

    try {
      const content = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const deps = Object.keys(pkg.dependencies ?? {});
      const devDeps = Object.keys(pkg.devDependencies ?? {});
      return [...deps, ...devDeps];
    } catch {
      return [];
    }
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
