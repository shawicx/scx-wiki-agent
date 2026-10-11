import { relative, resolve, extname } from 'path';
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
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
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
const TEST_PATH_RE = /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[\w.]+\.py$|(?:^|\/)conftest\.py$|(?:^|\/)\w+_test\.go$|(?:^|\/)src\/test\//;

/** 是否测试路径（fixtures/单测文件不作为项目功能证据） */
export function isTestPath(p: string): boolean {
  return TEST_PATH_RE.test(p);
}

/** 代码文件的语言域（用于过滤图谱误建的跨语言 CALLS 边与非代码节点） */
const LANGUAGE_DOMAIN_EXT: Record<string, string> = {
  '.ts': 'ts', '.tsx': 'ts', '.js': 'ts', '.jsx': 'ts', '.mjs': 'ts', '.cjs': 'ts', '.vue': 'ts',
  '.rs': 'rust',
  '.py': 'python',
  '.go': 'go',
  '.java': 'jvm', '.kt': 'jvm', '.kts': 'jvm',
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

/** MCP 上游会把「无数据」占位串（英文）当值写进图谱，消费侧统一识别后丢弃 */
export function isMcpPlaceholder(text: string | null | undefined): boolean {
  if (!text) return false;
  return /^no\s+[\w\s-]*?(?:detected|available|found|edges?\s+traced|symbols?)\s*$/i.test(text.trim());
}

/**
 * 图谱限定名归一化（消费端防线）：部分上游版本会把 workspace 绝对路径
 * 拼进 parent_class / qualified_name（如 `/a/b/repo` → `a-b-repo.src.pkg.Type`），
 * 渲染成 `Type.member` 时泄漏整条绝对路径。此处确定性剥离：
 * 1. 路径前缀——根目录按 `/`→`-`、`/`→`.` 两种畸形形态匹配并剥除；
 * 2. 文件段——限定名的开头连续段若与所在文件路径段逐一对应（如
 *    `src-tauri.src.shells` ↔ `src-tauri/src/shells.rs`），一并剥除。
 * 不匹配时原样返回（正常嵌套类型链 `Outer.Inner` 不受影响）。
 */
export function normalizeQualifiedName(value: string, rootDir: string, filePath?: string): string {
  if (!value || !value.includes('.')) return value;
  const segs = resolve(rootDir).split('/').filter(Boolean);
  let out = value;
  for (const sep of ['-', '.']) {
    const prefix = segs.join(sep);
    if (prefix && out.startsWith(`${prefix}.`)) {
      out = out.slice(prefix.length + 1);
      break;
    }
  }
  if (!filePath || !out.includes('.')) return out;
  const rawFileSegs = filePath.split(/[\\/]/).filter(Boolean);
  if (rawFileSegs.length > 0) {
    // 末段去扩展名（shells.rs → shells）后再参与对齐
    rawFileSegs[rawFileSegs.length - 1] = rawFileSegs[rawFileSegs.length - 1].replace(/\.[^.]*$/, '');
  }
  const fileSegs = rawFileSegs;
  const nameSegs = out.split('.');
  // 末段视为符号名，其余段尝试与文件路径段前缀对齐剥除（大小写敏感，避免误伤类型链）
  let cut = 0;
  for (let i = 0; i < nameSegs.length - 1 && i < fileSegs.length; i++) {
    if (nameSegs[i] === fileSegs[i]) cut = i + 1;
    else break;
  }
  return cut > 0 ? nameSegs.slice(cut).join('.') : out;
}
