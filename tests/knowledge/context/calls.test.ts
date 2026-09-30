import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import type { QueryResult } from '../../../src/mcp/types.js';
import { makeScanResult } from './helpers.js';
  describe('buildCallsContext', () => {
    const methodCypher = (names: string) =>
      `MATCH (a:Method)-[:CALLS]->(b) WHERE a.name IN [${names}] AND a.is_test = false AND b.is_test = false
         RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT 40`;
    const functionCypher = (names: string) =>
      `MATCH (a:Function)-[:CALLS]->(b) WHERE a.name IN [${names}] AND a.is_test = false AND b.is_test = false
         RETURN a.name AS caller, a.file_path AS callerFile, b.name AS callee, b.file_path AS file, b.start_line AS line, b.parent_class AS parent LIMIT 40`;
    const edgeRow = (caller: string, callerFile: string, callee: string, calleeFile: string, line: number): any[] =>
      [caller, callerFile, callee, calleeFile, line, null];

    it('调用边按组内去重：多个入口共享的中游边在每个入口组都保留', () => {
      const queryResults = new Map<string, QueryResult>([
        [methodCypher('"registerBuildCommand"'), { columns: [], rows: [edgeRow('registerBuildCommand', 'src/cli/commands/build.ts', 'midCall', 'src/core/mid.ts', 10)], total: 1 }],
        [methodCypher('"createProgram"'), { columns: [], rows: [edgeRow('createProgram', 'src/cli/index.ts', 'midCall', 'src/core/mid.ts', 20)], total: 1 }],
        [methodCypher('"midCall"'), { columns: [], rows: [edgeRow('midCall', 'src/core/mid.ts', 'sharedUtil', 'src/core/util.ts', 30)], total: 1 }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildCallsContext();

      expect(ctx.groups.length).toBe(2);
      expect(ctx.groups.map(g => g.entry)).toEqual(['registerBuildCommand', 'createProgram']);
      expect(ctx.groups.every(g => g.kind === 'entry')).toBe(true);
      // 共享的中游边在两个入口组都保留（旧版跨组全局去重会饿死第二个入口组）
      for (const g of ctx.groups) {
        expect(g.edges.some(e => e.callee === 'sharedUtil')).toBe(true);
      }
    });

    it('入口查无边时以高扇入热点锚定回填（kind=hotspot）', () => {
      const fileCypher = `MATCH (n) WHERE n.name IN ["build","init"] AND n.is_test = false
       RETURN n.name AS name, n.file_path AS file LIMIT 15`;
      const queryResults = new Map<string, QueryResult>([
        [fileCypher, { columns: [], rows: [['build', 'src/core/build.ts'], ['init', 'src/core/init.ts']], total: 2 }],
        [methodCypher('"build"'), { columns: [], rows: [edgeRow('build', 'src/core/build.ts', 'helper', 'src/core/helper.ts', 12)], total: 1 }],
        [methodCypher('"init"'), { columns: [], rows: [edgeRow('init', 'src/core/init.ts', 'helper2', 'src/core/helper2.ts', 22)], total: 1 }],
      ]);
      const client = createMockClient({ queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildCallsContext();

      // mock 入口无 CALLS 边 → 全部组来自热点回填
      expect(ctx.groups.length).toBe(2);
      expect(ctx.groups.every(g => g.kind === 'hotspot')).toBe(true);
      expect(ctx.groups.map(g => g.entry)).toEqual(['build', 'init']);
      expect(ctx.fanIn.map(f => f.symbol)).toEqual(['build', 'init']);
      expect(ctx.fanIn.every(f => f.file !== '')).toBe(true);
    });

    it('Tauri 项目附加 IPC 命令对表（真实跨语言执行边）', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'calls-ipc-'));
      try {
        mkdirSync(join(tmp, 'src'), { recursive: true });
        mkdirSync(join(tmp, 'src-tauri', 'src'), { recursive: true });
        writeFileSync(join(tmp, 'src-tauri', 'tauri.conf.json'), '{}');
        writeFileSync(join(tmp, 'src', 'store.ts'), "import { invoke } from '@tauri-apps/api/core'\nawait invoke('history_list')\n");
        writeFileSync(join(tmp, 'src-tauri', 'src', 'cmd.rs'), '#[tauri::command]\nfn history_list() {}\n');

        const scan = makeScanResult({
          rootDir: tmp,
          files: [
            { absolutePath: join(tmp, 'src/store.ts'), relativePath: 'src/store.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
            { absolutePath: join(tmp, 'src-tauri/src/cmd.rs'), relativePath: 'src-tauri/src/cmd.rs', language: 'rust' as const, extension: '.rs', size: 50 },
          ],
        });
        const builder = new WikiContextBuilder(createMockClient() as any, scan);
        const ctx = builder.buildCallsContext();

        expect(ctx.ipc).toBeDefined();
        expect(ctx.ipc!.commands.length).toBe(1);
        expect(ctx.ipc!.commands[0].name).toBe('history_list');
        expect(ctx.ipc!.commands[0].rustDef?.file).toBe('src-tauri/src/cmd.rs');
        expect(ctx.ipc!.commands[0].frontendCalls[0].file).toBe('src/store.ts');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
