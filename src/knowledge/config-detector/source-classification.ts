import { existsSync, readdirSync, statSync } from 'fs';
import { join, extname, relative } from 'path';
import { isTestPath } from '../../shared/utils.js';

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const KNOWN_SOURCE_DIRS = ['src', 'src-tauri', 'app', 'lib', 'packages', 'cmd', 'internal'];
const AUTO_SOURCE_DIRS = [...KNOWN_SOURCE_DIRS, 'tests', 'test', '__tests__', 'spec'];

/** 按生产/测试口径拆分文件清单（isTestPath 判定） */
export function classifyFiles(rootDir: string, files: string[]): { production: string[]; test: string[] } {
  const production: string[] = [];
  const test: string[] = [];
  for (const file of files) {
    const rel = relative(rootDir, file).replace(/\\/g, '/');
    (isTestPath(rel) ? test : production).push(file);
  }
  return { production, test };
}

/** 扫描常见生产/测试目录并分类（懒加载回退路径） */
export function scanAndClassifyFiles(rootDir: string): { production: string[]; test: string[] } {
  const files: string[] = [];
  for (const dir of AUTO_SOURCE_DIRS) {
    const absDir = join(rootDir, dir);
    if (existsSync(absDir)) {
      walkCodeFiles(absDir, files);
    }
  }
  return classifyFiles(rootDir, files);
}

function walkCodeFiles(dir: string, acc: string[]): void {
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
      walkCodeFiles(full, acc);
    } else if (CODE_EXTS.includes(extname(entry))) {
      acc.push(full);
    }
  }
}
