import { relative, extname } from 'path';
import type { Language } from '../core/types.js';

const EXT_LANGUAGE_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
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
