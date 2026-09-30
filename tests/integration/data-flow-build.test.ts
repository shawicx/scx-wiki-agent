import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CodebaseMemoryClient } from '../../src/mcp/codebase-memory-client.js';
import { FileScanner } from '../../src/core/scanner.js';
import { ConfigDetector } from '../../src/knowledge/config-detector.js';
import { WikiContextBuilder } from '../../src/knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../../src/knowledge/wiki-fallback-builder.js';

const BINARY = process.env.CODEBASE_MEMORY_MCP_BINARY
  ?? '/Users/scx/.local/bin/codebase-memory-mcp';
const binaryExists = existsSync(BINARY);

const MAIN_SOURCE = `import { readFileSync, writeFileSync } from 'fs';

export interface Config {
  name: string;
  count: number;
}

export interface NormalizedConfig {
  name: string;
  total: number;
}

export function readConfig(path: string): Config {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

export function normalizeConfig(raw: Config): NormalizedConfig {
  return { name: raw.name, total: raw.count * 2 };
}

export function writeOutput(result: NormalizedConfig, target: string): void {
  writeFileSync(target, JSON.stringify(result));
}

export function main(configPath: string, outPath: string): void {
  const cfg = readConfig(configPath);
  const normalized = normalizeConfig(cfg);
  writeOutput(normalized, outPath);
}
`;

/** 测试专用类型与 I/O：绝不能进入 data-flow 证据 */
const TEST_SOURCE = `import { writeFileSync } from 'fs';

export interface FixtureOnlyType {
  secret: string;
}

export function writeFixture(value: FixtureOnlyType): void {
  writeFileSync('/tmp/fixture.json', JSON.stringify(value));
}
`;

/**
 * data-flow 端到端集成测试：真实 codebase-memory-mcp 索引临时项目 →
 * 确定性数据形态证据层 → 规则渲染页面。
 * 无二进制时自动跳过（CI 环境友好）。
 */
describe.skipIf(!binaryExists)('data-flow 端到端（真实 MCP + 临时项目）', () => {
  let rootDir = '';
  let page = '';
  let coverage: Awaited<ReturnType<WikiContextBuilder['buildDataFlowContext']>>['shapeCoverage'] | null = null;

  beforeAll(() => {
    // realpath 归一化：macOS 的 /tmp → /private/tmp，避免项目名与图谱不一致
    rootDir = mkdtempSync(join(realpathSync(tmpdir()), 'scx-df-'));
    mkdirSync(join(rootDir, 'src'), { recursive: true });
    mkdirSync(join(rootDir, 'tests'), { recursive: true });
    writeFileSync(join(rootDir, 'src', 'index.ts'), MAIN_SOURCE, 'utf-8');
    writeFileSync(join(rootDir, 'tests', 'fixture.test.ts'), TEST_SOURCE, 'utf-8');
    writeFileSync(join(rootDir, 'package.json'), JSON.stringify({
      name: 'scx-df-fixture',
      version: '1.0.0',
      type: 'module',
    }, null, 2), 'utf-8');

    const client = new CodebaseMemoryClient(rootDir, BINARY);
    client.ensureIndexed('fast');

    const scanResult = new FileScanner(rootDir).scan();
    expect(scanResult.productionFiles.map(f => f.relativePath)).toContain('src/index.ts');

    const detector = new ConfigDetector(rootDir);
    const builder = new WikiContextBuilder(client as never, scanResult, detector);
    const ctx = builder.buildDataFlowContext();
    coverage = ctx.shapeCoverage;
    page = new WikiFallbackBuilder().buildDataFlow(ctx);
  }, 180_000);

  afterAll(() => {
    if (rootDir) rmSync(rootDir, { recursive: true, force: true });
  });

  it('阶段表落到真实符号与调用点/定义点两套锚点', () => {
    expect(page).toContain('readConfig');
    expect(page).toContain('normalizeConfig');
    expect(page).toContain('writeOutput');
    // 调用点锚点（r.line）与 callee 定义锚点（start_line）都必须出现
    expect(page).toMatch(/src\/index\.ts:\d+/);
    expect(page).toContain('## 阶段转换');
    expect(page).toContain('## 数据阶段');
  });

  it('数据形态来自签名、实参与本地类型定义', () => {
    expect(page).toContain('string');
    expect(page).toContain('Config');
    expect(page).toContain('NormalizedConfig');
    expect(page).toContain('## 关键数据结构');
  });

  it('I/O 边界事件落到具体函数', () => {
    expect(page).toContain('readFileSync');
    expect(page).toContain('writeFileSync');
    expect(page).toContain('## 输入与输出边界');
    expect(page).toContain('readConfig');
    expect(page).toContain('writeOutput');
  });

  it('测试 fixture 的类型与 I/O 不进入 data-flow 证据', () => {
    expect(page).not.toContain('FixtureOnlyType');
    expect(page).not.toContain('writeFixture');
    expect(page).not.toContain('fixture.json');
    expect(page).not.toContain('tests/fixture.test.ts');
  });

  it('成页条件由数据形态覆盖率支撑', () => {
    expect(coverage).not.toBeNull();
    expect(coverage!.dataBearingTransitions).toBeGreaterThan(0);
    expect(coverage!.stages).toBeGreaterThan(0);
    expect(coverage!.ioEvents).toBeGreaterThan(0);
  });
});
