import { describe, it, expect } from 'vitest';
import { getFileLanguage, relativePath, isTestPath } from '../../src/shared/utils.js';

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

  it('isTestPath 识别测试目录/文件，不误伤生产路径', () => {
    expect(isTestPath('tests/fixtures/nestjs-project/src/user.controller.ts')).toBe(true);
    expect(isTestPath('tests/wiki-service.test.ts')).toBe(true);
    expect(isTestPath('src/__tests__/foo.ts')).toBe(true);
    expect(isTestPath('src/foo.spec.tsx')).toBe(true);
    expect(isTestPath('src/core/scanner.ts')).toBe(false);
    expect(isTestPath('src/test-utils/helper.ts')).toBe(false);
    expect(isTestPath('src/testing-framework.ts')).toBe(false);
  });
});
