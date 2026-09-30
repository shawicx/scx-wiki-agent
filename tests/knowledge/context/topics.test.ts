import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import type { QueryResult } from '../../../src/mcp/types.js';
import { makeScanResult } from './helpers.js';
  describe('buildTopicContext（主题页）', () => {
    const files = ['src/services/wiki-service.ts', 'src/knowledge/page-registry.ts'];
    const fileList = files.map(f => `"${f}"`).join(',');
    const symCypher = `MATCH (n) WHERE n.file_path IN [${fileList}] AND n.is_test = false
         AND (n.docstring IS NOT NULL OR n.complexity > 5) AND n.label IN ['Class', 'Method', 'Function']
       RETURN n.name AS name, n.label AS label, n.file_path AS file, n.start_line AS line,
              n.docstring AS doc, n.signature AS sig, n.complexity AS cx
       ORDER BY n.complexity DESC LIMIT 25`;
    const edgeCypher = `MATCH (a)-[:CALLS]->(b)
       WHERE a.file_path IN [${fileList}] AND b.file_path IN [${fileList}]
         AND a.is_test = false AND b.is_test = false
       RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line
       LIMIT 30`;

    it('查询主题文件的符号、CALLS 边与相关边界；未定义主题返回 null', () => {
      const queryResults = new Map<string, QueryResult>([
        [symCypher, {
          columns: ['name', 'label', 'file', 'line', 'doc', 'sig', 'cx'],
          rows: [
            ['buildWiki', 'Method', 'src/services/wiki-service.ts', 34, 'build all', 'async buildWiki()', 9],
            ['ghost', 'Method', 'tests/fixtures/ghost.ts', 1, '', '', 1],
          ],
          total: 2,
        }],
        [edgeCypher, {
          columns: ['caller', 'callerFile', 'callee', 'file', 'line'],
          rows: [['buildWiki', 'src/services/wiki-service.ts', 'pageRelPath', 'src/knowledge/page-registry.ts', 96]],
          total: 1,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      builder.setTopics([{ id: 't1', title: '质量闸门', files }]);

      const ctx = builder.buildByName('topic:t1') as {
        title: string; symbols: Array<{ name: string }>; edges: unknown[]; boundaries: Array<{ from: string }>;
      };
      expect(ctx.title).toBe('质量闸门');
      // fixtures 符号被过滤
      expect(ctx.symbols.map(s => s.name)).toEqual(['buildWiki']);
      expect(ctx.edges.length).toBe(1);
      // mock 边界 services→core 与主题文件（services/knowledge）相关
      expect(ctx.boundaries.map(b => b.from)).toContain('services');

      // 未定义的主题 id → null（服务层跳过写盘）
      expect(builder.buildByName('topic:missing')).toBeNull();
    });
  });
