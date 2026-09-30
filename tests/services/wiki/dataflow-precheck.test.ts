import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WikiService } from '../../../src/services/wiki-service.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpBase, makeCliScanResult } from './helpers.js';

const tmpDir = join(tmpBase, 'precheck');

describe('data-flow 成页预检', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('预检：有 CALLS 边但无任何数据形态证据时剔除 data-flow 页（README 无死链，报告给原因）', async () => {
    // 只有一条纯控制流边：无 r.args、callee 无签名、无 I/O
    const controlOnlyCypher = `MATCH (caller)-[r:CALLS]->(callee)
         WHERE caller.name IN ["createProgram"]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, caller.file_path AS callerFile,
                callee.name AS callee, callee.file_path AS file, callee.label AS label,
                callee.start_line AS calleeLine, r.line AS callLine, r.args AS args,
                r.confidence AS confidence, r.strategy AS strategy
         LIMIT 40`;
    const client = createMockClient({
      queryResults: new Map([[
        controlOnlyCypher,
        {
          columns: ['caller', 'callerFile', 'callee', 'file', 'label', 'calleeLine', 'callLine', 'args', 'confidence', 'strategy'],
          rows: [['createProgram', 'src/cli/index.ts', 'ScanService', 'src/services/scan-service.ts', 'Class', 3, 4, '', '', '']],
          total: 1,
        },
      ]]),
    });
    const scanResult = makeCliScanResult();
    scanResult.files = ['src/cli/index.ts', 'src/services/scan-service.ts'].map(p => ({
      absolutePath: `/tmp/test-project/${p}`,
      relativePath: p,
      language: 'typescript' as const,
      extension: '.ts',
      size: 100,
      scope: 'production' as const,
    }));
    scanResult.productionFiles = scanResult.files;
    scanResult.fileCounts = { total: 2, production: 2, test: 0 };

    const wikiDir = join(tmpDir, 'wiki');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => { logs.push(String(msg)); });
    try {
      const generated = await new WikiService(client as any, scanResult).buildWiki(wikiDir, { noLlm: true });
      // data-flow 成页条件不满足 → 整页剔除，不产出空壳页
      expect(generated).not.toContain('02-architecture/data-flow.md');
      expect(existsSync(join(wikiDir, '02-architecture', 'data-flow.md'))).toBe(false);
      // README 索引不得出现指向未产出页的死链
      const readme = readFileSync(join(wikiDir, 'README.md'), 'utf-8');
      expect(readme).not.toContain('data-flow.md');
    } finally {
      spy.mockRestore();
    }
    const report = logs.join('\n');
    expect(report).toContain('data-flow');
    expect(report).toContain('缺少签名、调用参数、返回类型或 I/O 数据形态证据');
  });

  it('预检：有签名或调用实参时保留 data-flow 页并渲染数据形态表', async () => {
    const bfsCypher = `MATCH (caller)-[r:CALLS]->(callee)
         WHERE caller.name IN ["createProgram"]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, caller.file_path AS callerFile,
                callee.name AS callee, callee.file_path AS file, callee.label AS label,
                callee.start_line AS calleeLine, r.line AS callLine, r.args AS args,
                r.confidence AS confidence, r.strategy AS strategy
         LIMIT 40`;
    const files = ['src/cli/index.ts', 'src/services/wiki-service.ts'];
    const fileList = files.map(f => `"${f}"`).join(',');
    const symbolCypher = `MATCH (n) WHERE n.file_path IN [${fileList}]
           AND n.is_test = false
           AND n.label IN ['Function', 'Method', 'Class']
         RETURN n.name AS name, n.file_path AS file, n.label AS label,
                n.signature AS sig, n.return_type AS rt, n.param_types AS pt,
                n.param_names AS pn, n.start_line AS sl, n.end_line AS el, n.docstring AS doc
         LIMIT 200`;
    const typeCypher = `MATCH (n) WHERE n.file_path IN [${fileList}]
           AND n.is_test = false
           AND n.label IN ['Interface', 'Type', 'Enum', 'Class']
         RETURN n.name AS name, n.label AS label, n.file_path AS file,
                n.start_line AS sl, n.end_line AS el
         LIMIT 60`;

    const client = createMockClient({
      queryResults: new Map([
        [bfsCypher, {
          columns: ['caller', 'callerFile', 'callee', 'file', 'label', 'calleeLine', 'callLine', 'args', 'confidence', 'strategy'],
          rows: [['createProgram', files[0], 'buildWiki', files[1], 'Method', 96, 121, '[{"i":0,"e":"scanResult"}]', '0.95', 'lsp_ts_method']],
          total: 1,
        }],
        [symbolCypher, {
          columns: ['name', 'file', 'label', 'sig', 'rt', 'pt', 'pn', 'sl', 'el', 'doc'],
          rows: [['buildWiki', files[1], 'Method', '(scanResult: ScanResult)', ': string[]', '["ScanResult"]', '["scanResult"]', 96, 130, null]],
          total: 1,
        }],
        [typeCypher, {
          columns: ['name', 'label', 'file', 'sl', 'el'],
          rows: [['ScanResult', 'Interface', files[1], 96, 100]],
          total: 1,
        }],
      ]),
    });
    const scanResult = makeCliScanResult();
    scanResult.files = files.map(p => ({
      absolutePath: `/tmp/test-project/${p}`,
      relativePath: p,
      language: 'typescript' as const,
      extension: '.ts',
      size: 100,
      scope: 'production' as const,
    }));
    scanResult.productionFiles = scanResult.files;
    scanResult.fileCounts = { total: 2, production: 2, test: 0 };

    const wikiDir = join(tmpDir, 'wiki');
    const generated = await new WikiService(client as any, scanResult).buildWiki(wikiDir, { noLlm: true });
    expect(generated).toContain('02-architecture/data-flow.md');

    const page = readFileSync(join(wikiDir, '02-architecture', 'data-flow.md'), 'utf-8');
    // 规则路径同样输出数据形态证据，而不是纯调用边表
    expect(page).toContain('## 数据阶段');
    expect(page).toContain('## 阶段转换');
    expect(page).toContain('scanResult');
    expect(page).toContain('ScanResult');
    expect(page).toContain('src/cli/index.ts:121');
    expect(page).toContain('src/services/wiki-service.ts:96');
    expect(page).not.toContain('调用边表');
    // README 索引包含本届产出的 data-flow 页（无死链）
    const readme = readFileSync(join(wikiDir, 'README.md'), 'utf-8');
    expect(readme).toContain('data-flow.md');
  });
});
