import { describe, it, expect } from 'vitest';
import { FileScanner } from '../../src/core/scanner.js';
import { join } from 'path';

const fixturesDir = join(process.cwd(), 'tests/fixtures/sample-project');

describe('FileScanner', () => {
  it('should scan all source files', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();
    const paths = result.files.map((f) => f.relativePath);

    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/user.service.ts');
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
  });

  it('should not include node_modules files', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();
    const paths = result.files.map((f) => f.relativePath);

    expect(paths.every((p) => !p.includes('node_modules'))).toBe(true);
  });

  it('should detect correct language for each file', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();
    const tsFile = result.files.find((f) => f.relativePath === 'src/index.ts');

    expect(tsFile?.language).toBe('typescript');
  });

  it('should detect tech stack from package.json', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();

    expect(result.techStack).toContain('express');
    expect(result.techStack).toContain('@nestjs/core');
  });

  it('should detect project type', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();

    expect(result.projectType).toBe('backend');
  });
});
