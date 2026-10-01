import { readdirSync, statSync, existsSync, readFileSync } from 'fs';
import { join, extname, basename, relative } from 'path';
import ignore from 'ignore';
import { IGNORED_DIRS, SUPPORTED_EXTENSIONS, CODE_EXTENSIONS } from '../shared/constants.js';
import { getFileLanguage, relativePath, importedPackageName, isTestPath } from '../shared/utils.js';
import type { Language, SourceScope } from './types.js';

export type ProjectType = 'backend' | 'frontend' | 'cli' | 'desktop' | 'agent' | 'monorepo' | 'library' | 'unknown';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  language: Language;
  extension: string;
  size: number;
  scope: SourceScope;
}

export interface ScanResult {
  rootDir: string;
  files: ScannedFile[];
  techStack: string[];
  /** 仅测试 / fixture 文件 import 的依赖（不进入主技术栈叙事） */
  testTechStack: string[];
  projectType: ProjectType;
  hasTypeScript: boolean;
  sourceDirs: string[];
  productionFiles: ScannedFile[];
  testFiles: ScannedFile[];
  fileCounts: { total: number; production: number; test: number };
}

const KNOWN_SOURCE_DIRS = ['src', 'src-tauri', 'app', 'lib', 'packages', 'cmd', 'internal'];

const PROJECT_TYPE_INDICATORS: Record<string, string[]> = {
  backend: ['express', '@nestjs/core', 'fastify', '@fastify',
            // 非_node 生态（import 即证据，无需 package.json 声明）
            'flask', 'fastapi-py', 'django', 'gin', 'echo-go', 'fiber-go', 'spring-boot'],
  frontend: ['react', 'react-dom', 'vue', 'next', 'nuxt', '@sveltejs'],
  agent: ['langgraph', '@langchain/core', 'mastra'],
  cli: ['commander', 'yargs', 'cobra'],
  desktop: ['@tauri-apps/api'],
};

/** 原生 import → 技术栈规范名（无 package.json 的 Python/Go/JVM 仓库：import 即证据） */
const NATIVE_IMPORT_MAP: Record<string, string> = {
  flask: 'flask', fastapi: 'fastapi-py', django: 'django', uvicorn: 'fastapi-py',
  sqlalchemy: 'sqlalchemy', celery: 'celery', requests: 'requests',
  'gin-gonic/gin': 'gin', 'labstack/echo': 'echo-go', 'gofiber/fiber': 'fiber-go',
  'spf13/cobra': 'cobra',
};

/** Python/Go 源文件 import 提取 → 规范技术栈名（去重排序；上限控成本） */
function detectNativeImports(files: ScannedFile[]): string[] {
  const found = new Set<string>();
  const pyImport = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.,\s]+))/;
  const goImport = /"((?:github\.com|gitlab\.com|golang\.org)\/[^"]+)"/;
  for (const f of files.slice(0, 800)) {
    if (f.extension !== '.py' && f.extension !== '.go') continue;
    let src: string;
    try {
      src = readFileSync(f.absolutePath, 'utf-8');
    } catch { continue; }
    for (const line of src.split('\n')) {
      const py = line.match(pyImport);
      if (py) {
        const root = (py[1] ?? py[2] ?? '').split('.')[0].split(',')[0].trim();
        if (NATIVE_IMPORT_MAP[root]) found.add(NATIVE_IMPORT_MAP[root]);
      }
      const go = line.match(goImport);
      if (go) {
        const parts = go[1].split('/');
        for (let take = 2; take <= parts.length; take++) {
          const key = parts.slice(-take).join('/');
          if (NATIVE_IMPORT_MAP[key]) { found.add(NATIVE_IMPORT_MAP[key]); break; }
        }
      }
    }
  }
  return [...found].sort();
}

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
    const productionFiles = files.filter(f => f.scope === 'production');
    const testFiles = files.filter(f => f.scope === 'test');
    const { techStack, testTechStack } = this.detectTechStack(productionFiles, testFiles);
    // 非_node 仓库（无 package.json）：import 即技术栈证据，注入同一指标体系
    const nativeStack = detectNativeImports(productionFiles);
    const nativeTestStack = detectNativeImports(testFiles);
    const mergedStack = [...new Set([...techStack, ...nativeStack])];
    const mergedTest = nativeTestStack.filter(t => !nativeStack.includes(t))
      .concat(testTechStack);
    const projectType = this.detectProjectType(mergedStack);
    const hasTypeScript = productionFiles.some((f) => f.extension === '.ts' || f.extension === '.tsx');
    const sourceDirs = this.detectSourceDirs(productionFiles);

    return {
      rootDir: this.rootDir,
      files,
      techStack: mergedStack,
      testTechStack: mergedTest,
      projectType,
      hasTypeScript,
      sourceDirs,
      productionFiles,
      testFiles,
      fileCounts: {
        total: files.length,
        production: productionFiles.length,
        test: testFiles.length,
      },
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
          const scope: SourceScope = isTestPath(rel) ? 'test' : 'production';
          results.push({
            absolutePath: fullPath,
            relativePath: rel,
            language: getFileLanguage(fullPath),
            extension: ext,
            size: stat.size,
            scope,
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

  private detectTechStack(productionFiles: ScannedFile[], testFiles: ScannedFile[]): { techStack: string[]; testTechStack: string[] } {
    const pkgPath = join(this.rootDir, 'package.json');
    if (!existsSync(pkgPath)) {
      return { techStack: [], testTechStack: [] };
    }

    try {
      const content = readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      const allDeps = new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ]);

      const productionImports = this.collectImportedPackages(productionFiles);
      const testImports = this.collectImportedPackages(testFiles);
      const hasProductionCode = productionFiles.some(file => CODE_EXTENSIONS.includes(file.extension));
      const productionTechStack = productionImports.size === 0 && !hasProductionCode
        ? [...allDeps]
        : [...allDeps].filter(dep => productionImports.has(dep));
      const testTechStack = [...allDeps].filter(dep =>
        testImports.has(dep) && !productionImports.has(dep));

      return { techStack: productionTechStack, testTechStack };
    } catch {
      return { techStack: [], testTechStack: [] };
    }
  }

  /**
   * 扫描源文件，提取所有 import 语句引用的包名。
   * 只保留被实际 import 的依赖，过滤死依赖（声明了但从未使用）。
   * 覆盖 ES import / require / 动态 import，以及 CSS `@import "pkg"`
   * （tailwind 插件类依赖的常见引入方式，如 tw-animate-css）。
   */
  private collectImportedPackages(files: ScannedFile[]): Set<string> {
    const imported = new Set<string>();
    // 匹配 ES import: import ... from 'pkg'; import 'pkg'; 动态 import('pkg'); require('pkg')
    // from 前缀限定单行且不越过引号，防止副作用导入（import 'pkg'）被后续行的 from 吞掉
    const importRegex = /(?:import\s+(?:[^\n'";]*?\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
    // 匹配 CSS @import: @import "pkg"; @import 'pkg';
    const cssImportRegex = /@import\s+(?:url\(\s*)?['"]([^'"./][^'"]*)['"]/g;

    for (const file of files) {
      if (!CODE_EXTENSIONS.includes(file.extension)) continue;
      try {
        const source = readFileSync(file.absolutePath, 'utf-8');
        const regex = file.extension === '.css' ? cssImportRegex : importRegex;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(source)) !== null) {
          const pkg = importedPackageName(match[1]);
          if (pkg) imported.add(pkg);
        }
      } catch {
        // skip unreadable files
      }
    }

    return imported;
  }

  private detectProjectType(techStack: string[]): ProjectType {
    // Check for monorepo indicators
    // pnpm-workspace.yaml 需真实声明 packages 才算 workspace：
    // 仅含 allowBuilds 等审批配置的文件（CI/安全用途）不代表 monorepo
    if (
      this.workspaceHasPackages('pnpm-workspace.yaml') ||
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

    // 库项目兜底/显式判定：无框架指标命中时，package.json 的发布形态
    // （exports 字段显式声明，或 main+types 且无 bin）→ library。
    // 此前 library 无任何探测路径，TIER2_BY_TYPE['library'] 是死配置。
    if (bestScore === 0 && this.looksLikeLibrary()) {
      return 'library';
    }

    return bestType;
  }

  /** package.json 发布形态判定：exports 字段（显式）或 main+types 无 bin（隐式） */
  private looksLikeLibrary(): boolean {
    try {
      const pkg: { exports?: unknown; main?: unknown; types?: unknown; bin?: unknown } =
        JSON.parse(readFileSync(join(this.rootDir, 'package.json'), 'utf-8'));
      if (pkg.bin) return false;
      if (pkg.exports !== undefined) return true;
      return typeof pkg.main === 'string' && typeof pkg.types === 'string';
    } catch {
      return false;
    }
  }

  /** pnpm-workspace.yaml 是否声明了 packages（无该字段的审批型配置不算 workspace） */
  private workspaceHasPackages(relPath: string): boolean {
    try {
      const content = readFileSync(join(this.rootDir, relPath), 'utf-8');
      return /^\s*packages\s*:/m.test(content);
    } catch {
      return false;
    }
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
