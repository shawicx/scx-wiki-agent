import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import type { QueryResult } from '../../../src/mcp/types.js';
import { makeScanResult } from './helpers.js';
  describe('buildGlossaryContext', () => {
    it('通过 Cypher 查询，结果含 docstring 与行号，按类型优先级排序，过滤测试路径', () => {
      const glossaryCypher = `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file,
              n.start_line AS line
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`;
      const queryResults = new Map<string, QueryResult>([
        [glossaryCypher, {
          columns: ['name', 'type', 'doc', 'sig', 'cx', 'file', 'line'],
          rows: [
            ['Foo', 'Class', 'A foo class', 'class Foo', 3, 'src/foo.ts', 10],
            ['bar', 'Method', 'does bar', 'bar(): void', 1, 'src/bar.ts', 20],
            ['Ghost', 'Class', 'fixture class', 'class Ghost', 9, 'tests/fixtures/ghost.ts', 1],
          ],
          total: 3,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildGlossaryContext();

      // fixtures 行被过滤，仅保留 2 个生产符号
      expect(ctx.symbols.length).toBe(2);
      expect(ctx.symbols[0].docstring).toBe('A foo class');
      expect(ctx.symbols[0].type).toBe('class');
      expect(ctx.symbols[0].startLine).toBe(10);
      // Class 排在 Method 前
      expect(ctx.symbols[0].name).toBe('Foo');
    });

    it('去重同名符号', () => {
      const glossaryCypher = `MATCH (n) WHERE n.docstring IS NOT NULL AND n.is_test = false
         AND n.label IN ['Class', 'Method', 'Function', 'Interface']
       RETURN n.name AS name, n.label AS type, n.docstring AS doc,
              n.signature AS sig, n.complexity AS cx, n.file_path AS file,
              n.start_line AS line
       ORDER BY
         CASE n.label WHEN 'Class' THEN 0 WHEN 'Method' THEN 1 WHEN 'Function' THEN 2 ELSE 3 END,
         n.complexity DESC
       LIMIT 40`;
      const queryResults = new Map<string, QueryResult>([
        [glossaryCypher, {
          columns: ['name', 'type', 'doc', 'sig', 'cx', 'file', 'line'],
          rows: [
            ['Foo', 'Class', 'A foo class', 'class Foo', 3, 'src/foo.ts', 10],
            ['Foo', 'Class', 'dup', 'class Foo', 1, 'src/foo2.ts', 5],
          ],
          total: 2,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildGlossaryContext();

      const fooEntries = ctx.symbols.filter(s => s.name === 'Foo');
      expect(fooEntries.length).toBe(1);
    });
  });
