import { relative, extname } from 'path';
import type { Language } from '../core/types.js';

const EXT_LANGUAGE_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.vue': 'vue',
  '.rs': 'rust',
  '.css': 'css',
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

export function getFileLanguage(filePath: string): Language {
  const ext = extname(filePath).toLowerCase();
  return EXT_LANGUAGE_MAP[ext] ?? 'unknown';
}

export function relativePath(root: string, absPath: string): string {
  return relative(root, absPath).replace(/\\/g, '/');
}

/** 测试路径特征：tests/ 目录、__tests__、*.test.* / *.spec.* 文件 */
const TEST_PATH_RE = /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/;

/** 是否测试路径（fixtures/单测文件不作为项目功能证据） */
export function isTestPath(p: string): boolean {
  return TEST_PATH_RE.test(p);
}

/** 代码文件的语言域（用于过滤图谱误建的跨语言 CALLS 边与非代码节点） */
const LANGUAGE_DOMAIN_EXT: Record<string, string> = {
  '.ts': 'ts', '.tsx': 'ts', '.js': 'ts', '.jsx': 'ts', '.mjs': 'ts', '.cjs': 'ts', '.vue': 'ts',
  '.rs': 'rust',
};

/** 文件的语言域；非代码文件（json/toml/md 等）返回 null */
export function languageDomainOf(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  return LANGUAGE_DOMAIN_EXT[ext] ?? null;
}

/**
 * import 说明符 → 声明依赖包名；相对/绝对路径与裸 css 等非包说明符返回 null。
 * 覆盖 scoped 包（@scope/name）与经 node_modules 的相对引用
 * （如 `../node_modules/tw-animate-css/dist/tw-animate.css` → `tw-animate-css`）。
 */
export function importedPackageName(specifier: string): string | null {
  const nm = specifier.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (nm) return nm[1];
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  return specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];
}

/**
 * 包归属匹配：文件路径的目录段中存在与包名（可含 '/' 多段）完全一致的连续段时命中，
 * 多包命中取段数最长者。替代 `includes('/${pkg}/')` 子串匹配——后者会把
 * `src-tauri/src/x.rs` 与 `src/x.ts` 都归到包 `src`，造成前后端混入同一模块。
 */
export function matchPackageForFile(filePath: string, packageNames: readonly string[]): string | null {
  const segs = filePath.split('/');
  const dirCount = segs.length - 1;
  let best: string | null = null;
  let bestN = 0;
  let bestStart = -1;
  for (const pkg of packageNames) {
    const pkgSegs = pkg.split('/').filter(Boolean);
    const n = pkgSegs.length;
    if (n === 0 || n > dirCount) continue;
    for (let start = 0; start + n <= dirCount; start++) {
      let ok = true;
      for (let i = 0; i < n; i++) {
        if (segs[start + i] !== pkgSegs[i]) { ok = false; break; }
      }
      if (!ok) continue;
      // 段数更多（多段包名）或位置更深（更内层目录）的匹配更具体
      if (n > bestN || (n === bestN && start > bestStart)) {
        best = pkg;
        bestN = n;
        bestStart = start;
      }
      break;
    }
  }
  return best;
}
