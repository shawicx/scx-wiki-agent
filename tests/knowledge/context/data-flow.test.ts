import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import type { QueryResult } from '../../../src/mcp/types.js';
import { makeScanResult } from './helpers.js';
  describe('buildDataFlowContext', () => {
    /** BFS Cypher（与实现同构：r.line 是调用点，callee.start_line 是定义点） */
    const bfsCypher = (names: string[]) => `MATCH (caller)-[r:CALLS]->(callee)
         WHERE caller.name IN [${names.map(n => `"${n}"`).join(',')}]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, caller.file_path AS callerFile,
                callee.name AS callee, callee.file_path AS file, callee.label AS label,
                callee.start_line AS calleeLine, r.line AS callLine, r.args AS args,
                r.confidence AS confidence, r.strategy AS strategy
         LIMIT 40`;
    const symbolCypher = (files: string[]) => `MATCH (n) WHERE n.file_path IN [${files.map(f => `"${f}"`).join(',')}]
           AND n.is_test = false
           AND n.label IN ['Function', 'Method', 'Class']
         RETURN n.name AS name, n.file_path AS file, n.label AS label,
                n.signature AS sig, n.return_type AS rt, n.param_types AS pt,
                n.param_names AS pn, n.start_line AS sl, n.end_line AS el, n.docstring AS doc
         LIMIT 200`;
    const typeCypher = (files: string[]) => `MATCH (n) WHERE n.file_path IN [${files.map(f => `"${f}"`).join(',')}]
           AND n.is_test = false
           AND n.label IN ['Interface', 'Type', 'Enum', 'Class']
         RETURN n.name AS name, n.label AS label, n.file_path AS file,
                n.start_line AS sl, n.end_line AS el
         LIMIT 60`;

    it('从 entry_points + CALLS 边构建真实调用序列，调用点与定义点锚点分离', () => {
      const queryResults = new Map<string, QueryResult>([
        [bfsCypher(['registerBuildCommand']), {
          columns: ['caller', 'callerFile', 'callee', 'file', 'label', 'calleeLine', 'callLine', 'args', 'confidence', 'strategy'],
          rows: [
            // r.line = 调用点；calleeLine = 定义点；二者必须分开透传
            ['registerBuildCommand', 'src/cli/commands/build.ts', 'FileScanner', 'src/core/scanner.ts', 'Class', 67, 111, '', '0.95', 'import_map'],
            ['registerBuildCommand', 'src/cli/commands/build.ts', 'WikiService', 'src/services/wiki-service.ts', 'Class', 19, 118, '', '0.95', 'import_map'],
            ['registerBuildCommand', 'src/cli/commands/build.ts', 'CodebaseMemoryClient', 'src/mcp/codebase-memory-client.ts', 'Class', 24, 119, '', '0.90', 'same_module'],
          ],
          total: 3,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildDataFlowContext();

      expect(ctx.sequences.length).toBeGreaterThan(0);
      const seq = ctx.sequences[0];
      expect(seq.name).toBe('registerBuildCommand');
      expect(seq.messages.length).toBe(3);
      // 每条消息的 from 都是真实 caller（registerBuildCommand），不是线性串联
      expect(seq.messages.every(m => m.from === 'registerBuildCommand')).toBe(true);
      expect(seq.participants.length).toBe(4); // entry + 3 callees
      // 调用点锚点 = r.line（调用行），不再是 callee 定义行
      expect(seq.messages.map(m => m.callLine)).toEqual([111, 118, 119]);
      expect(seq.messages.map(m => m.callFile)).toEqual([
        'src/cli/commands/build.ts', 'src/cli/commands/build.ts', 'src/cli/commands/build.ts',
      ]);
      // callee 定义锚点单独保留，两套锚点不得混用
      expect(seq.messages.map(m => m.calleeLine)).toEqual([67, 19, 24]);
      expect(seq.messages.map(m => m.calleeFile)).toEqual([
        'src/core/scanner.ts', 'src/services/wiki-service.ts', 'src/mcp/codebase-memory-client.ts',
      ]);
      // 边属性透传：confidence 由字符串归一为数字，strategy 保留
      expect(seq.messages.map(m => m.confidence)).toEqual([0.95, 0.95, 0.9]);
      expect(seq.messages.map(m => m.strategy)).toEqual(['import_map', 'import_map', 'same_module']);
      // createProgram 不是 registerBuildCommand 链的参与者，不产生额外序列
      expect(ctx.sequences.filter(s => s.name === 'FileScanner').length).toBe(0);
    });

    it('CALLS.args 解析为 DataValueShape，签名与实参合并进阶段输入', () => {
      const files = ['src/cli/commands/build.ts', 'src/services/wiki-service.ts'];
      const queryResults = new Map<string, QueryResult>([
        [bfsCypher(['runScan']), {
          columns: ['caller', 'callerFile', 'callee', 'file', 'label', 'calleeLine', 'callLine', 'args', 'confidence', 'strategy'],
          rows: [
            // r.args 在真实 MCP 返回中是 JSON 字符串（空字符串表示无实参）
            ['runScan', files[0], 'buildWiki', files[1], 'Method', 96, 121, '[{"i":0,"e":"scanResult"}]', '0.95', 'lsp_ts_method'],
          ],
          total: 1,
        }],
        [symbolCypher(files), {
          columns: ['name', 'file', 'label', 'sig', 'rt', 'pt', 'pn', 'sl', 'el', 'doc'],
          rows: [
            ['buildWiki', files[1], 'Method', '(scanResult: ScanResult)', ': string[]', '["ScanResult"]', '["scanResult"]', 96, 130, '构建 wiki'],
          ],
          total: 1,
        }],
        [typeCypher(files), {
          columns: ['name', 'label', 'file', 'sl', 'el'],
          rows: [['ScanResult', 'Interface', files[1], 96, 100]],
          total: 1,
        }],
      ]);
      const client = createMockClient({
        queryResults,
        architecture: {
          total_nodes: 3, total_edges: 2, node_labels: [], edge_types: [],
          languages: [], packages: [],
          entry_points: [{ name: 'runScan', qualified_name: 'proj.runScan', file: files[0] }],
          hotspots: [], boundaries: [], layers: [], clusters: [],
        },
      });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildDataFlowContext();

      // 转换边：调用点/定义点分离 + 实参表达式
      expect(ctx.transitions.length).toBe(1);
      const t = ctx.transitions[0];
      expect(t.callFile).toBe(files[0]);
      expect(t.callLine).toBe(121);
      expect(t.calleeDefinition).toBe(`${files[1]}:96`);
      expect(t.args.map(a => a.expression)).toEqual(['scanResult']);
      expect(t.args[0].evidence).toBe('call-argument');

      // 阶段输入同时保留「调用时传的是什么」与「函数声明接收什么」
      const stage = ctx.stages.find(s => s.symbol === 'buildWiki');
      expect(stage).toBeDefined();
      const input = stage!.inputs.find(s => s.expression === 'scanResult');
      expect(input?.type).toBe('ScanResult');
      expect(input?.anchor).toBe(`${files[0]}:121`);
      // 输出为显式返回类型
      expect(stage!.outputs.map(s => s.type)).toContain('string[]');
      expect(stage!.evidenceKinds).toContain('signature');
      // 本地类型定义进入 typeDefinitions（定义体不可读时保留名称与锚点，不伪造）
      expect(ctx.typeDefinitions.map(d => d.name)).toContain('ScanResult');
      expect(ctx.typeDefinitions[0].kind).toBe('interface');
      expect(ctx.shapeCoverage.dataBearingTransitions).toBe(1);
    });

    it('无任何数据形态证据时不产生带证据转换（服务层按覆盖率整页剔除）', () => {
      const queryResults = new Map<string, QueryResult>([
        [bfsCypher(['createProgram']), {
          columns: ['caller', 'callerFile', 'callee', 'file', 'label', 'calleeLine', 'callLine', 'args', 'confidence', 'strategy'],
          rows: [
            ['createProgram', 'src/cli/index.ts', 'ScanService', 'src/services/scan-service.ts', 'Class', 3, 4, '', '', ''],
          ],
          total: 1,
        }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildDataFlowContext();

      expect(ctx.sequences.length).toBe(1);
      expect(ctx.shapeCoverage.dataBearingTransitions).toBe(0);
      expect(ctx.shapeCoverage.controlOnlyTransitions).toBe(1);
      expect(ctx.transitions.length).toBe(0);
      // 入口符号本身仍可成阶段（排序锚点），但必须诚实标注无数据形态证据
      const entryStage = ctx.stages.find(s => s.symbol === 'createProgram');
      expect(entryStage?.role).toBe('entry');
      expect(entryStage?.dataShapeKnown).toBe(false);
    });
  });
