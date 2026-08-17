import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WikiService } from '../../src/services/wiki-service.js';
import type { ScanResult } from '../../src/core/scanner.js';
import { createMockClient } from '../helpers/mock-mcp-client.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';

const tmpDir = join(process.cwd(), '.test-wiki-tmp');

function makeBackendScanResult(): ScanResult {
  return {
    rootDir: '/tmp/test-project',
    files: [
      {
        absolutePath: '/tmp/test-project/src/index.ts',
        relativePath: 'src/index.ts',
        language: 'typescript',
        extension: '.ts',
        size: 100,
      },
    ],
    techStack: ['express', 'typescript'],
    projectType: 'backend',
    hasTypeScript: true,
    sourceDirs: ['src'],
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

    // Tier 0 结构层
    expect(generated).toContain('01-overview/overview.md');
    expect(generated).toContain('02-architecture/architecture.md');
    expect(generated).toContain('02-architecture/data-flow.md');
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

  it('should use unified 待确认 markers on weak-data pages', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    // troubleshooting：规则模板生成，弱证据 → 标注待确认
    const ts = readFileSync(join(wikiDir, '05-guides', 'troubleshooting.md'), 'utf-8');
    expect(ts).toContain('待确认');
    // decisions：自动推导 ADR → 标注待确认
    const decisions = readFileSync(join(wikiDir, '04-design', 'decisions.md'), 'utf-8');
    expect(decisions).toContain('待确认');
  });

  it('should derive ADRs from graph evidence without project-specific hardcoding', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const decisions = readFileSync(join(wikiDir, '04-design', 'decisions.md'), 'utf-8');
    // mock 图谱含 layers + boundaries，技术栈含 express → 三类证据条目均应出现
    expect(decisions).toContain('分层结构');
    expect(decisions).toContain('模块调用边界');
    expect(decisions).toContain('核心技术选型');
    // 自动推导条目状态一律 proposed（不再伪装成 accepted）
    expect(decisions).toContain('proposed');
    expect(decisions).not.toContain('accepted');
  });
});
