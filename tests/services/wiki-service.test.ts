import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WikiService } from '../../src/services/wiki-service.js';
import type { ScanResult } from '../../src/core/scanner.js';
import { createMockClient } from '../helpers/mock-mcp-client.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs';

vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

import { streamText } from 'ai';
const mockStreamText = vi.mocked(streamText);

const tmpDir = join(process.cwd(), '.test-wiki-tmp');

function makeBackendScanResult(): ScanResult {
  const files = [
    {
      absolutePath: '/tmp/test-project/src/index.ts',
      relativePath: 'src/index.ts',
      language: 'typescript' as const,
      extension: '.ts',
      size: 100,
      scope: 'production' as const,
    },
  ];
  return {
    rootDir: '/tmp/test-project',
    files,
    techStack: ['express', 'typescript'],
    testTechStack: [],
    projectType: 'backend',
    hasTypeScript: true,
    sourceDirs: ['src'],
    productionFiles: files,
    testFiles: [],
    fileCounts: { total: 1, production: 1, test: 0 },
  };
}

/** CLI 项目类型（匹配本项目），用于验证 Tier2 类型感知激活 */
function makeCliScanResult(): ScanResult {
  return {
    ...makeBackendScanResult(),
    techStack: ['commander', 'typescript'],
    projectType: 'cli',
  };
}

describe('WikiService', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate common pages', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, { noLlm: true });

    expect(generated).toContain('01-overview/overview.md');
    expect(generated).toContain('02-architecture/architecture.md');
    expect(generated).toContain('02-architecture/modules.md');
    expect(generated).toContain('07-reference/glossary.md');
  });

  it('should write files to disk in numbered directories', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    expect(existsSync(join(wikiDir, '01-overview', 'overview.md'))).toBe(true);
    expect(existsSync(join(wikiDir, '07-reference', 'glossary.md'))).toBe(true);
    expect(existsSync(join(wikiDir, '03-interface', 'api.md'))).toBe(true);
    expect(existsSync(join(wikiDir, 'README.md'))).toBe(true);
  });

  it('should include scan result data in overview page', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(content).toContain('backend');
    expect(content).toContain('express');
  });

  it('should append Related section linking planned sibling pages', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(content).toContain('## Related');
    expect(content).toContain('[tech-stack.md](tech-stack.md)');
    expect(content).toContain('[README](../README.md)');
  });

  it('should clean up legacy flat output when rebuilding', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    mkdirSync(wikiDir, { recursive: true });
    writeFileSync(join(wikiDir, 'overview.md'), '# stale flat output', 'utf-8');

    await service.buildWiki(wikiDir, { noLlm: true });

    expect(existsSync(join(wikiDir, 'overview.md'))).toBe(false);
    expect(existsSync(join(wikiDir, '01-overview', 'overview.md'))).toBe(true);
  });

  it('should wipe .wiki wholesale in full mode (tool-exclusive directory, no warnings)', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    mkdirSync(join(wikiDir, '01-overview'), { recursive: true });
    mkdirSync(join(wikiDir, '02-legacy-frontend'), { recursive: true });
    writeFileSync(join(wikiDir, '01-overview', 'project-overview.md'), '# stale renamed page', 'utf-8');
    writeFileSync(join(wikiDir, '01-overview', 'my-notes.md'), '# 手写笔记', 'utf-8');
    writeFileSync(join(wikiDir, '02-legacy-frontend', 'guide.md'), '# 旧版手写目录', 'utf-8');
    writeFileSync(join(wikiDir, 'orphan.md'), '# 根级残留', 'utf-8');

    await service.buildWiki(wikiDir, { noLlm: true });

    // full 模式整目录重建：退休路径/手写文件/外来编号目录/根级残留全部消失
    expect(existsSync(join(wikiDir, '01-overview', 'project-overview.md'))).toBe(false);
    expect(existsSync(join(wikiDir, '01-overview', 'my-notes.md'))).toBe(false);
    expect(existsSync(join(wikiDir, '02-legacy-frontend'))).toBe(false);
    expect(existsSync(join(wikiDir, 'orphan.md'))).toBe(false);
    // 正常页面照常产出，README 不再索引手写文档
    expect(existsSync(join(wikiDir, '01-overview', 'overview.md'))).toBe(true);
    const readme = readFileSync(join(wikiDir, 'README.md'), 'utf-8');
    expect(readme).not.toContain('my-notes.md');
  });

  it('update mode should silently remove foreign numbered dirs and unplanned files in owned dirs', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });
    mkdirSync(join(wikiDir, '02-legacy-frontend'), { recursive: true });
    writeFileSync(join(wikiDir, '02-legacy-frontend', 'guide.md'), '# 旧版手写目录', 'utf-8');
    writeFileSync(join(wikiDir, '01-overview', 'my-notes.md'), '# 手写笔记', 'utf-8');

    await service.buildWiki(wikiDir, { noLlm: true, mode: 'update' });

    // update 模式：外来编号目录静默删除（工具独占目录，不告警）
    expect(existsSync(join(wikiDir, '02-legacy-frontend'))).toBe(false);
    // 工具页面保留（内容一致跳过重写）
    expect(existsSync(join(wikiDir, '01-overview', 'overview.md'))).toBe(true);
    // 工具所有目录内未列入计划的手写文件也一并清理（目录为工具独占）
    expect(existsSync(join(wikiDir, '01-overview', 'my-notes.md'))).toBe(false);
  });

  it('should call ensureIndexed on the client', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(join(tmpDir, 'wiki'), { noLlm: true });

    expect(client.ensureIndexed).toHaveBeenCalled();
  });

  it('should generate all pages in noLlm mode', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeCliScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, { noLlm: true });

    // Tier 0 结构层（data-flow 除外：无执行序列数据时预检剔除，README 索引不含死链）
    expect(generated).toContain('01-overview/overview.md');
    expect(generated).toContain('02-architecture/architecture.md');
    expect(generated).not.toContain('02-architecture/data-flow.md');
    expect(generated).toContain('02-architecture/modules.md');
    expect(generated).toContain('03-interface/api.md');
    expect(generated).toContain('07-reference/glossary.md');
    expect(generated).toContain('07-reference/calls.md');
    expect(generated).toContain('07-reference/classes.md');
    expect(generated).toContain('README.md');
    // Tier 1 运行规约层
    expect(generated).toContain('01-overview/environment.md');
    expect(generated).toContain('05-guides/testing.md');
    expect(generated).toContain('06-constraints/conventions.md');
    expect(generated).toContain('06-constraints/constraints.md');
    // Tier 2 surface 层（cli 项目类型激活）
    expect(generated).toContain('03-interface/cli.md');
  });

  it('预检：有 CALLS 边但无任何数据形态证据时剔除 data-flow 页（README 无死链，报告给原因）', async () => {
    // 只有一条纯控制流边：无 r.args、callee 无签名、无 I/O
    const controlOnlyCypher = `MATCH (caller)-[r:CALLS]->(callee)
         WHERE caller.name IN ["createProgram"]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, caller.file_path AS callerFile,
                callee.name AS callee, callee.file_path AS file, callee.label AS label,
                callee.start_line AS calleeLine, r.line AS callLine, r.args AS args,
                r.confidence AS confidence, r.strategy AS strategy
         LIMIT 40`;
    const client = createMockClient({
      queryResults: new Map([[
        controlOnlyCypher,
        {
          columns: ['caller', 'callerFile', 'callee', 'file', 'label', 'calleeLine', 'callLine', 'args', 'confidence', 'strategy'],
          rows: [['createProgram', 'src/cli/index.ts', 'ScanService', 'src/services/scan-service.ts', 'Class', 3, 4, '', '', '']],
          total: 1,
        },
      ]]),
    });
    const scanResult = makeCliScanResult();
    scanResult.files = ['src/cli/index.ts', 'src/services/scan-service.ts'].map(p => ({
      absolutePath: `/tmp/test-project/${p}`,
      relativePath: p,
      language: 'typescript' as const,
      extension: '.ts',
      size: 100,
      scope: 'production' as const,
    }));
    scanResult.productionFiles = scanResult.files;
    scanResult.fileCounts = { total: 2, production: 2, test: 0 };

    const wikiDir = join(tmpDir, 'wiki');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => { logs.push(String(msg)); });
    try {
      const generated = await new WikiService(client as any, scanResult).buildWiki(wikiDir, { noLlm: true });
      // data-flow 成页条件不满足 → 整页剔除，不产出空壳页
      expect(generated).not.toContain('02-architecture/data-flow.md');
      expect(existsSync(join(wikiDir, '02-architecture', 'data-flow.md'))).toBe(false);
      // README 索引不得出现指向未产出页的死链
      const readme = readFileSync(join(wikiDir, 'README.md'), 'utf-8');
      expect(readme).not.toContain('data-flow.md');
    } finally {
      spy.mockRestore();
    }
    const report = logs.join('\n');
    expect(report).toContain('data-flow');
    expect(report).toContain('缺少签名、调用参数、返回类型或 I/O 数据形态证据');
  });

  it('预检：有签名或调用实参时保留 data-flow 页并渲染数据形态表', async () => {
    const bfsCypher = `MATCH (caller)-[r:CALLS]->(callee)
         WHERE caller.name IN ["createProgram"]
           AND caller.is_test = false
           AND callee.is_test = false
         RETURN caller.name AS caller, caller.file_path AS callerFile,
                callee.name AS callee, callee.file_path AS file, callee.label AS label,
                callee.start_line AS calleeLine, r.line AS callLine, r.args AS args,
                r.confidence AS confidence, r.strategy AS strategy
         LIMIT 40`;
    const files = ['src/cli/index.ts', 'src/services/wiki-service.ts'];
    const fileList = files.map(f => `"${f}"`).join(',');
    const symbolCypher = `MATCH (n) WHERE n.file_path IN [${fileList}]
           AND n.is_test = false
           AND n.label IN ['Function', 'Method', 'Class']
         RETURN n.name AS name, n.file_path AS file, n.label AS label,
                n.signature AS sig, n.return_type AS rt, n.param_types AS pt,
                n.param_names AS pn, n.start_line AS sl, n.end_line AS el, n.docstring AS doc
         LIMIT 200`;
    const typeCypher = `MATCH (n) WHERE n.file_path IN [${fileList}]
           AND n.is_test = false
           AND n.label IN ['Interface', 'Type', 'Enum', 'Class']
         RETURN n.name AS name, n.label AS label, n.file_path AS file,
                n.start_line AS sl, n.end_line AS el
         LIMIT 60`;

    const client = createMockClient({
      queryResults: new Map([
        [bfsCypher, {
          columns: ['caller', 'callerFile', 'callee', 'file', 'label', 'calleeLine', 'callLine', 'args', 'confidence', 'strategy'],
          rows: [['createProgram', files[0], 'buildWiki', files[1], 'Method', 96, 121, '[{"i":0,"e":"scanResult"}]', '0.95', 'lsp_ts_method']],
          total: 1,
        }],
        [symbolCypher, {
          columns: ['name', 'file', 'label', 'sig', 'rt', 'pt', 'pn', 'sl', 'el', 'doc'],
          rows: [['buildWiki', files[1], 'Method', '(scanResult: ScanResult)', ': string[]', '["ScanResult"]', '["scanResult"]', 96, 130, null]],
          total: 1,
        }],
        [typeCypher, {
          columns: ['name', 'label', 'file', 'sl', 'el'],
          rows: [['ScanResult', 'Interface', files[1], 96, 100]],
          total: 1,
        }],
      ]),
    });
    const scanResult = makeCliScanResult();
    scanResult.files = files.map(p => ({
      absolutePath: `/tmp/test-project/${p}`,
      relativePath: p,
      language: 'typescript' as const,
      extension: '.ts',
      size: 100,
      scope: 'production' as const,
    }));
    scanResult.productionFiles = scanResult.files;
    scanResult.fileCounts = { total: 2, production: 2, test: 0 };

    const wikiDir = join(tmpDir, 'wiki');
    const generated = await new WikiService(client as any, scanResult).buildWiki(wikiDir, { noLlm: true });
    expect(generated).toContain('02-architecture/data-flow.md');

    const page = readFileSync(join(wikiDir, '02-architecture', 'data-flow.md'), 'utf-8');
    // 规则路径同样输出数据形态证据，而不是纯调用边表
    expect(page).toContain('## 数据阶段');
    expect(page).toContain('## 阶段转换');
    expect(page).toContain('scanResult');
    expect(page).toContain('ScanResult');
    expect(page).toContain('src/cli/index.ts:121');
    expect(page).toContain('src/services/wiki-service.ts:96');
    expect(page).not.toContain('调用边表');
    // README 索引包含本届产出的 data-flow 页（无死链）
    const readme = readFileSync(join(wikiDir, 'README.md'), 'utf-8');
    expect(readme).toContain('data-flow.md');
  });

  it('should skip unimplemented Tier 2 pages instead of writing empty files', async () => {
    // backend 项目类型会激活 routes + db-schema（surface 层），
    // 但二者的 context 尚未实现：应跳过写盘而非产出空文件
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, { noLlm: true });

    expect(generated).not.toContain('routes.md');
    expect(generated).not.toContain('db-schema.md');
    expect(existsSync(join(wikiDir, 'routes.md'))).toBe(false);
    expect(existsSync(join(wikiDir, 'db-schema.md'))).toBe(false);
    // backend 不应激活 cli（那是 cli/agent 类型的页面）
    expect(generated).not.toContain('03-interface/cli.md');
  });

  it('should generate only specified pages', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, {
      noLlm: true,
      pages: ['overview', 'glossary'],
    });

    expect(generated).toEqual(['01-overview/overview.md', '07-reference/glossary.md']);
  });

  it('should produce glossary without LLM placeholders', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, '07-reference', 'glossary.md'), 'utf-8');
    expect(content).not.toContain('{{LLM:');
  });

  it('should render README index grouped by numbered directory with planned pages only', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const readme = readFileSync(join(wikiDir, 'README.md'), 'utf-8');
    expect(readme).toContain('01-overview/');
    expect(readme).toContain('[01-overview/overview.md](01-overview/overview.md)');
    // backend 不产出 cli 页面，索引不应链接它
    expect(readme).not.toContain('(03-interface/cli.md)');
    expect(readme).toContain('阅读路径');
  });

  it('update mode should skip rewriting unchanged pages and rewrite tampered ones', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');

    // 第一次全量构建
    const first = await service.buildWiki(wikiDir, { noLlm: true });
    expect(first.length).toBeGreaterThan(0);

    // 篡改一页
    const overviewPath = join(wikiDir, '01-overview', 'overview.md');
    writeFileSync(overviewPath, '# tampered', 'utf-8');

    // update 模式：篡改页应被重写恢复
    const second = await service.buildWiki(wikiDir, { noLlm: true, mode: 'update' });
    expect(second).toEqual(first);
    expect(readFileSync(overviewPath, 'utf-8')).not.toBe('# tampered');
    expect(readFileSync(overviewPath, 'utf-8')).toContain('# Project Overview');

    // full 模式：所有页面无条件重写（文件仍正确）
    const third = await service.buildWiki(wikiDir, { noLlm: true, mode: 'full' });
    expect(third).toEqual(first);
  });

  it('update mode should converge: README not deleted/rewritten on case-insensitive fs', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    // 大小写不敏感文件系统上 existsSync('readme.md') 命中 'README.md'：
    // 修复后 update 模式不应删写 README（mtime 不变）
    const readmePath = join(wikiDir, 'README.md');
    const mtimeBefore = statSync(readmePath).mtimeMs;
    await new Promise(r => setTimeout(r, 20));
    await service.buildWiki(wikiDir, { noLlm: true, mode: 'update' });
    expect(existsSync(readmePath)).toBe(true);
    expect(statSync(readmePath).mtimeMs).toBe(mtimeBefore);
  });

  it('should use unified 待确认 markers on weak-data pages', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    // troubleshooting：规则模板生成，弱证据 → 标注待确认
    const ts = readFileSync(join(wikiDir, '05-guides', 'troubleshooting.md'), 'utf-8');
    expect(ts).toContain('待确认');
    // decisions 页已下线（无真实 ADR 数据源，自动推导条目会伪装成决策记录）
    expect(existsSync(join(wikiDir, '04-design', 'decisions.md'))).toBe(false);
  });

  it('should inject evidence block with real source files after the page title', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('<summary>Relevant source files</summary>');
    // 只列扫描清单内的真实文件（overview ctx 的 entryFiles）
    expect(overview).toContain('- src/index.ts');
    // 注入位置：紧跟首个 # 标题之后（标题 + 空行 + 锚定块）
    expect(overview.startsWith('# Project Overview\n\n<details>')).toBe(true);
  });

  it('should generate locked topic pages, index them in README, and clean stale topic files', async () => {
    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    // 预置锁定主题 + 一个陈旧主题文件
    mkdirSync(join(wikiDir, '08-topics'), { recursive: true });
    writeFileSync(join(wikiDir, '08-topics', 'stale.md'), '# stale', 'utf-8');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'topics.json'), JSON.stringify([
      { id: 't1', title: '质量闸门', files: ['src/index.ts'] },
    ]), 'utf-8');

    const service = new WikiService(client as any, makeBackendScanResult());
    const generated = await service.buildWiki(wikiDir, { noLlm: true });

    expect(generated).toContain('08-topics/t1.md');
    // 陈旧主题文件被清理（目录为工具所有）
    expect(existsSync(join(wikiDir, '08-topics', 'stale.md'))).toBe(false);
    const topic = readFileSync(join(wikiDir, '08-topics', 't1.md'), 'utf-8');
    expect(topic).toContain('# 质量闸门');
    expect(topic).toContain('src/index.ts');
    // README 索引纳入主题组
    const readme = readFileSync(join(wikiDir, 'README.md'), 'utf-8');
    expect(readme).toContain('08-topics/');
    expect(readme).toContain('[08-topics/t1.md](08-topics/t1.md)');
  });

  it('should support generating a single topic page via --pages topic:<id>', async () => {
    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'topics.json'), JSON.stringify([
      { id: 't1', title: '质量闸门', files: ['src/index.ts'] },
    ]), 'utf-8');

    const service = new WikiService(client as any, makeBackendScanResult());
    const generated = await service.buildWiki(wikiDir, { noLlm: true, pages: ['topic:t1'] });

    expect(generated).toEqual(['08-topics/t1.md']);
  });

  /** 章节页测试共用：3 文件扫描清单 + 锁定的 outline.json */
  function setupOutlineFixture(wikiDir: string, agentDir: string): void {
    mkdirSync(join(wikiDir, '09-chapters', 'terminal'), { recursive: true });
    writeFileSync(join(wikiDir, '09-chapters', 'terminal', 'stale.md'), '# stale', 'utf-8');
    mkdirSync(join(wikiDir, '09-chapters', 'ghost'), { recursive: true });
    writeFileSync(join(wikiDir, '09-chapters', 'ghost', 'orphan.md'), '# orphan', 'utf-8');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'outline.json'), JSON.stringify({
      version: 1,
      generator: 'manual',
      generatedAt: '2026-09-22T00:00:00Z',
      chapters: [{
        id: 'terminal',
        title: '终端渲染',
        summary: '终端渲染子系统',
        pages: [
          { id: 'xterm', title: 'xterm 集成', brief: '说明 xterm 集成方式与 resize 适配。', files: ['src/index.ts', 'src/a.ts', 'src/b.ts'] },
        ],
      }],
    }), 'utf-8');
  }

  function makeOutlineScanResult(): ScanResult {
    const scan = makeBackendScanResult();
    scan.files = [
      'src/index.ts', 'src/a.ts', 'src/b.ts',
    ].map(f => ({
      absolutePath: `/tmp/test-project/${f}`, relativePath: f,
      language: 'typescript' as const, extension: '.ts', size: 100,
      scope: 'production' as const,
    }));
    scan.productionFiles = scan.files;
    scan.testFiles = [];
    scan.fileCounts = { total: scan.files.length, production: scan.files.length, test: 0 };
    return scan;
  }

  it('should generate locked chapter pages, index them in README, and clean stale chapter files', async () => {
    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-chapters');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    setupOutlineFixture(wikiDir, agentDir);

    const service = new WikiService(client as any, makeOutlineScanResult());
    const generated = await service.buildWiki(wikiDir, { noLlm: true });

    expect(generated).toContain('09-chapters/terminal/xterm.md');
    // 计划外章节文件被清理；整章失效时空章目录一并移除
    expect(existsSync(join(wikiDir, '09-chapters', 'terminal', 'stale.md'))).toBe(false);
    expect(existsSync(join(wikiDir, '09-chapters', 'ghost'))).toBe(false);
    const page = readFileSync(join(wikiDir, '09-chapters', 'terminal', 'xterm.md'), 'utf-8');
    expect(page).toContain('# xterm 集成');
    expect(page).toContain('终端渲染');
    expect(page).toContain('src/a.ts');
    // 章节页证据锚定（3 个真实文件）
    expect(page).toContain('<summary>Relevant source files</summary>');
    // README 索引纳入章节组
    const readme = readFileSync(join(wikiDir, 'README.md'), 'utf-8');
    expect(readme).toContain('[09-chapters/terminal/xterm.md](09-chapters/terminal/xterm.md)');
  });

  it('should support generating a single chapter page via --pages chapter:<c>/<p>', async () => {
    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-chapters-single');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    setupOutlineFixture(wikiDir, agentDir);

    const service = new WikiService(client as any, makeOutlineScanResult());
    const generated = await service.buildWiki(wikiDir, { noLlm: true, pages: ['chapter:terminal/xterm'] });

    expect(generated).toEqual(['09-chapters/terminal/xterm.md']);
  });

  it('should annotate unverified claims on LLM pages via three-level verification', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 概览\n\n核心由 `realThing` 与 `ghostThing` 构成。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    // realThing 有词法实据（search_code 命中），ghostThing 查无实据
    const client = createMockClient({ searchCounts: new Map([['realThing', 3]]) });
    const wikiDir = join(tmpDir, 'wiki-claims');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'] });

    const overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`ghostThing`（待确认）');
    expect(overview).not.toContain('realThing`（待确认）');
    // pending marker 是会话期脚手架，写盘内容零残留（可见「待确认」文本保留）
    expect(overview).not.toContain('wiki:pending');
    expect(client.searchCodeMatches).toHaveBeenCalledWith('realThing', 20);
    expect(client.searchCodeMatches).toHaveBeenCalledWith('ghostThing', 20);
  });

  it('claim 核验按页面作用域过滤：非 testing 页不采纳测试文件证据，testing 页可采纳', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 文档\n\n测试符号 `TEST_ONLY_SYMBOL`。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient();
    client.searchCodeMatches.mockImplementation((pattern: string) =>
      pattern === 'TEST_ONLY_SYMBOL'
        ? [{ file: 'tests/config.test.ts', line: 1 }]
        : []);
    client.queryGraph.mockImplementation((cypher: string) =>
      cypher.includes('RETURN n.name AS name, n.file_path AS file')
        ? {
            columns: ['name', 'file'],
            rows: [['TEST_ONLY_SYMBOL', '/tmp/test-project/tests/config.test.ts']],
            total: 1,
          }
        : { columns: [], rows: [], total: 0 });

    const scan = makeBackendScanResult();
    scan.files.push({
      absolutePath: '/tmp/test-project/tests/config.test.ts',
      relativePath: 'tests/config.test.ts',
      language: 'typescript',
      extension: '.ts',
      size: 100,
      scope: 'test',
    });
    scan.testFiles = scan.files.filter(f => f.scope === 'test');
    scan.productionFiles = scan.files.filter(f => f.scope === 'production');
    scan.fileCounts = {
      total: scan.files.length,
      production: scan.productionFiles.length,
      test: scan.testFiles.length,
    };

    const service = new WikiService(client as any, scan);
    const overviewDir = join(tmpDir, 'wiki-scope-overview');
    await service.buildWiki(overviewDir, { model: 'test-model', pages: ['overview'] });
    const overview = readFileSync(join(overviewDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`TEST_ONLY_SYMBOL`（待确认）');

    const testingDir = join(tmpDir, 'wiki-scope-testing');
    await service.buildWiki(testingDir, { model: 'test-model', pages: ['testing'] });
    const testing = readFileSync(join(testingDir, '05-guides', 'testing.md'), 'utf-8');
    expect(testing).not.toContain('`TEST_ONLY_SYMBOL`（待确认）');
  });

  it('两阶段构建：confirmSession 在生成后写盘前收到聚合项，resolve 后写盘无标记并持久化白名单', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 概览\n\n核心由 `ghostThing` 构成。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient(); // searchCode 默认 0 命中 → ghostThing 查无实据
    const wikiDir = join(tmpDir, 'wiki-confirm');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });
    rmSync(join(agentDir, 'confirmations.json'), { force: true });

    const sessionCalls: number[][] = [];
    const confirmSession = vi.fn(async (items: Array<{ key: string }>) => {
      sessionCalls.push(items.map(i => i.key));
      // 全部确认为事实
      return items
        .filter(i => i.key === 'claim\nghostThing')
        .map(i => ({ key: i.key, kind: 'claim' as const, action: 'resolve' as const }));
    });

    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'], confirmSession });

    // 阶段二收到跨页聚合后的待确认项
    expect(confirmSession).toHaveBeenCalledTimes(1);
    expect(sessionCalls[0]).toContain('claim\nghostThing');

    // resolve 应用后写盘：标记已移除
    const overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`ghostThing`');
    expect(overview).not.toContain('`ghostThing`（待确认）');

    // 确认的 claim 持久化
    const store = JSON.parse(readFileSync(join(agentDir, 'confirmations.json'), 'utf-8'));
    expect(store.confirmed).toContain('ghostThing');

    // 第二次构建：白名单免标 → 无待确认项 → 会话不再触发
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'], confirmSession });
    expect(confirmSession).toHaveBeenCalledTimes(1);
    const rebuilt = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(rebuilt).not.toContain('（待确认）');
  });

  it('两阶段构建：keep 决定保留待确认标记；未注入会话时不交互', async () => {
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 概览\n\n核心由 `ghostThing` 构成。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-confirm-keep');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });
    rmSync(join(agentDir, 'confirmations.json'), { force: true });

    // 未注入 confirmSession：行为与旧版一致，直接写盘
    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'] });
    let overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`ghostThing`（待确认）');

    // 注入会话但全部 keep：标记保留
    const keepSession = vi.fn(async () => []);
    rmSync(wikiDir, { recursive: true, force: true });
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'], confirmSession: keepSession });
    expect(keepSession).toHaveBeenCalledTimes(1);
    overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).toContain('`ghostThing`（待确认）');
  });

  it('章节树规划 LLM 异常不阻断构建（fail-open，按无章节页继续）', async () => {
    mockStreamText.mockImplementation((() => { throw new Error('Insufficient Balance'); }) as any);
    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-planfail');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const service = new WikiService(client as any, makeBackendScanResult());
    const generated = await service.buildWiki(wikiDir, { model: 'test-model' });

    expect(generated.length).toBeGreaterThan(0);
    expect(existsSync(join(wikiDir, '01-overview', 'overview.md'))).toBe(true);
    expect(existsSync(join(wikiDir, '09-chapters'))).toBe(false);
  });

  it('should not flag declared dependency names as unverified claims', async () => {    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: '# 概览\n\n会话层核心依赖 `express`（多处 import），另有 `ghostThing`。',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    // searchCode 全部 0 命中、图谱 universe 为空：express 仅靠 dep-name 回填免于误标
    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-dep-claims');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview'] });

    const overview = readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8');
    expect(overview).not.toContain('`express`（待确认）');
    expect(overview).toContain('`ghostThing`（待确认）');
  });

  it('should auto-plan outline on first build when LLM available and lock outline.json', async () => {    // 首次自动提议：outline.json 缺失 + 模型可用 → planner 产出并锁定
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: JSON.stringify({
            chapters: [{
              id: 'terminal', title: '终端渲染', summary: '渲染子系统',
              pages: [{ id: 'xterm', title: 'xterm 集成', brief: '说明 xterm 集成方式与 resize 适配。', files: ['src/index.ts', 'src/a.ts', 'src/b.ts'] }],
            }],
          }),
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki-planner');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const service = new WikiService(client as any, makeOutlineScanResult());
    const generated = await service.buildWiki(wikiDir, { model: 'test-model' });

    // 锁定文件写入（generator=outline-planner），章页进入产出清单
    const locked = JSON.parse(readFileSync(join(agentDir, 'outline.json'), 'utf-8'));
    expect(locked.generator).toBe('outline-planner');
    expect(locked.chapters[0].id).toBe('terminal');
    expect(generated).toContain('09-chapters/terminal/xterm.md');
    expect(existsSync(join(wikiDir, '09-chapters', 'terminal', 'xterm.md'))).toBe(true);
  });
});
