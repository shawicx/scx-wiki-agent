import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TreeSitterParser } from '../../src/core/parser.js';
import { extractSymbols } from '../../src/core/symbol-extractor.js';

describe('SymbolExtractor', () => {
  let parser: TreeSitterParser;

  beforeAll(async () => {
    parser = new TreeSitterParser();
    await parser.init();
  });

  afterAll(() => {
    parser.dispose();
  });

  it('should extract functions', () => {
    const code = `
export function greet(name: string): string {
  return "Hello, " + name;
}

const arrow = (x: number) => x * 2;
`;
    const tree = parser.parse(code);
    const symbols = extractSymbols(tree, 'src/test.ts');

    const fns = symbols.filter((s) => s.type === 'function');
    expect(fns.length).toBeGreaterThanOrEqual(1);
    expect(fns.some((f) => f.name === 'greet')).toBe(true);
    tree.delete();
  });

  it('should extract classes', () => {
    const code = `
export class UserService {
  createUser(name: string): void {}
  deleteUser(id: string): void {}
}
`;
    const tree = parser.parse(code);
    const symbols = extractSymbols(tree, 'src/user.service.ts');

    const classes = symbols.filter((s) => s.type === 'class');
    expect(classes).toHaveLength(1);
    expect(classes[0].name).toBe('UserService');

    const methods = symbols.filter((s) => s.type === 'method');
    expect(methods).toHaveLength(2);
    expect(methods.map((m) => m.name)).toContain('createUser');
    expect(methods.map((m) => m.name)).toContain('deleteUser');
    tree.delete();
  });

  it('should extract interfaces', () => {
    const code = `
export interface User {
  id: string;
  name: string;
}
`;
    const tree = parser.parse(code);
    const symbols = extractSymbols(tree, 'src/types.ts');

    const interfaces = symbols.filter((s) => s.type === 'interface');
    expect(interfaces).toHaveLength(1);
    expect(interfaces[0].name).toBe('User');
    tree.delete();
  });

  it('should extract imports', () => {
    const code = `
import { UserService } from './user.service.js';
import express from 'express';
`;
    const tree = parser.parse(code);
    const symbols = extractSymbols(tree, 'src/index.ts');

    const imports = symbols.filter((s) => s.type === 'import');
    expect(imports).toHaveLength(2);
    tree.delete();
  });

  it('should extract exports', () => {
    const code = `
export function greet() {}
export class App {}
`;
    const tree = parser.parse(code);
    const symbols = extractSymbols(tree, 'src/app.ts');

    const exports = symbols.filter((s) => s.type === 'export');
    expect(exports.length).toBeGreaterThanOrEqual(2);
    tree.delete();
  });
});
