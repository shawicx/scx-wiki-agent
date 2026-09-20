import { describe, it, expect } from 'vitest';
import { getFileLanguage, relativePath } from '../../src/shared/utils.js';

describe('utils', () => {
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
});
