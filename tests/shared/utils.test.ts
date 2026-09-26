import { describe, it, expect } from 'vitest';
import { getFileLanguage, relativePath, isTestPath, languageDomainOf, matchPackageForFile } from '../../src/shared/utils.js';

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

  it('languageDomainOf 划分语言域：代码文件归 ts/rust，非代码文件为 null', () => {
    expect(languageDomainOf('src/a.ts')).toBe('ts');
    expect(languageDomainOf('src/Comp.vue')).toBe('ts');
    expect(languageDomainOf('src-tauri/src/main.rs')).toBe('rust');
    // 非代码文件（图谱可能误建 CALLS 边的节点）不属任何语言域
    expect(languageDomainOf('src-tauri/tauri.conf.json')).toBe(null);
    expect(languageDomainOf('Cargo.toml')).toBe(null);
    expect(languageDomainOf('README.md')).toBe(null);
  });

  it('matchPackageForFile 路径段精确归属，多段包名取最长（修复 src-tauri/src 与 src 撞名）', () => {
    const pkgs = ['src', 'src-tauri/src', 'lib'];
    expect(matchPackageForFile('src/lib/frontends/xterm.ts', pkgs)).toBe('lib');
    // 多段包名 src-tauri/src 比单段 src 更长 → Rust 文件归它而非前端的 src
    expect(matchPackageForFile('src-tauri/src/ssh.rs', pkgs)).toBe('src-tauri/src');
    // 前端文件归 src
    expect(matchPackageForFile('src/main.ts', pkgs)).toBe('src');
    // 子串不构成边界：my-lib 不匹配 lib
    expect(matchPackageForFile('src/my-lib/a.ts', pkgs)).toBe('src');
    expect(matchPackageForFile('docs/a.md', pkgs)).toBe(null);
  });
});
