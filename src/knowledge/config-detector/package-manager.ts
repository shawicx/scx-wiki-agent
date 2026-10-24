import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { EnvVarEvidence } from '../../core/types.js';
import { IGNORED_DIRS } from '../../shared/constants.js';

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

/** 单个目录的原生运行态探测结果（packageName/version 仅部分清单可提取） */
interface NativeManifestHit {
  runtime: string;
  packageManager: string;
  packageName: string;
  version: string;
}

/**
 * Python/Go/JVM/Swift 运行态探测（文件存在性 + 少量文本嗅探；无命中返回 null 走 node 默认）。
 * 根目录优先；根目录无清单时下探一层子目录（双端/多模块仓库：macos/Package.swift +
 * android/build.gradle.kts）。仅探一层：再深会命中 vendored SDK 与 fixture。
 * 多清单命中时合并口径（运行时/包管理器并列），不虚构单一归属。
 */
function probeNativeDir(dir: string): NativeManifestHit | null {
  const read = (p: string): string | null => {
    try { return readFileSync(join(dir, p), 'utf-8'); } catch { return null; }
  };
  const pyproject = read('pyproject.toml');
  if (pyproject !== null) {
    const pm = /\[tool\.poetry\]/.test(pyproject) ? 'poetry'
      : /\[tool\.uv\]/.test(pyproject) || /^requires.*\buv\b/m.test(pyproject) ? 'uv'
      : 'pip';
    const name = pyproject.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? '';
    const ver = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? '';
    return { packageName: name, version: ver, runtime: 'Python', packageManager: pm };
  }
  if (existsSync(join(dir, 'requirements.txt'))) {
    return { packageName: '', version: '', runtime: 'Python', packageManager: 'pip' };
  }
  const goMod = read('go.mod');
  if (goMod !== null) {
    const name = goMod.match(/^module\s+(\S+)/m)?.[1] ?? '';
    const ver = goMod.match(/^go\s+(\S+)/m)?.[1] ?? '';
    return { packageName: name, version: ver, runtime: 'Go', packageManager: 'go modules' };
  }
  if (existsSync(join(dir, 'pom.xml'))) {
    return { packageName: '', version: '', runtime: 'JVM', packageManager: 'maven' };
  }
  if (existsSync(join(dir, 'build.gradle')) || existsSync(join(dir, 'build.gradle.kts'))) {
    return { packageName: '', version: '', runtime: 'JVM', packageManager: 'gradle' };
  }
  // Swift：SPM 清单（name 实参 + swift-tools-version 头注释）优先，CocoaPods 兜底
  const packageSwift = read('Package.swift');
  if (packageSwift !== null) {
    const name = packageSwift.match(/\bPackage\s*\(\s*name\s*:\s*"([^"]+)"/)?.[1] ?? '';
    const ver = packageSwift.match(/^\/\/\s*swift-tools-version:\s*([^\s\n]+)/m)?.[1] ?? '';
    return { packageName: name, version: ver, runtime: 'Swift', packageManager: 'swift package manager' };
  }
  if (existsSync(join(dir, 'Podfile'))) {
    return { packageName: '', version: '', runtime: 'Swift', packageManager: 'cocoapods' };
  }
  return null;
}

/** 顶层子目录扫描（跳过隐藏目录与构建/依赖目录；按目录名排序保证确定性） */
function probeSubdirManifests(rootDir: string): Array<{ dir: string; hit: NativeManifestHit }> {
  let entries;
  try {
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const hits: Array<{ dir: string; hit: NativeManifestHit }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORED_DIRS.includes(entry.name)) continue;
    const hit = probeNativeDir(join(rootDir, entry.name));
    if (hit) hits.push({ dir: entry.name, hit });
  }
  return hits.sort((a, b) => a.dir.localeCompare(b.dir));
}

function detectNativeRuntime(rootDir: string): Omit<EnvironmentInfo, 'envVars' | 'scripts'> | null {
  const rootHit = probeNativeDir(rootDir);
  if (rootHit !== null) {
    return { packageName: rootHit.packageName, version: rootHit.version, runtime: rootHit.runtime, nodeVersion: '', packageManager: rootHit.packageManager };
  }
  const hits = probeSubdirManifests(rootDir);
  if (hits.length === 0) return null;
  if (hits.length === 1) {
    const { hit } = hits[0];
    return { packageName: hit.packageName, version: hit.version, runtime: hit.runtime, nodeVersion: '', packageManager: hit.packageManager };
  }
  // 多清单（双端仓库）：并列呈现，不虚构单一归属；版本/包名仅唯一时保留
  const runtimes = [...new Set(hits.map(h => h.hit.runtime))];
  const pms = [...new Set(hits.map(h => h.hit.packageManager))];
  const names = [...new Set(hits.map(h => h.hit.packageName).filter(n => n !== ''))];
  return {
    packageName: names.length === 1 ? names[0] : '',
    version: '',
    runtime: runtimes.join(' / '),
    nodeVersion: '',
    packageManager: pms.join(' + '),
  };
}
