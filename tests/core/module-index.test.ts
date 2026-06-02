import { describe, it, expect } from 'vitest';
import { ModuleIndex } from '../../src/core/module-index.js';
import type { Symbol } from '../../src/core/types.js';

describe('ModuleIndex', () => {
  it('should group symbols by directory module', () => {
    const symbols: Symbol[] = [
      { id: '1', name: 'UserService', type: 'class', filePath: 'src/user/user.service.ts', startLine: 1, endLine: 20, scope: null, visibility: 'public' },
      { id: '2', name: 'UserController', type: 'class', filePath: 'src/user/user.controller.ts', startLine: 1, endLine: 30, scope: null, visibility: 'public' },
      { id: '3', name: 'AppService', type: 'class', filePath: 'src/app.service.ts', startLine: 1, endLine: 10, scope: null, visibility: 'public' },
    ];

    const index = new ModuleIndex();
    const modules = index.buildFromSymbols(symbols);

    expect(modules.some((m) => m.name === 'src/user')).toBe(true);
    expect(modules.some((m) => m.name === 'src')).toBe(true);
    const userModule = modules.find((m) => m.name === 'src/user')!;
    expect(userModule.symbols).toContain('UserService');
    expect(userModule.symbols).toContain('UserController');
  });
});
