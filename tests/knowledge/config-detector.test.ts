import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigDetector } from '../../src/knowledge/config-detector.js';

describe('ConfigDetector', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cfg-det-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('detectEnvironment', () => {
    it('从 package.json 提取 scripts 和 type', () => {
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
        name: 'test-pkg',
        version: '1.0.0',
        type: 'module',
        scripts: { build: 'tsup', test: 'vitest run' },
      }));
      const detector = new ConfigDetector(tempDir);
      const env = detector.detectEnvironment();
      expect(env.packageName).toBe('test-pkg');
      expect(env.runtime).toBe('ESM');
      expect(env.scripts.build).toBe('tsup');
      expect(env.scripts.test).toBe('vitest run');
    });

    it('从 .nvmrc 提取 Node 版本', () => {
      writeFileSync(join(tempDir, '.nvmrc'), '20.10.0\n');
      const detector = new ConfigDetector(tempDir);
      const env = detector.detectEnvironment();
      expect(env.nodeVersion).toBe('20.10.0');
    });

    it('从 pnpm-lock.yaml 推断包管理器', () => {
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
      const detector = new ConfigDetector(tempDir);
      const env = detector.detectEnvironment();
      expect(env.packageManager).toBe('pnpm');
    });

    it('从源码 process.env 提取环境变量', () => {
      mkdirSync(join(tempDir, 'src'));
      writeFileSync(join(tempDir, 'src/index.ts'),
        'const key = process.env.API_KEY;\nconst url = process.env.BASE_URL;');
      const detector = new ConfigDetector(tempDir);
      const env = detector.detectEnvironment();
      expect(env.envVars.map(v => v.name)).toContain('API_KEY');
      expect(env.envVars.map(v => v.name)).toContain('BASE_URL');
    });
  });

  describe('detectConventions', () => {
    it('无 eslint 配置时 hasLinter=false', () => {
      const detector = new ConfigDetector(tempDir);
      const conv = detector.detectConventions();
      expect(conv.hasLinter).toBe(false);
    });

    it('检测到 AGENTS.md 时提取内容', () => {
      writeFileSync(join(tempDir, 'AGENTS.md'), '# Agents\n## Commands\npnpm test');
      const detector = new ConfigDetector(tempDir);
      const conv = detector.detectConventions();
      expect(conv.agentsMd).toContain('Commands');
    });
  });

  describe('detectTesting', () => {
    it('从 vitest.config 推断框架', () => {
      writeFileSync(join(tempDir, 'vitest.config.ts'),
        'export default { test: { globals: true } };');
      const detector = new ConfigDetector(tempDir);
      const testing = detector.detectTesting();
      expect(testing.framework).toBe('vitest');
    });

    it('探测 tests/ 目录', () => {
      mkdirSync(join(tempDir, 'tests'));
      mkdirSync(join(tempDir, 'tests', 'fixtures'));
      const detector = new ConfigDetector(tempDir);
      const testing = detector.detectTesting();
      expect(testing.testDirs).toContain('tests');
      expect(testing.fixturesDir).toContain('fixtures');
    });
  });

  describe('detectConstraints', () => {
    it('从源码提取 MAX/LIMIT/TIMEOUT 常量', () => {
      mkdirSync(join(tempDir, 'src'));
      writeFileSync(join(tempDir, 'src/config.ts'),
        'const MAX_DEPTH = 3;\nconst TIMEOUT_MS = 60000;\nconst UNRELATED = "hello";');
      const detector = new ConfigDetector(tempDir);
      const cons = detector.detectConstraints();
      const names = cons.constants.map(c => c.name);
      expect(names).toContain('MAX_DEPTH');
      expect(names).toContain('TIMEOUT_MS');
      expect(names).not.toContain('UNRELATED');
    });
  });
});
