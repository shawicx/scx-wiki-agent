import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TechStackContext } from '../types.js';
import { type ContextDeps, collectImportFiles } from './shared.js';

/**
 * tech-stack.md 数据源：严格区分已用/未用依赖（R3 拒绝编造用途）。
 * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。
 * 复用 scanner 的死依赖过滤逻辑，并追踪每个依赖的 import 位置。
 */
export function buildTechStackContext(ctxDeps: ContextDeps): TechStackContext {
  const pkgPath = join(ctxDeps.scanResult.rootDir, 'package.json');
  let pkg: any = {};
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch { /* ignore */ }

  const deps: Record<string, string> = pkg.dependencies ?? {};
  const devDeps: Record<string, string> = pkg.devDependencies ?? {};
  const allDeclared = new Set([...Object.keys(deps), ...Object.keys(devDeps)]);
  const prodImports = collectImportFiles(ctxDeps, allDeclared, 'prod');
  const testImports = collectImportFiles(ctxDeps, allDeclared, 'test');
  let scripts: Record<string, string> = {};
  try {
    scripts = ctxDeps.detector.detectEnvironment().scripts;
  } catch {
    scripts = {};
  }

  const escaped = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const usageKind = (name: string): 'import' | 'test' | 'script' | 'none' => {
    if ((prodImports.get(name) ?? []).length > 0) return 'import';
    if ((testImports.get(name) ?? []).length > 0) return 'test';
    const scriptHit = Object.values(scripts).some(cmd =>
      new RegExp(`\\b${escaped(name)}\\b`).test(cmd));
    return scriptHit ? 'script' : 'none';
  };
  const toUsage = (name: string, version: string, kind: 'import' | 'test' | 'script') => ({
    name,
    version,
    importFiles: kind === 'test'
      ? (testImports.get(name) ?? []).slice(0, 5)
      : (prodImports.get(name) ?? []).slice(0, 5),
    usageKind: kind,
  });

  const coreDeps = Object.entries(deps)
    .filter(([name]) => usageKind(name) === 'import')
    .map(([name, version]) => toUsage(name, version, 'import'));

  const devDepsUsed = Object.entries(devDeps)
    .filter(([name]) => ['import', 'script'].includes(usageKind(name)))
    .map(([name, version]) => toUsage(name, version, usageKind(name) as 'import' | 'script'));

  const testDeps = [...allDeclared]
    .filter(name => usageKind(name) === 'test')
    .map(name => toUsage(name, deps[name] ?? devDeps[name] ?? '', 'test'));

  const unusedDeps = [...allDeclared]
    .filter(name => usageKind(name) === 'none')
    .map(name => ({ name, version: deps[name] ?? devDeps[name] ?? '' }));

  // 依赖引入动机：提交主题中点名依赖的记录（选型理由的 git 佐证）
  const depNames = [...new Set([...coreDeps, ...devDepsUsed, ...testDeps].map(d => d.name))];
  const intent = ctxDeps.intentProvider?.depCommitEvidence(depNames);

  return {
    coreDeps,
    devDeps: devDepsUsed,
    testDeps,
    unusedDeps,
    runtime: pkg.type === 'module' ? 'ESM' : 'CJS',
    buildTool: detectBuildTool(devDeps),
    packageManager: ctxDeps.detector.detectEnvironment().packageManager,
    ...(intent && intent.length > 0 ? { intent } : {}),
  };
}

function detectBuildTool(devDeps: Record<string, string>): string {
  if (devDeps.tsup) return 'tsup';
  if (devDeps.vite) return 'vite';
  if (devDeps.webpack) return 'webpack';
  if (devDeps.rollup) return 'rollup';
  if (devDeps.esbuild) return 'esbuild';
  return 'unknown';
}
