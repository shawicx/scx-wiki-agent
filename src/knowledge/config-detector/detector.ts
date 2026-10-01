import { existsSync, readFileSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { importedPackageName, languageDomainOf } from '../../shared/utils.js';
import { isNativeDomain, NATIVE_CONST_DEF_RE } from '../../shared/language-patterns.js';
import type { ConstantEvidence, EnvVarEvidence } from '../../core/types.js';
import { detectEnvironment as detectEnvironmentImpl } from './package-manager.js';
import { extractEnvPurposes } from './env-purpose.js';
import type { EnvironmentInfo } from './package-manager.js';
import { classifyFiles, scanAndClassifyFiles } from './source-classification.js';

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
  productionFileCount: number;
  testFileCount: number;
  testOnlyEnvVars: EnvVarEvidence[];
  testOnlyConstants: ConstantEvidence[];
  testOnlyDeps: Array<{ name: string; version: string; importFiles: string[] }>;
}

export interface ConstraintsInfo {
  constants: ConstantEvidence[];
}

/**
 * 检测式项目配置探测器。
 *
 * 设计：探测项目实际配置文件——有则提取，无则返回 detected=false / 空值。
 * 多语言/框架可扩展：不同项目（有/无 eslint、Node/Go/Python）都能优雅处理。
 *
 * 源码扫描（env 变量、限制常量）需要生产/测试文件分类。
 * 生产构建用 setSourceClassification() 注入 FileScanner 的分类结果；
 * setSourceFiles() 保留为兼容入口并按 isTestPath 拆分。
 */
export class ConfigDetector {
  private sourceClassification: { production: string[]; test: string[] } | null = null;

  constructor(private rootDir: string) {}

  /** 兼容入口：预设全量源文件，内部仍按生产/测试口径拆分 */
  setSourceFiles(files: string[]): void {
    this.sourceClassification = classifyFiles(this.rootDir, files);
  }

  /** 生产构建路径使用的显式分类入口（与 FileScanner 的 scope 同口径） */
  setSourceClassification(input: { production: string[]; test: string[] }): void {
    this.sourceClassification = input;
  }

  /** 懒加载源文件分类：未预设则自动扫描常见生产/测试目录 */
  private ensureSourceClassification(): { production: string[]; test: string[] } {
    if (this.sourceClassification) return this.sourceClassification;
    this.sourceClassification = scanAndClassifyFiles(this.rootDir);
    return this.sourceClassification;
  }

  private getSourceFiles(scope: 'production' | 'test' | 'all' = 'all'): string[] {
    const classified = this.ensureSourceClassification();
    if (scope === 'production') return classified.production;
    if (scope === 'test') return classified.test;
    return [...classified.production, ...classified.test];
  }

  detectEnvironment(): EnvironmentInfo {
    // env 用途确定性提取（注释/缺省值/.env.example）：见 env-purpose.ts
    const envVars = extractEnvPurposes(
      this.rootDir,
      this.getSourceFiles('all'),
      this.extractEnvVars(this.getSourceFiles('production')),
    );
    return detectEnvironmentImpl(this.rootDir, envVars);
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

    const productionFiles = this.getSourceFiles('production');
    const testFiles = this.getSourceFiles('test');
    const productionEnvNames = new Set(this.extractEnvVars(productionFiles).map(v => v.name));
    const productionConstantNames = new Set(this.extractConstants(productionFiles).map(c => c.name));

    return {
      framework,
      configPath,
      testDirs: [...testDirs].sort(),
      fixturesDir,
      coverageThreshold: null,
      productionFileCount: productionFiles.length,
      testFileCount: testFiles.length,
      testOnlyEnvVars: this.extractEnvVars(testFiles)
        .filter(v => !productionEnvNames.has(v.name)),
      testOnlyConstants: this.extractConstants(testFiles)
        .filter(c => !productionConstantNames.has(c.name)),
      testOnlyDeps: this.detectTestOnlyDeps(productionFiles, testFiles),
    };
  }

  detectConstraints(): ConstraintsInfo {
    return { constants: this.extractConstants(this.getSourceFiles('production')) };
  }

  /** 从指定源码提取 process.env.XXX 引用（跳过注释行） */
  private extractEnvVars(files: string[]): EnvVarEvidence[] {
    const byName = new Map<string, Set<string>>();
    // 多语言 env 引用：process.env.X / os.environ['X'] / os.getenv('X') / os.Getenv("X") / System.getenv("X")
    const envRegex = /process\.env\.([A-Z_][A-Z0-9_]*)|os\.environ\[?['"]([A-Z_][A-Z0-9_]*)['"]|os\.getenv\(\s*['"]([A-Z_][A-Z0-9_]*)['"]|os\.Getenv\(\s*"([A-Z_][A-Z0-9_]*)"|System\.getenv\(\s*"([A-Z_][A-Z0-9_]*)"/g;

    for (const file of files) {
      try {
        const source = readFileSync(file, 'utf-8');
        const rel = relative(this.rootDir, file).replace(/\\/g, '/');
        for (const line of source.split('\n')) {
          if (isCommentLine(line)) continue;
          let match: RegExpExecArray | null;
          envRegex.lastIndex = 0;
          while ((match = envRegex.exec(line)) !== null) {
            const name = match.slice(1).find(g => g !== undefined);
            if (!name) continue;
            const paths = byName.get(name) ?? new Set<string>();
            paths.add(rel);
            byName.set(name, paths);
          }
        }
      } catch { /* skip unreadable */ }
    }

    return [...byName.entries()].map(([name, paths]) => ({
      name,
      sensitive: /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL/i.test(name),
      filePaths: [...paths].sort(),
    }));
  }

  private extractConstants(files: string[]): ConstantEvidence[] {
    const constants: ConstantEvidence[] = [];
    const constRegex = /(?:const|export\s+const)\s+([A-Z_]*(?:MAX|MIN|LIMIT|TIMEOUT|DEPTH|SIZE|COUNT|THRESHOLD)[A-Z_]*)\s*=\s*([^;\n]+)/g;

    for (const file of files) {
      try {
        const source = readFileSync(file, 'utf-8');
        const lines = source.split('\n');
        const domain = languageDomainOf(relative(this.rootDir, file).replace(/\\/g, '/'));
        for (let i = 0; i < lines.length; i++) {
          if (isCommentLine(lines[i])) continue;
          if (domain !== null && isNativeDomain(domain)) {
            const m = lines[i].match(NATIVE_CONST_DEF_RE[domain]);
            if (m) {
              constants.push({
                name: m[1], value: m[2].trim(),
                filePath: relative(this.rootDir, file).replace(/\\/g, '/'), line: i + 1,
              });
            }
            continue;
          }
          constRegex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = constRegex.exec(lines[i])) !== null) {
            constants.push({
              name: match[1],
              value: match[2].trim(),
              filePath: relative(this.rootDir, file).replace(/\\/g, '/'),
              line: i + 1,
            });
          }
        }
      } catch { /* skip unreadable */ }
    }
    return constants;
  }

  private detectTestOnlyDeps(
    productionFiles: string[],
    testFiles: string[],
  ): Array<{ name: string; version: string; importFiles: string[] }> {
    const pkg = this.readPackageJsonLoose();
    if (!pkg) return [];
    const productionImports = this.collectImportMap(productionFiles);
    const testImports = this.collectImportMap(testFiles);

    const declared: Array<{ name: string; version: string }> = [
      ...Object.entries(pkg.dependencies ?? {}).map(([name, version]) => ({ name, version })),
      ...Object.entries(pkg.devDependencies ?? {}).map(([name, version]) => ({ name, version })),
    ];
    const nonTestScripts = Object.entries(pkg.scripts ?? {})
      .filter(([scriptName]) => scriptName !== 'test' && !scriptName.startsWith('test:'))
      .map(([, command]) => command);
    return declared
      .filter(({ name }) =>
        !productionImports.has(name)
        && testImports.has(name)
        && !nonTestScripts.some(cmd => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(cmd)))
      .map(({ name, version }) => ({
        name,
        version,
        importFiles: testImports.get(name) ?? [],
      }));
  }

  private collectImportMap(files: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const importRegex = /(?:import\s+(?:[^\n'";]*?\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
    for (const file of files) {
      try {
        const source = readFileSync(file, 'utf-8');
        const rel = relative(this.rootDir, file).replace(/\\/g, '/');
        let match: RegExpExecArray | null;
        while ((match = importRegex.exec(source)) !== null) {
          const pkgName = importedPackageName(match[1]);
          if (!pkgName) continue;
          const paths = map.get(pkgName) ?? [];
          if (!paths.includes(rel)) paths.push(rel);
          map.set(pkgName, paths);
        }
      } catch { /* skip unreadable */ }
    }
    return map;
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
