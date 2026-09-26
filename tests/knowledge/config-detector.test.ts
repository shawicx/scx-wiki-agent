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

    it('从 bun.lock 推断包管理器（lockfile 优先级：packageManager 字段 > bun > pnpm > yarn > npm）', () => {
      writeFileSync(join(tempDir, 'bun.lock'), '');
      let detector = new ConfigDetector(tempDir);
      expect(detector.detectEnvironment().packageManager).toBe('bun');

      rmSync(join(tempDir, 'bun.lock'));
      writeFileSync(join(tempDir, 'bun.lockb'), '');
      detector = new ConfigDetector(tempDir);
      expect(detector.detectEnvironment().packageManager).toBe('bun');

      // packageManager 字段最优先
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ packageManager: 'bun@1.4.1' }));
      writeFileSync(join(tempDir, 'pnpm-lock.yaml'), '');
      expect(detector.detectEnvironment().packageManager).toBe('bun');
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

    it('检测 .oxlintrc.json 配置', () => {
      writeFileSync(join(tempDir, '.oxlintrc.json'), '{"rules":{}}');
      const detector = new ConfigDetector(tempDir);
      const conv = detector.detectConventions();
      expect(conv.hasLinter).toBe(true);
      expect(conv.linterConfig).toBe('.oxlintrc.json');
    });

    it('无配置文件时从 scripts.lint 反推 oxlint（新工具常无独立配置）', () => {
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
        scripts: { lint: 'oxlint src' },
      }));
      const detector = new ConfigDetector(tempDir);
      const conv = detector.detectConventions();
      expect(conv.hasLinter).toBe(true);
      expect(conv.linterConfig).toContain('oxlint');
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

    it('无配置文件时从 devDependencies 反推框架', () => {
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
        name: 't', version: '0.0.0',
        devDependencies: { vitest: '^1.0.0' },
        scripts: { test: 'vitest run' },
      }));
      const detector = new ConfigDetector(tempDir);
      const testing = detector.detectTesting();
      expect(testing.framework).toBe('vitest');
    });

    it('无配置文件时从 scripts.test 反推 jest', () => {
      writeFileSync(join(tempDir, 'package.json'), JSON.stringify({
        name: 't', version: '0.0.0',
        scripts: { test: 'jest --coverage' },
      }));
      const detector = new ConfigDetector(tempDir);
      const testing = detector.detectTesting();
      expect(testing.framework).toBe('jest');
    });

    it('探测 tests/ 目录', () => {
      mkdirSync(join(tempDir, 'tests'));
      mkdirSync(join(tempDir, 'tests', 'fixtures'));
      const detector = new ConfigDetector(tempDir);
      const testing = detector.detectTesting();
      expect(testing.testDirs).toContain('tests');
      expect(testing.fixturesDir).toContain('fixtures');
    });

    it('从源文件清单反推与源码同置的测试目录（src/stores/foo.test.ts → src/stores）', () => {
      const detector = new ConfigDetector(tempDir);
      detector.setSourceFiles([
        join(tempDir, 'src/stores/config.test.ts'),
        join(tempDir, 'src/stores/config.ts'),
        join(tempDir, 'src/services/ssh.test.ts'),
      ]);
      const testing = detector.detectTesting();
      expect(testing.testDirs).toContain('src/stores');
      expect(testing.testDirs).toContain('src/services');
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
