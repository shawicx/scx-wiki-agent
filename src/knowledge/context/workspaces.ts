/**
 * workspaces / package-boundaries 页 context（monorepo）：workspace 包清单 +
 * 包间 import 依赖边 + 未声明依赖违规。确定性提取（package.json / workspace 配置
 * / 相对 import 解析），0 包 → null（页面跳过）。
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import type { WorkspacesContext, PackageBoundariesContext } from '../types.js';
import type { ContextDeps } from './shared.js';
import { readSourceCached } from './shared.js';

const IMPORT_FILE_CAP = 600;

interface PkgInfo {
  name: string;
  version: string;
  dir: string; // 仓库相对目录（posix）
  isPrivate: boolean;
  deps: Set<string>;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** workspace 声明来源探测（返回 null = 非 monorepo） */
function workspaceSource(rootDir: string): string | null {
  if (existsSync(join(rootDir, 'pnpm-workspace.yaml'))) return 'pnpm-workspace.yaml';
  if (existsSync(join(rootDir, 'turbo.json'))) return 'turbo.json';
  const pkg = readJson(join(rootDir, 'package.json'));
  if (pkg && Array.isArray(pkg.workspaces)) return 'package.json#workspaces';
  if (existsSync(join(rootDir, 'lerna.json'))) return 'lerna.json';
  return null;
}

/** 递归找 package.json（深度 ≤3，跳过 node_modules/.wiki/dist） */
function findPackageDirs(rootDir: string): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', '.wiki', 'dist', '.git', '.scx-wiki-agent']);
  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
    }
    if (existsSync(join(dir, 'package.json'))) out.push(dir);
  };
  walk(rootDir, 0);
  return out;
}

function loadPackages(rootDir: string): PkgInfo[] {
  const dirs = findPackageDirs(rootDir);
  const packages: PkgInfo[] = [];
  for (const dir of dirs) {
    // workspace 根包是宿主不是成员：只有存在子包时排除自身
    if (dir === rootDir && dirs.length > 1) continue;
    const pkg = readJson(join(dir, 'package.json'));
    if (!pkg || typeof pkg.name !== 'string') continue;
    const deps = new Set<string>([
      ...Object.keys((pkg.dependencies as Record<string, string>) ?? {}),
      ...Object.keys((pkg.devDependencies as Record<string, string>) ?? {}),
    ]);
    packages.push({
      name: pkg.name,
      version: typeof pkg.version === 'string' ? pkg.version : '',
      dir: relative(rootDir, dir).replace(/\\/g, '/') || '.',
      isPrivate: pkg.private === true,
      deps,
    });
  }
  return packages;
}

const RE_IMPORT = /(?:import\s+(?:[^\n'";]*?\s+from\s+)?|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/** 相对 import 跨包解析：file + specifier → 目标包（同包返回 null；尽力解析） */
function resolveCrossPackage(fromRel: string, spec: string, pkgDirs: Array<{ dir: string; pkg: PkgInfo }>): PkgInfo | null {
  if (!spec.startsWith('.')) {
    // 裸说明符直接按包名匹配（workspace 协议 pnpm: 也可命中）
    const name = spec.replace(/^(?:workspace:|npm:)/, '').split(/@(?=[^/]+$)/)[0] || spec;
    return pkgDirs.find(p => p.pkg.name === name)?.pkg ?? null;
  }
  const fromDir = dirname(fromRel);
  const joined = `${fromDir}/${spec}`.replace(/\/\.\//g, '/').replace(/\/[^/]+\/\.\.\//g, '/');
  const resolved = joined.replace(/\/$/, '');
  // 目标目录前缀命中其他包目录（段精确：resolved 以 `pkgDir/` 开头或相等）
  const hit = pkgDirs.find(p => p.dir !== '.' && (resolved === p.dir || resolved.startsWith(`${p.dir}/`)));
  const fromPkg = pkgDirs.find(p => fromRel === p.dir || fromRel.startsWith(`${p.dir}/`));
  if (!hit || !fromPkg || hit.pkg.name === fromPkg.pkg.name) return null;
  return hit.pkg;
}

/** 包间依赖边聚合（from → to: import 计数 + 是否声明） */
function buildEdges(deps: ContextDeps, packages: PkgInfo[]): WorkspacesContext['edges'] {
  const pkgDirs = packages.map(p => ({ dir: p.dir, pkg: p }));
  const byName = new Map(packages.map(p => [p.name, p]));
  const edgeMap = new Map<string, { from: string; to: string; importCount: number; declared: boolean }>();
  let scanned = 0;
  for (const f of deps.scanResult.productionFiles) {
    if (scanned >= IMPORT_FILE_CAP) break;
    if (!/\.(?:ts|tsx|js|jsx|vue|mjs|cjs)$/.test(f.relativePath)) continue;
    const fromPkg = pkgDirs.find(p => f.relativePath === p.dir || f.relativePath.startsWith(`${p.dir}/`))?.pkg;
    if (!fromPkg) continue;
    const src = readSourceCached(deps, f.relativePath);
    if (src === null) continue;
    scanned++;
    for (const m of src.matchAll(RE_IMPORT)) {
      const target = resolveCrossPackage(f.relativePath, m[1], pkgDirs);
      if (!target || target.name === fromPkg.name) continue;
      const key = `${fromPkg.name}→${target.name}`;
      const edge = edgeMap.get(key) ?? {
        from: fromPkg.name, to: target.name, importCount: 0, declared: fromPkg.deps.has(target.name),
      };
      edge.importCount++;
      edgeMap.set(key, edge);
      void byName;
    }
  }
  return [...edgeMap.values()].sort((a, b) => b.importCount - a.importCount);
}

function sharedPrep(deps: ContextDeps): { source: string; packages: PkgInfo[]; edges: WorkspacesContext['edges'] } | null {
  const source = workspaceSource(deps.scanResult.rootDir);
  if (source === null) return null;
  const packages = loadPackages(deps.scanResult.rootDir);
  if (packages.length === 0) return null;
  return { source, packages, edges: buildEdges(deps, packages) };
}

export function buildWorkspacesContext(deps: ContextDeps): WorkspacesContext | null {
  const prep = sharedPrep(deps);
  if (prep === null) return null;
  return {
    source: prep.source,
    packages: prep.packages.map(p => ({ name: p.name, version: p.version, dir: p.dir, isPrivate: p.isPrivate })),
    edges: prep.edges,
  };
}

export function buildPackageBoundariesContext(deps: ContextDeps): PackageBoundariesContext | null {
  const prep = sharedPrep(deps);
  if (prep === null) return null;
  const violations = prep.edges
    .filter(e => !e.declared)
    .slice(0, 30)
    .map(e => ({ from: e.from, to: e.to, importFiles: [] }));
  return {
    edges: prep.edges,
    packages: prep.packages.map(p => ({ name: p.name, dir: p.dir })),
    violations,
  };
}
