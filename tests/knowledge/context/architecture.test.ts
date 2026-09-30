import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import type { QueryResult } from '../../../src/mcp/types.js';
import { makeScanResult, scannedFile, packageSymbolCypher, symbolRow } from './helpers.js';
  describe('buildArchitectureContext', () => {
    it('包含 MCP 的 layers/boundaries/clusters', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        files: ['src/core/a.ts', 'src/services/a.ts', 'src/cli/a.ts']
          .map(f => scannedFile('/tmp/test-project', f)),
      }));
      const ctx = builder.buildArchitectureContext();

      expect(ctx.layers).toBeDefined();
      expect(ctx.layers!.length).toBeGreaterThan(0);
      expect(ctx.boundaries).toBeDefined();
      expect(ctx.boundaries!.length).toBeGreaterThan(0);
      expect(ctx.clusters).toBeDefined();
    });

    it('modules 来自 packages', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        files: ['src/core/a.ts', 'src/services/a.ts', 'src/cli/a.ts']
          .map(f => scannedFile('/tmp/test-project', f)),
      }));
      const ctx = builder.buildArchitectureContext();

      expect(ctx.modules.length).toBe(3); // core, services, cli
      expect(ctx.modules.map(m => m.name)).toContain('core');
    });

    it('interModuleRelations 来自 boundaries', () => {
      const client = createMockClient();
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        files: ['src/core/a.ts', 'src/services/a.ts', 'src/cli/a.ts']
          .map(f => scannedFile('/tmp/test-project', f)),
      }));
      const ctx = builder.buildArchitectureContext();

      expect(ctx.interModuleRelations.length).toBe(2);
      expect(ctx.interModuleRelations[0].source).toBe('services');
    });

    it('分包查询符号：每个生产包都有代表符号，且 Architecture/Modules 复用缓存', () => {
      const rootDir = '/tmp/test-project';
      const packageFiles = {
        alpha: ['src/alpha/a.ts'],
        beta: ['src/beta/b.ts'],
        gamma: ['src/gamma/c.ts'],
      };
      const architecture = {
        ...createMockClient().getArchitecture(),
        packages: [
          { name: 'alpha', node_count: 10, fan_in: 0, fan_out: 0 },
          { name: 'beta', node_count: 2, fan_in: 0, fan_out: 0 },
          { name: 'gamma', node_count: 1, fan_in: 0, fan_out: 0 },
        ],
        boundaries: [],
        layers: [],
      };
      const queryResults = new Map<string, QueryResult>(
        Object.entries(packageFiles).map(([name, files]) => [
          packageSymbolCypher(files),
          {
            columns: [],
            rows: [symbolRow(`${name}Symbol`, files[0], 10, name === 'alpha' ? 100 : 1)],
            total: 1,
          },
        ]),
      );
      const client = createMockClient({ architecture, queryResults });
      const scan = makeScanResult({
        rootDir,
        files: Object.values(packageFiles).flat().map(f => scannedFile(rootDir, f)),
      });
      const builder = new WikiContextBuilder(client as any, scan);

      const architectureContext = builder.buildArchitectureContext();
      expect(architectureContext.modules.map(m => m.name)).toEqual(['alpha', 'beta', 'gamma']);
      for (const module of architectureContext.modules) {
        expect(module.symbols).toHaveLength(1);
      }
      expect(client.queryGraph).toHaveBeenCalledTimes(3);
      expect(client.queryGraph.mock.calls.every(([cypher]) => cypher.includes('n.file_path IN')));
      expect(client.queryGraph.mock.calls.some(([cypher]) => /LIMIT 50/.test(cypher))).toBe(false);

      const modulesContext = builder.buildModulesContext();
      expect(modulesContext.modules.map(m => m.name)).toEqual(['alpha', 'beta', 'gamma']);
      expect(client.queryGraph).toHaveBeenCalledTimes(3);
      expect(client.getArchitecture).toHaveBeenCalledTimes(1);
    });

    it('分包符号为空时也缓存，Architecture/Modules 不重复查询', () => {
      const rootDir = '/tmp/test-project';
      const files = ['src/empty/a.ts'];
      const architecture = {
        ...createMockClient().getArchitecture(),
        packages: [{ name: 'empty', node_count: 1, fan_in: 0, fan_out: 0 }],
        boundaries: [],
        layers: [],
      };
      const client = createMockClient({ architecture });
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        rootDir,
        files: files.map(f => scannedFile(rootDir, f)),
      }));

      const architectureContext = builder.buildArchitectureContext();
      const modulesContext = builder.buildModulesContext();
      expect(architectureContext.modules[0].symbols).toEqual([]);
      expect(modulesContext.modules[0].symbols).toEqual([]);
      expect(client.queryGraph).toHaveBeenCalledTimes(1);
    });

    it('文件级公平采样：低复杂度文件不被同包高复杂度文件挤占', () => {
      const rootDir = '/tmp/test-project';
      const files = ['src/fair/a.ts', 'src/fair/b.ts'];
      const queryResults = new Map<string, QueryResult>([
        [packageSymbolCypher(files), {
          columns: [],
          rows: [
            ...Array.from({ length: 10 }, (_, i) => symbolRow(`strong${i}`, files[0], i + 1, 100 - i)),
            symbolRow('representativeQuiet', files[1], 1, 1),
          ],
          total: 11,
        }],
      ]);
      const architecture = {
        ...createMockClient().getArchitecture(),
        packages: [{ name: 'fair', node_count: 11, fan_in: 0, fan_out: 0 }],
        boundaries: [],
        layers: [],
      };
      const client = createMockClient({ architecture, queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        rootDir,
        files: files.map(f => scannedFile(rootDir, f)),
      }));

      const architectureContext = builder.buildArchitectureContext();
      const modulesContext = builder.buildModulesContext();
      expect(architectureContext.modules[0].symbols).toHaveLength(6);
      expect(architectureContext.modules[0].symbols.some(s => s.name === 'representativeQuiet')).toBe(true);
      expect(modulesContext.modules[0].symbols).toHaveLength(6);
      expect(modulesContext.modules[0].symbols.some(s => s.name === 'representativeQuiet')).toBe(true);
    });

    it('过滤无法映射到生产文件的测试/fixture/helpers 包及其依赖边', () => {
      const rootDir = '/tmp/test-project';
      const files = ['src/core/a.ts', 'tests/helpers/a.ts', 'tests/fixtures/a.ts'];
      const architecture = {
        ...createMockClient().getArchitecture(),
        packages: [
          { name: 'core', node_count: 3, fan_in: 1, fan_out: 1 },
          { name: 'fixtures', node_count: 1, fan_in: 0, fan_out: 1 },
          { name: 'helpers', node_count: 1, fan_in: 1, fan_out: 0 },
        ],
        boundaries: [
          { from: 'core', to: 'fixtures', call_count: 2 },
          { from: 'helpers', to: 'core', call_count: 3 },
          { from: 'core', to: 'core', call_count: 4 },
        ],
        layers: [
          { name: 'core', layer: 'core', reason: 'production core' },
          { name: 'fixtures', layer: 'test', reason: 'fixture' },
          { name: 'helpers', layer: 'test', reason: 'helper' },
        ],
      };
      const queryResults = new Map<string, QueryResult>([
        [packageSymbolCypher(['src/core/a.ts']), {
          columns: [],
          rows: [symbolRow('coreSymbol', 'src/core/a.ts', 3, 5)],
          total: 1,
        }],
      ]);
      const client = createMockClient({ architecture, queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        rootDir,
        files: files.map(f => scannedFile(rootDir, f)),
      }));

      const architectureContext = builder.buildArchitectureContext();
      const modulesContext = builder.buildModulesContext();
      expect(architectureContext.modules.map(m => m.name)).toEqual(['core']);
      expect(modulesContext.modules.map(m => m.name)).toEqual(['core']);
      expect(architectureContext.layers?.map(l => l.name)).toEqual(['core']);
      expect(architectureContext.boundaries?.map(b => `${b.from}->${b.to}`)).toEqual(['core->core']);
      expect(architectureContext.interModuleRelations.map(r => `${r.source}->${r.target}`)).toEqual(['core->core']);
    });

    it('模块语言分布来自全部生产扫描文件，而不是被采样符号推导', () => {
      const rootDir = '/tmp/test-project';
      const files = ['src/poly/a.ts', 'src/poly/native.rs'];
      const architecture = {
        ...createMockClient().getArchitecture(),
        packages: [{ name: 'poly', node_count: 1, fan_in: 0, fan_out: 0 }],
        boundaries: [],
        layers: [],
      };
      const queryResults = new Map<string, QueryResult>([
        [packageSymbolCypher([files[0]]), {
          columns: [],
          rows: [symbolRow('tsSymbol', files[0], 2, 5)],
          total: 1,
        }],
      ]);
      const client = createMockClient({ architecture, queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        rootDir,
        files: files.map(f => scannedFile(rootDir, f)),
      }));

      const ctx = builder.buildArchitectureContext();
      expect(ctx.modules[0].languages).toEqual([
        { language: 'ts', fileCount: 1 },
        { language: 'rust', fileCount: 1 },
      ]);
      expect(ctx.modules[0].fileCount).toBe(2);
    });
  });

  describe('buildModulesContext 大仓库分组', () => {
    it('单文件符号再多时，Modules 每文件最多贡献 5 个代表符号', () => {
      const rootDir = '/tmp/test-project';
      const files = ['src/one/a.ts'];
      const queryResults = new Map<string, QueryResult>([
        [packageSymbolCypher(files), {
          columns: [],
          rows: Array.from({ length: 10 }, (_, i) => symbolRow(`symbol${i}`, files[0], i + 1, 20 - i)),
          total: 10,
        }],
      ]);
      const architecture = {
        ...createMockClient().getArchitecture(),
        packages: [{ name: 'one', node_count: 10, fan_in: 0, fan_out: 0 }],
        boundaries: [],
        layers: [],
      };
      const client = createMockClient({ architecture, queryResults });
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        rootDir,
        files: files.map(f => scannedFile(rootDir, f)),
      }));

      const ctx = builder.buildModulesContext();
      expect(ctx.modules[0].symbols).toHaveLength(5);
      expect(ctx.modules[0].symbols.every(s => s.file === files[0])).toBe(true);
    });

    it('模块数超过 12 时详述前 12、其余聚合为概要', () => {
      const rootDir = '/tmp/test-project';
      const manyPackages = Array.from({ length: 15 }, (_, i) => ({
        name: `mod${i}`, node_count: 2, fan_in: 0, fan_out: 1,
      }));
      const client = createMockClient({
        architecture: {
          total_nodes: 30, total_edges: 10,
          node_labels: [], edge_types: [], languages: [],
          packages: manyPackages,
          entry_points: [], hotspots: [], boundaries: [], layers: [], clusters: [],
        },
      });
      const files = manyPackages.flatMap(p =>
        [`src/${p.name}/a.ts`, `src/${p.name}/b.ts`].map(f => scannedFile(rootDir, f)));
      const builder = new WikiContextBuilder(client as any, makeScanResult({
        rootDir,
        files,
      }));
      const ctx = builder.buildModulesContext();

      expect(ctx.modules.length).toBe(12);
      expect(ctx.otherModules).toBeDefined();
      expect(ctx.otherModules!.length).toBe(3);
      expect(ctx.otherModules!.map(m => m.name)).toEqual(['mod12', 'mod13', 'mod14']);
      expect(ctx.otherModules!.every(m => m.fileCount === 2)).toBe(true);
      expect(ctx.otherModules!.every(m => m.symbolCount === 2)).toBe(true);
    });
  });
