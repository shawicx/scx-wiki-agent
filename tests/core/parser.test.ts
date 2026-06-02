import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TreeSitterParser } from '../../src/core/parser.js';

describe('TreeSitterParser', () => {
  let parser: TreeSitterParser;

  beforeAll(async () => {
    parser = new TreeSitterParser();
    await parser.init();
  });

  afterAll(() => {
    parser.dispose();
  });

  it('should parse a TypeScript file and return a tree', async () => {
    const code = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class UserService {
  private users: string[] = [];

  addUser(name: string): void {
    this.users.push(name);
  }
}
`;
    const tree = parser.parse(code);
    expect(tree).toBeDefined();
    expect(tree.rootNode).toBeDefined();
    expect(tree.rootNode.type).toBe('program');
    tree.delete();
  });

  it('should parse a TSX file', async () => {
    const code = `export const Component = () => <div>Hello</div>;`;
    const tree = parser.parse(code);
    expect(tree).toBeDefined();
    expect(tree.rootNode.type).toBe('program');
    tree.delete();
  });
});
