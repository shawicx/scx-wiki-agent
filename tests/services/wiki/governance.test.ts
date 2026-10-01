import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WikiService } from '../../../src/services/wiki-service.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { tmpBase, makeBackendScanResult, makeOutlineScanResult, setupOutlineFixture } from './helpers.js';

const tmpDir = join(tmpBase, 'governance');

describe('页面治理与主题/章节页', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should skip zero-evidence Tier 2 pages instead of writing empty files', async () => {
    // backend 项目类型会激活 routes + db-schema（surface 层）；
    // 三路径已实现，但该 fixture 无路由/schema 证据：context 返回 null 应跳过写盘
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
    expect(readFileSync(overviewPath, 'utf-8')).toContain('# 项目概览');

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
    expect(overview.startsWith('# 项目概览\n\n<details>')).toBe(true);
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
});

describe('章节页', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

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
});
