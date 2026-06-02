import { createHash, randomUUID } from 'crypto';
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

export function computeHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function getFileLanguage(filePath: string): Language {
  const ext = extname(filePath).toLowerCase();
  return EXT_LANGUAGE_MAP[ext] ?? 'unknown';
}

export function relativePath(root: string, absPath: string): string {
  return relative(root, absPath).replace(/\\/g, '/');
}

export function generateId(): string {
  return randomUUID();
}
