import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SymbolResolver } from '../../src/core/symbol-resolver.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

const tmpDir = join(process.cwd(), '.test-symres-tmp');

describe('SymbolResolver', () => {
  beforeEach(() => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'src', 'user.service.ts'),
      `export class UserService {\n  createUser(name: string): void {}\n}`
    );
    writeFileSync(
      join(tmpDir, 'src', 'app.ts'),
      `import { UserService } from './user.service.js';\nconst svc = new UserService();\nsvc.createUser('Alice');`
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should resolve import to source file', () => {
    const resolver = new SymbolResolver(tmpDir);
    const resolved = resolver.resolveImport('./user.service.js', 'src/app.ts');
    expect(resolved).toContain('src/user.service.ts');
  });

  it('should build cross-file symbol map', () => {
    const resolver = new SymbolResolver(tmpDir);
    const map = resolver.buildSymbolMap([
      { relativePath: 'src/user.service.ts', symbols: ['UserService'] },
      { relativePath: 'src/app.ts', symbols: ['svc'] },
    ]);
    expect(map.get('UserService')).toBeDefined();
    expect(map.get('UserService')?.filePath).toBe('src/user.service.ts');
  });

  it('should trace export/import chains', () => {
    const resolver = new SymbolResolver(tmpDir);
    const chains = resolver.traceImportChains([
      {
        filePath: 'src/app.ts',
        imports: [{ name: 'UserService', from: './user.service.js' }],
      },
      {
        filePath: 'src/user.service.ts',
        imports: [],
      },
    ]);

    expect(chains).toHaveLength(1);
    expect(chains[0].source).toContain('src/user.service.ts');
    expect(chains[0].target).toBe('src/app.ts');
  });
});
