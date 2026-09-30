import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { ConfigDetector } from '../../../src/knowledge/config-detector.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { makeScanResult } from './helpers.js';
  describe('buildOnboardingContext CLI 命令启发式门控', () => {
    const archWithComposable = {
      total_nodes: 10, total_edges: 10, node_labels: [], edge_types: [],
      languages: [{ language: 'TypeScript', file_count: 5 }],
      packages: [{ name: 'components', node_count: 5, fan_in: 1, fan_out: 1 }],
      entry_points: [
        { name: 'openCreateQuickCommandGroup', qualified_name: 'p.openCreateQuickCommandGroup', file: 'src/components/settings/useGroupNameDialog.ts' },
      ],
      hotspots: [], boundaries: [], layers: [], clusters: [],
    };

    it('frontend 项目不把 composable（名含 Command）当 CLI 命令', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'onboard-'));
      try {
        writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'web' }));
        const scan = makeScanResult({
          rootDir: tmp,
          projectType: 'frontend',
          files: [
            { absolutePath: join(tmp, 'src/components/settings/useGroupNameDialog.ts'), relativePath: 'src/components/settings/useGroupNameDialog.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
          ],
        });
        const builder = new WikiContextBuilder(createMockClient({ architecture: archWithComposable }) as any, scan, new ConfigDetector(tmp));
        const ctx = builder.buildOnboardingContext();

        expect(ctx.cliCommands).toEqual([]);
        // 非命令式项目首次运行示例不再拼 node dist/bin.js <command>
        expect(ctx.firstRunExample).not.toContain('node dist/bin.js');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('cli 项目照常派生命令名，并登记入断言校验 universe', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'onboard-'));
      try {
        writeFileSync(join(tmp, 'package.json'), JSON.stringify({ name: 'cli', scripts: { build: 'tsc' } }));
        const scan = makeScanResult({
          rootDir: tmp,
          projectType: 'cli',
          files: [
            { absolutePath: join(tmp, 'src/cli/commands/build.ts'), relativePath: 'src/cli/commands/build.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
          ],
        });
        const arch = {
          ...archWithComposable,
          entry_points: [{ name: 'registerBuildCommand', qualified_name: 'p.registerBuildCommand', file: 'src/cli/commands/build.ts' }],
        };
        const builder = new WikiContextBuilder(createMockClient({ architecture: arch }) as any, scan, new ConfigDetector(tmp));
        const ctx = builder.buildOnboardingContext();

        expect(ctx.cliCommands.map(c => c.name)).toContain('build');
        expect(builder.getFallbackSymbolNames().has('build')).toBe(true);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
