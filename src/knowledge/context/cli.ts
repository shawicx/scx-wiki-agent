import { readFileSync } from 'node:fs';
import type { CliContext } from '../types.js';
import { type ContextDeps, isAppEntryPoint, safeGetSnippet } from './shared.js';

/**
 * cli.md 数据源：命令注册（MCP entry_points + getCodeSnippet 解析 commander options）
 * + 退出码（源码扫 process.exit(N)）。
 *
 * entry_points 即 CLI 命令入口；getCodeSnippet 读 register*Command 源码，
 * 从 .option() 调用提取参数定义。
 */
export function buildCliContext(deps: ContextDeps): CliContext {
  const arch = deps.client.getArchitecture();

  const commands = arch.entry_points
    .filter(e => isAppEntryPoint(deps, e.file))
    .filter(e => e.name.startsWith('register') || e.name.includes('Command'))
    .slice(0, 10)
    .map(e => {
      const snippet = safeGetSnippet(deps, e.name);
      const options = parseCommanderOptions(snippet?.source ?? '');
      const cleanName = e.name.replace(/^register/, '').replace(/Command$/, '').toLowerCase() || e.name;
      return {
        name: cleanName,
        description: snippet?.docstring ?? '',
        filePath: e.file,
        startLine: snippet?.start_line ?? 0,
        options,
      };
    });

  // 退出码：从 scanResult 源码扫 process.exit(N)
  const exitCodes = deps.scanResult.productionFiles
    .filter(f => f.extension === '.ts' || f.extension === '.js')
    .flatMap(f => extractExitCodes(f.absolutePath, f.relativePath))
    .slice(0, 20);

  return { commands, exitCodes };
}

/** 命令入口的真实描述：docstring 优先，缺失时从 commander 源码 .command('name', 'desc') 提取 */
export function commandDescription(deps: ContextDeps, entryName: string): { description: string; startLine: number } {
  const snippet = safeGetSnippet(deps, entryName);
  const fromDoc = snippet?.docstring ?? '';
  const fromCommand = snippet ? parseCommanderDescription(snippet.source ?? '') : '';
  return {
    description: fromDoc || fromCommand,
    startLine: snippet?.start_line ?? 0,
  };
}

/** 从 commander 源码提取命令描述：`.command('name', 'desc')` 双参式 → 链式 `.description('desc')` */
export function parseCommanderDescription(source: string): string {
  const pair = source.match(/\.command\(\s*['"`][^'"`]+['"`]\s*,\s*['"`]([^'"`]+)['"`]/);
  if (pair) return pair[1];
  const chained = source.match(/\.description\(\s*['"`]([^'"`]+)['"`]\s*\)/);
  return chained ? chained[1] : '';
}

/** 从 commander 源码解析 .option('flag', 'description') 调用 */
export function parseCommanderOptions(source: string): Array<{ flag: string; description: string }> {
  const options: Array<{ flag: string; description: string }> = [];
  const optRegex = /\.option\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = optRegex.exec(source)) !== null) {
    options.push({ flag: match[1], description: match[2] });
  }
  return options;
}

/** 从源码逐行提取 process.exit(N) 调用 */
function extractExitCodes(absPath: string, relPath: string): Array<{ code: number; context: string; filePath: string }> {
  const codes: Array<{ code: number; context: string; filePath: string }> = [];
  try {
    const source = readFileSync(absPath, 'utf-8');
    const lines = source.split('\n');
    const exitRegex = /process\.exit\((\d+)\)/;
    lines.forEach((line) => {
      const m = exitRegex.exec(line);
      if (m) {
        codes.push({
          code: parseInt(m[1], 10),
          context: line.trim().slice(0, 80),
          filePath: relPath,
        });
      }
    });
  } catch { /* skip unreadable */ }
  return codes;
}
