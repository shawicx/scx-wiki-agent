import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative, basename, dirname } from 'path';

export interface EnvironmentInfo {
  packageName: string;
  version: string;
  runtime: string; // ESM / CJS
  nodeVersion: string;
  packageManager: string; // npm / pnpm / yarn
  scripts: Record<string, string>;
  envVars: Array<{ name: string; sensitive: boolean }>;
}

export interface ConventionsInfo {
  hasLinter: boolean;
  linterConfig: string | null;
  hasEditorConfig: boolean;
  editorConfig: string | null;
  agentsMd: string | null;
}

export interface TestingInfo {
  framework: string | null;
  configPath: string | null;
  testDirs: string[];
  fixturesDir: string | null;
  coverageThreshold: number | null;
}

export interface ConstraintsInfo {
  constants: Array<{ name: string; value: string; filePath: string }>;
}

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const KNOWN_SOURCE_DIRS = ['src', 'app', 'lib', 'packages', 'cmd', 'internal'];

export interface PackageJsonInfo {
  name?: string;
  version?: string;
  type?: string;
  scripts?: Record<string, string>;
  engines?: { node?: string };
  packageManager?: string;
}

/**
 * 检测式项目配置探测器。
 *
 * 设计：探测项目实际配置文件——有则提取，无则返回 detected=false / 空值。
 * 多语言/框架可扩展：不同项目（有/无 eslint、Node/Go/Python）都能优雅处理。
 *
 * 源码扫描（env 变量、限制常量）需要源文件列表。
 * 调用方可用 setSourceFiles() 预设（生产路径，复用 scanResult），
 * 否则在首次 detect* 时自动扫描常见源目录（测试路径）。
 */
export class ConfigDetector {
  private sourceFiles: string[] | null = null;

  constructor(private rootDir: string) {}

  /** 预设源文件绝对路径列表（供 env/常量探测复用，避免重复扫描） */
  setSourceFiles(files: string[]): void {
    this.sourceFiles = files;
  }

  /** 懒加载源文件列表：未预设则扫描 KNOWN_SOURCE_DIRS 下的代码文件 */
  private getSourceFiles(): string[] {
    if (this.sourceFiles) return this.sourceFiles;
    const files: string[] = [];
    for (const dir of KNOWN_SOURCE_DIRS) {
      const absDir = join(this.rootDir, dir);
      if (existsSync(absDir)) {
        this.walkCodeFiles(absDir, files);
      }
    }
    this.sourceFiles = files;
    return files;
  }

  private walkCodeFiles(dir: string, acc: string[]): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        this.walkCodeFiles(full, acc);
      } else if (CODE_EXTS.includes(extname(entry))) {
        acc.push(full);
      }
    }
  }

  detectEnvironment(): EnvironmentInfo {
    let packageName = '';
    let version = '';
    let runtime = 'CJS';
    let scripts: Record<string, string> = {};

    const pkgPath = join(this.rootDir, 'package.json');
    let pkg: PackageJsonInfo | null = null;
    if (existsSync(pkgPath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          pkg = parsed as PackageJsonInfo;
        }
      } catch { /* ignore malformed package.json */ }
    }
    if (pkg) {
      packageName = pkg.name ?? '';
      version = pkg.version ?? '';
      runtime = pkg.type === 'module' ? 'ESM' : 'CJS';
      scripts = pkg.scripts ?? {};
    }

    // Node 版本：优先 .nvmrc / .node-version，回退 package.json#engines.node
    let nodeVersion = '';
    for (const f of ['.nvmrc', '.node-version']) {
      const p = join(this.rootDir, f);
      if (existsSync(p)) {
        nodeVersion = readFileSync(p, 'utf-8').trim();
        break;
      }
    }
    if (!nodeVersion && pkg?.engines?.node) {
      nodeVersion = pkg.engines.node;
    }

    // 包管理器：优先 package.json#packageManager，回退 lockfile（全项目唯一判定点，
    // 与 tech-stack 等页面共享，避免各页各自探测导致文档互相矛盾）
    let packageManager = 'npm';
    if (pkg?.packageManager) {
      packageManager = pkg.packageManager.split('@')[0];
    } else if (existsSync(join(this.rootDir, 'bun.lock')) || existsSync(join(this.rootDir, 'bun.lockb'))) {
      packageManager = 'bun';
    } else if (existsSync(join(this.rootDir, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm';
    } else if (existsSync(join(this.rootDir, 'yarn.lock'))) {
      packageManager = 'yarn';
    }

    const envVars = this.extractEnvVars();

    return { packageName, version, runtime, nodeVersion, packageManager, scripts, envVars };
  }

  detectConventions(): ConventionsInfo {
    let hasLinter = false;
    let linterConfig: string | null = null;
    for (const f of [
      'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts', 'eslint.config.cjs',
      '.eslintrc.js', '.eslintrc.json', '.eslintrc.cjs', 'biome.json', '.oxlintrc.json',
    ]) {
      const p = join(this.rootDir, f);
      if (existsSync(p)) {
        hasLinter = true;
        linterConfig = f;
        break;
      }
    }

    // 配置文件未识别时，从 scripts.lint 反推（oxlint/deno 等新工具常无独立配置文件）
    if (!hasLinter) {
      const lintScript = this.readPackageJsonLoose()?.scripts?.lint ?? '';
      const m = lintScript.match(/\b(oxlint|eslint|biome|ruff|deno(?:\s+lint)?)\b/);
      if (m) {
        hasLinter = true;
        linterConfig = `scripts.lint: ${m[1].trim()}`;
      }
    }

    const editorConfigPath = join(this.rootDir, '.editorconfig');
    const hasEditorConfig = existsSync(editorConfigPath);
    const editorConfig = hasEditorConfig ? readFileSync(editorConfigPath, 'utf-8') : null;

    const agentsPath = join(this.rootDir, 'AGENTS.md');
    const agentsMd = existsSync(agentsPath) ? readFileSync(agentsPath, 'utf-8') : null;

    return { hasLinter, linterConfig, hasEditorConfig, editorConfig, agentsMd };
  }

  /** 读取 package.json（容错），供依赖/脚本反推 */
  private readPackageJsonLoose(): {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  } | null {
    try {
      const p = join(this.rootDir, 'package.json');
      if (!existsSync(p)) return null;
      const parsed = JSON.parse(readFileSync(p, 'utf-8'));
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch {
      return null;
    }
  }

  detectTesting(): TestingInfo {
    let framework: string | null = null;
    let configPath: string | null = null;

    const configs: Array<[string, string]> = [
      ['vitest.config.ts', 'vitest'],
      ['vitest.config.js', 'vitest'],
      ['vitest.config.mjs', 'vitest'],
      ['jest.config.ts', 'jest'],
      ['jest.config.js', 'jest'],
    ];
    for (const [file, fw] of configs) {
      if (existsSync(join(this.rootDir, file))) {
        framework = fw;
        configPath = file;
        break;
      }
    }

    // 配置文件未识别时，从 package.json 依赖与 scripts.test 反推框架
    // （project-wiki 调查清单：构建与依赖以 package.json 为准；依赖声明+脚本调用即 R3 证据）
    if (framework === null) {
      const pkg = this.readPackageJsonLoose();
      if (pkg) {
        const deps: Record<string, string> = {
          ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}),
        };
        const testScript = pkg.scripts?.test ?? '';
        const candidates: Array<[string, string]> = [
          ['vitest', 'vitest'],
          ['jest', 'jest'],
          ['mocha', 'mocha'],
          ['@playwright/test', '@playwright/test'],
          ['ava', 'ava'],
        ];
        for (const [dep, name] of candidates) {
          if (deps[dep] || testScript.includes(name)) {
            framework = name;
            break;
          }
        }
      }
    }

    // 测试目录探测：根级约定目录 + 从源文件清单反推（*.test.* / *.spec.* 所在目录）。
    // 现代项目常把测试与源码同置（src/stores/foo.test.ts），只查根级会漏报。
    const testDirs = new Set<string>();
    for (const d of ['tests', 'test', '__tests__', 'spec']) {
      if (existsSync(join(this.rootDir, d))) testDirs.add(d);
    }
    for (const abs of this.getSourceFiles()) {
      const base = basename(abs);
      if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(base)) {
        const dir = relative(this.rootDir, dirname(abs)).replace(/\\/g, '/');
        if (dir && dir !== '.') testDirs.add(dir);
      }
    }

    // 夹具目录：tests/fixtures | test/fixtures | tests/data
    let fixturesDir: string | null = null;
    for (const d of testDirs) {
      const fix = join(this.rootDir, d, 'fixtures');
      if (existsSync(fix)) { fixturesDir = `${d}/fixtures`; break; }
      const data = join(this.rootDir, d, 'data');
      if (existsSync(data)) { fixturesDir = `${d}/data`; break; }
    }

    return { framework, configPath, testDirs: [...testDirs].sort(), fixturesDir, coverageThreshold: null };
  }

  detectConstraints(): ConstraintsInfo {
    const constants: ConstraintsInfo['constants'] = [];
    const constRegex = /(?:const|export\s+const)\s+([A-Z_]*(?:MAX|MIN|LIMIT|TIMEOUT|DEPTH|SIZE|COUNT|THRESHOLD)[A-Z_]*)\s*=\s*([^;\n]+)/g;

    for (const file of this.getSourceFiles()) {
      try {
        const source = readFileSync(file, 'utf-8');
        for (const line of source.split('\n')) {
          if (isCommentLine(line)) continue;
          let match: RegExpExecArray | null;
          constRegex.lastIndex = 0;
          while ((match = constRegex.exec(line)) !== null) {
            constants.push({
              name: match[1],
              value: match[2].trim(),
              filePath: relative(this.rootDir, file),
            });
          }
        }
      } catch { /* skip unreadable */ }
    }

    return { constants };
  }

  /** 从源码提取 process.env.XXX 引用（跳过注释行） */
  private extractEnvVars(): Array<{ name: string; sensitive: boolean }> {
    const envSet = new Set<string>();
    const envRegex = /process\.env\.([A-Z_][A-Z0-9_]*)/g;

    for (const file of this.getSourceFiles()) {
      try {
        const source = readFileSync(file, 'utf-8');
        for (const line of source.split('\n')) {
          if (isCommentLine(line)) continue;
          let match: RegExpExecArray | null;
          envRegex.lastIndex = 0;
          while ((match = envRegex.exec(line)) !== null) {
            envSet.add(match[1]);
          }
        }
      } catch { /* skip unreadable */ }
    }

    return Array.from(envSet).map(name => ({
      name,
      sensitive: /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(name),
    }));
  }
}

/**
 * 判断一行是否为注释/文档行（避免从注释里误提取符号）。
 * 覆盖：JS/TS 单行注释（//）、JSDoc（*）、Shell/YAML（#）、块注释（/*）。
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('*')) return true;
  if (trimmed.startsWith('/*')) return true;
  if (trimmed.startsWith('#')) return true;
  return false;
}
