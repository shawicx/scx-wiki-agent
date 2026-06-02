import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathResolver } from '../../src/core/path-resolver.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const tmpDir = join(process.cwd(), '.test-path-tmp');

describe('PathResolver', () => {
  let resolver: PathResolver;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'user.service.ts'), 'export class UserService {}');
    writeFileSync(join(tmpDir, 'src', 'app.module.ts'), 'export class AppModule {}');
    writeFileSync(
      join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          paths: { '@/*': ['./src/*'] },
          baseUrl: '.',
        },
      })
    );
    resolver = new PathResolver(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should resolve relative imports', () => {
    const result = resolver.resolve('./user.service', 'src/app.module.ts');
    expect(result).toContain('src/user.service.ts');
  });

  it('should resolve path alias imports', () => {
    const result = resolver.resolve('@/user.service', 'src/app.module.ts');
    expect(result).toContain('src/user.service.ts');
  });

  it('should return null for external (node_modules) imports', () => {
    const result = resolver.resolve('express', 'src/app.ts');
    expect(result).toBeNull();
  });

  it('should handle .js extension in imports', () => {
    const result = resolver.resolve('./user.service.js', 'src/app.module.ts');
    expect(result).toContain('src/user.service.ts');
  });

  it('should return null for @-scoped npm packages (e.g. @nestjs/core)', () => {
    const result = resolver.resolve('@nestjs/core', 'src/app.module.ts');
    expect(result).toBeNull();
  });

  it('should return null when tsconfig.json does not exist', () => {
    rmSync(join(tmpDir, 'tsconfig.json'), { force: true });
    const noConfigResolver = new PathResolver(tmpDir);
    const result = noConfigResolver.resolve('@/user.service', 'src/app.module.ts');
    expect(result).toBeNull();
  });

  it('should return null when the target file does not exist', () => {
    const result = resolver.resolve('./nonexistent', 'src/app.module.ts');
    expect(result).toBeNull();
  });
});
