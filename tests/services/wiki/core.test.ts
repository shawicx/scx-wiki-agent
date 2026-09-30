import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WikiService } from '../../../src/services/wiki-service.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpBase, makeBackendScanResult, makeCliScanResult } from './helpers.js';

const tmpDir = join(tmpBase, 'core');

describe('WikiService 基础产出', () => {
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
});
