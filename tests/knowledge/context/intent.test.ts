import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WikiContextBuilder } from '../../../src/knowledge/wiki-context-builder.js';
import { ConfigDetector } from '../../../src/knowledge/config-detector.js';
import { IntentEvidenceProvider } from '../../../src/knowledge/intent-evidence.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { makeScanResult } from './helpers.js';
  describe('意图证据接线（intent-evidence 集成）', () => {
    it('overview/architecture/modules 注入 intent 与 fanIn/fanOut；layers 消费侧过滤脏行', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'intent-wire-'));
      try {
        mkdirSync(join(tmp, 'src/core'), { recursive: true });
        writeFileSync(join(tmp, 'src/index.ts'), '// CLI 入口：注册三个命令\nexport const main = 1;\n');
        writeFileSync(join(tmp, 'src/core/scanner.ts'), '// 扫描器：递归遍历并识别技术栈\nexport const A = 1;\n');
        const scan = makeScanResult({
          rootDir: tmp,
          files: [
            { absolutePath: join(tmp, 'src/index.ts'), relativePath: 'src/index.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
            { absolutePath: join(tmp, 'src/core/scanner.ts'), relativePath: 'src/core/scanner.ts', language: 'typescript' as const, extension: '.ts', size: 50 },
          ],
        });
        const arch = {
          ...createMockClient().getArchitecture(),
          layers: [
            { name: 'core', layer: 'core', reason: 'high fan-in' },
            { name: '', layer: 'api', reason: 'has HTTP route definitions' },
            { name: 'ts', layer: 'api', reason: 'has HTTP route definitions' },
          ],
          clusters: [{ id: 0, label: 'src', members: 3, cohesion: 0.87, top_nodes: ['a'] }],
        };
        const provider = new IntentEvidenceProvider(scan, { runGit: () => null });
        const builder = new WikiContextBuilder(createMockClient({ architecture: arch }) as any, scan, new ConfigDetector(tmp));
        builder.setIntentProvider(provider);

        const overview = builder.buildOverviewContext();
        expect(overview.intent?.some(e => e.kind === 'file-header')).toBe(true);

        const architecture = builder.buildArchitectureContext();
        expect(architecture.layers?.map(l => l.name)).toEqual(['core']);
        expect(architecture.clusters?.[0].cohesion).toBeCloseTo(0.87);
        const coreModule = architecture.modules.find(m => m.name === 'core')!;
        expect(coreModule.fanIn).toBe(3);
        expect(coreModule.fanOut).toBe(1);
        expect(coreModule.intent?.some(e => e.kind === 'file-header')).toBe(true);

        const modules = builder.buildModulesContext();
        expect(modules.modules.find(m => m.name === 'core')?.intent).toBeDefined();
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });

    it('decisions：无 provider 返回 null；证据全缺返回 null；有 git 证据时成上下文', () => {
      const tmp = mkdtempSync(join(tmpdir(), 'intent-dec-'));
      try {
        mkdirSync(join(tmp, 'src/core'), { recursive: true });
        writeFileSync(join(tmp, 'src/core/a.ts'), 'export const A = 1;\n');
        const scan = makeScanResult({
          rootDir: tmp,
          files: [
            { absolutePath: join(tmp, 'src/core/a.ts'), relativePath: 'src/core/a.ts', language: 'typescript' as const, extension: '.ts', size: 30 },
          ],
        });
        const client = createMockClient();
        const noProvider = new WikiContextBuilder(client as any, scan, new ConfigDetector(tmp));
        expect(noProvider.buildDecisionsContext()).toBeNull();

        const emptyProvider = new IntentEvidenceProvider(scan, { runGit: () => null });
        const withEmpty = new WikiContextBuilder(client as any, scan, new ConfigDetector(tmp));
        withEmpty.setIntentProvider(emptyProvider);
        expect(withEmpty.buildDecisionsContext()).toBeNull();

        const log = 'aaaa1111bbbb2222cccc3333dddd4444\t2026-06-01\tinit scanner\n';
        const gitProvider = new IntentEvidenceProvider(scan, {
          runGit: args => (args[0] === 'rev-parse' ? 'HEAD\n' : args[0] === 'log' ? log : null),
        });
        const withGit = new WikiContextBuilder(client as any, scan, new ConfigDetector(tmp));
        withGit.setIntentProvider(gitProvider);
        const ctx = withGit.buildDecisionsContext();
        expect(ctx).not.toBeNull();
        expect(ctx!.gitTimeline.length).toBe(1);
        expect(ctx!.gitTimeline[0].first!.subject).toBe('init scanner');
        expect(ctx!.hotFileChurn.map(c => c.file)).toContain('src/core/a.ts');
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
