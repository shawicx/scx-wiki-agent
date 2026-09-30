import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { makeScanResult } from './helpers.js';
  describe('buildApiContext', () => {
    it('只有 register*/*Command 入口标为命令，普通导出函数归入导出函数表', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildApiContext();

      // mock entry_points: registerBuildCommand + createProgram（非命令）
      expect(ctx.commands.length).toBe(1);
      expect(ctx.commands[0].name).toBe('registerBuildCommand');
      // createProgram 是无调用者的导出符号，应出现在导出函数表而非命令表
      expect(ctx.commands.map(c => c.name)).not.toContain('createProgram');
      expect(ctx.exportedFunctions.map(f => f.name)).toContain('createProgram');
    });

    it('命令描述从 commander 源码 .command(name, desc) 提取（docstring 缺失时兜底）', () => {
      const client = createMockClient({
        codeSnippet: {
          name: 'registerBuildCommand',
          qualified_name: 'proj.registerBuildCommand',
          label: 'Function',
          file_path: 'src/cli/commands/build.ts',
          start_line: 9,
          end_line: 20,
          source: `export function registerBuildCommand(program: Command) {\n  program\n    .command('build', 'Generate wiki documentation from codebase knowledge graph')\n    .option('--no-llm', 'Generate wiki without LLM');\n}`,
        },
      });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildApiContext();

      expect(ctx.commands[0].description).toBe('Generate wiki documentation from codebase knowledge graph');
      expect(ctx.commands[0].startLine).toBe(9);
    });

    it('链式 .description(desc) 风格同样可提取（本仓库实际风格）', () => {
      const client = createMockClient({
        codeSnippet: {
          name: 'registerBuildCommand',
          qualified_name: 'proj.registerBuildCommand',
          label: 'Function',
          file_path: 'src/cli/commands/build.ts',
          start_line: 9,
          end_line: 21,
          source: `export function registerBuildCommand(program: Command) {\n  program\n    .command('build')\n    .description('Generate wiki documentation from codebase knowledge graph')\n    .option('--no-llm', 'Generate wiki without LLM (pure rules)');\n}`,
        },
      });
      const builder = new WikiContextBuilder(client as any, makeScanResult());
      const ctx = builder.buildApiContext();

      expect(ctx.commands[0].description).toBe('Generate wiki documentation from codebase knowledge graph');
    });
  });
