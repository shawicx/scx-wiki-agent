import { describe, it, expect } from 'vitest';
import { computeHash, getFileLanguage, relativePath, generateId } from '../../src/shared/utils.js';

describe('utils', () => {
  it('computeHash returns consistent SHA-256 hex', () => {
    const h1 = computeHash('hello world');
    const h2 = computeHash('hello world');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('getFileLanguage detects TypeScript', () => {
    expect(getFileLanguage('src/app.ts')).toBe('typescript');
    expect(getFileLanguage('src/component.tsx')).toBe('tsx');
    expect(getFileLanguage('README.md')).toBe('markdown');
    expect(getFileLanguage('package.json')).toBe('json');
    expect(getFileLanguage('unknown.txt')).toBe('unknown');
  });

  it('relativePath returns relative path from root', () => {
    expect(relativePath('/project', '/project/src/app.ts')).toBe('src/app.ts');
  });

  it('generateId returns unique strings', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});
