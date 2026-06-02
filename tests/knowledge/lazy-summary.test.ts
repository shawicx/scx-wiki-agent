import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, closeDatabase } from '../../src/core/database.js';
import { LazySummary } from '../../src/knowledge/lazy-summary.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const tmpDir = join(process.cwd(), '.test-summary-tmp');

describe('LazySummary', () => {
  let db: ReturnType<typeof createDatabase>;
  let lazySummary: LazySummary;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    db = createDatabase(join(tmpDir, 'test-summary.db'));
    lazySummary = new LazySummary(db);
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate summary for a code chunk containing class name', () => {
    const content = `
export class UserService {
  constructor(private repo: UserRepository) {}

  async getUser(id: string): Promise<User> {
    return this.repo.findById(id);
  }

  async createUser(data: CreateUserDto): Promise<User> {
    return this.repo.create(data);
  }
}
`;
    const summary = lazySummary.getOrCreateSummary('chunk-1', content, 'src/services/user.service.ts');

    expect(summary).toContain('UserService');
    expect(summary).toContain('[ts]');
  });

  it('should return cached summary on second call with same result', () => {
    const content = `export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}`;

    const first = lazySummary.getOrCreateSummary('chunk-2', content, 'src/utils/calc.ts');
    const second = lazySummary.getOrCreateSummary('chunk-2', content, 'src/utils/calc.ts');

    expect(first).toBe(second);
    expect(first).toContain('calculateTotal');
  });

  it('should extract class and method names in rule-based summary', () => {
    const content = `
export class Parser {
  parse(input: string): AST {
    return this.tokenize(input);
  }

  tokenize(input: string): Token[] {
    return input.split(/\\s+/).map(this.toToken);
  }

  validate(ast: AST): boolean {
    return ast.nodes.length > 0;
  }
}
`;
    const summary = lazySummary.getOrCreateSummary('chunk-3', content, 'src/parser.ts');

    expect(summary).toContain('Parser');
    // Should contain at least some method names
    expect(summary).toContain('parse');
    expect(summary).toContain('tokenize');
    expect(summary).toContain('validate');
  });

  it('should create chunk_summaries table', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_summaries'")
      .all();
    expect(tables).toHaveLength(1);
  });

  it('should persist summary to SQLite', () => {
    const content = 'export interface Config { port: number; host: string; }';
    lazySummary.getOrCreateSummary('chunk-4', content, 'src/config.ts');

    const row = db
      .prepare('SELECT summary FROM chunk_summaries WHERE chunk_id = ?')
      .get('chunk-4') as { summary: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.summary).toContain('Config');
  });

  it('should handle exported functions', () => {
    const content = `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`;
    const summary = lazySummary.getOrCreateSummary('chunk-5', content, 'src/greet.ts');
    expect(summary).toContain('greet');
  });

  it('should handle exported interfaces', () => {
    const content = `export interface User {
  id: string;
  name: string;
  email: string;
}`;
    const summary = lazySummary.getOrCreateSummary('chunk-6', content, 'src/types.ts');
    expect(summary).toContain('User');
  });

  it('should fall back to first non-empty line when no exports or methods', () => {
    const content = `// This is a utility module
doSomething();`;
    const summary = lazySummary.getOrCreateSummary('chunk-7', content, 'src/helper.ts');
    expect(summary).toBe('// This is a utility module');
  });

  it('should handle empty content', () => {
    const content = '';
    const summary = lazySummary.getOrCreateSummary('chunk-8', content, 'src/empty.ts');
    expect(summary).toBe('(empty)');
  });

  it('should handle different file extensions', () => {
    const content = 'export function main() {}';
    const summary = lazySummary.getOrCreateSummary('chunk-9', content, 'src/main.tsx');
    expect(summary).toContain('[tsx]');
  });

  it('should serve from in-memory cache without hitting DB', () => {
    const content = 'export class Cached {}';
    const summary1 = lazySummary.getOrCreateSummary('chunk-10', content, 'src/cached.ts');

    // Delete from SQLite to verify in-memory cache is used
    db.prepare('DELETE FROM chunk_summaries WHERE chunk_id = ?').run('chunk-10');

    const summary2 = lazySummary.getOrCreateSummary('chunk-10', content, 'src/cached.ts');
    expect(summary1).toBe(summary2);
    expect(summary2).toContain('Cached');
  });
});
