import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigDetector } from '../../../src/knowledge/config-detector/detector.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'env-purpose-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('env 用途确定性提取（extractEnvPurposes）', () => {
  it('上方紧邻注释 → purpose；尾注释与缺省值字面量各自生效；无证据缺省', () => {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), [
      '// API 服务端地址',
      'const API_URL = process.env.API_URL;',
      '',
      'const REGION = process.env.REGION; // 部署区域',
      '',
      'const RETRIES = process.env.RETRIES ?? 3;',
      '',
      'const UNKNOWN = process.env.UNKNOWN;',
      '',
      'function f() {',
      '  return process.env.API_URL;',
      '}',
    ].join('\n'));
    const detector = new ConfigDetector(dir);
    const env = detector.detectEnvironment();
    const byName = new Map(env.envVars.map(v => [v.name, v]));
    expect(byName.get('API_URL')?.purpose).toBe('API 服务端地址');
    expect(byName.get('REGION')?.purpose).toBe('部署区域');
    expect(byName.get('RETRIES')?.purpose).toBe('缺省值 3');
    expect(byName.has('UNKNOWN')).toBe(true);
    expect(byName.get('UNKNOWN')?.purpose).toBeUndefined();
  });

  it('.env.example 注释兜底（源码无证据时）', () => {
    writeFileSync(join(dir, 'src', 'b.ts'), 'const TOKEN = process.env.SVC_TOKEN;\n');
    writeFileSync(join(dir, '.env.example'), [
      '# 服务间调用凭证',
      'SVC_TOKEN=changeme',
      '',
      '# 数据库连接串',
      'DATABASE_URL=postgres://localhost/app',
    ].join('\n'));
    const detector = new ConfigDetector(dir);
    const env = detector.detectEnvironment();
    const byName = new Map(env.envVars.map(v => [v.name, v]));
    expect(byName.get('SVC_TOKEN')?.purpose).toBe('.env.example：服务间调用凭证');
    expect(byName.get('DATABASE_URL')?.purpose).toBeUndefined(); // 源码无引用，不进入 envVars
  });
});
