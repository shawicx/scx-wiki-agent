import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { EnvVarEvidence } from '../../core/types.js';

export interface EnvironmentInfo {
  packageName: string;
  version: string;
  runtime: string; // ESM / CJS
  nodeVersion: string;
  packageManager: string; // npm / pnpm / yarn
  scripts: Record<string, string>;
  envVars: EnvVarEvidence[];
}

export interface PackageJsonInfo {
  name?: string;
  version?: string;
  type?: string;
  scripts?: Record<string, string>;
  engines?: { node?: string };
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * 环境探测（package.json / .nvmrc / lockfile）。
 *
 * 包管理器判定是全项目单一来源：packageManager 字段 > bun.lock > pnpm-lock
 * > yarn.lock > npm，与 tech-stack 等页面共享，避免各页各自探测导致文档互相矛盾。
 */
export function detectEnvironment(
  rootDir: string,
  envVars: EnvVarEvidence[],
): EnvironmentInfo {
  let packageName = '';
  let version = '';
  let runtime = 'CJS';
  let scripts: Record<string, string> = {};

  const pkgPath = join(rootDir, 'package.json');
  let pkg: PackageJsonInfo | null = null;
  if (existsSync(pkgPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        pkg = parsed as PackageJsonInfo;
      }
    } catch { /* ignore malformed package.json */ }
  }
  // 非_node 仓库（无 package.json）：Python / Go / JVM 的运行时与包管理器
  // （单一来源原则：本函数仍是唯一判定点，tech-stack 等页面共享）
  if (!pkg) {
    const native = detectNativeRuntime(rootDir);
    if (native !== null) return { ...native, scripts: {}, envVars };
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
    const p = join(rootDir, f);
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
  } else if (existsSync(join(rootDir, 'bun.lock')) || existsSync(join(rootDir, 'bun.lockb'))) {
    packageManager = 'bun';
  } else if (existsSync(join(rootDir, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (existsSync(join(rootDir, 'yarn.lock'))) {
    packageManager = 'yarn';
  }

  return { packageName, version, runtime, nodeVersion, packageManager, scripts, envVars };
}

/** Python/Go/JVM 运行态探测（文件存在性 + 少量文本嗅探；无命中返回 null 走 node 默认） */
function detectNativeRuntime(rootDir: string): Omit<EnvironmentInfo, 'envVars' | 'scripts'> | null {
  const read = (p: string): string | null => {
    try { return readFileSync(join(rootDir, p), 'utf-8'); } catch { return null; }
  };
  const pyproject = read('pyproject.toml');
  if (pyproject !== null) {
    const pm = /\[tool\.poetry\]/.test(pyproject) ? 'poetry'
      : /\[tool\.uv\]/.test(pyproject) || /^requires.*\buv\b/m.test(pyproject) ? 'uv'
      : 'pip';
    const name = pyproject.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? '';
    const ver = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? '';
    return { packageName: name, version: ver, runtime: 'Python', nodeVersion: '', packageManager: pm };
  }
  if (existsSync(join(rootDir, 'requirements.txt'))) {
    return { packageName: '', version: '', runtime: 'Python', nodeVersion: '', packageManager: 'pip' };
  }
  const goMod = read('go.mod');
  if (goMod !== null) {
    const name = goMod.match(/^module\s+(\S+)/m)?.[1] ?? '';
    const ver = goMod.match(/^go\s+(\S+)/m)?.[1] ?? '';
    return { packageName: name, version: ver, runtime: 'Go', nodeVersion: '', packageManager: 'go modules' };
  }
  if (existsSync(join(rootDir, 'pom.xml'))) {
    return { packageName: '', version: '', runtime: 'JVM', nodeVersion: '', packageManager: 'maven' };
  }
  if (existsSync(join(rootDir, 'build.gradle')) || existsSync(join(rootDir, 'build.gradle.kts'))) {
    return { packageName: '', version: '', runtime: 'JVM', nodeVersion: '', packageManager: 'gradle' };
  }
  return null;
}
