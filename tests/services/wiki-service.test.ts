import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WikiService } from '../../src/services/wiki-service.js';
import type { ScanResult } from '../../src/core/scanner.js';
import { createMockClient } from '../helpers/mock-mcp-client.js';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';

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

    expect(generated).toContain('overview.md');
    expect(generated).toContain('architecture.md');
    expect(generated).toContain('modules.md');
    expect(generated).toContain('glossary.md');
  });

  it('should write files to disk', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    expect(existsSync(join(wikiDir, 'overview.md'))).toBe(true);
    expect(existsSync(join(wikiDir, 'glossary.md'))).toBe(true);
    expect(existsSync(join(wikiDir, 'api.md'))).toBe(true);
  });

  it('should include scan result data in overview page', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, 'overview.md'), 'utf-8');
    expect(content).toContain('backend');
    expect(content).toContain('express');
  });

  it('should call ensureIndexed on the client', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    await service.buildWiki(join(tmpDir, 'wiki'), { noLlm: true });

    expect(client.ensureIndexed).toHaveBeenCalled();
  });

  it('should generate 10 pages in noLlm mode', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, { noLlm: true });

    expect(generated).toContain('overview.md');
    expect(generated).toContain('architecture.md');
    expect(generated).toContain('data-flow.md');
    expect(generated).toContain('modules.md');
    expect(generated).toContain('api.md');
    expect(generated).toContain('business.md');
    expect(generated).toContain('design-decisions.md');
    expect(generated).toContain('glossary.md');
    expect(generated.length).toBe(10);
  });

  it('should generate only specified pages', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    const generated = await service.buildWiki(wikiDir, {
      noLlm: true,
      pages: ['overview', 'glossary'],
    });

    expect(generated).toEqual(['overview.md', 'glossary.md']);
  });

  it('should produce glossary without LLM placeholders', async () => {
    const client = createMockClient();
    const service = new WikiService(client as any, makeBackendScanResult());
    const wikiDir = join(tmpDir, 'wiki');
    await service.buildWiki(wikiDir, { noLlm: true });

    const content = readFileSync(join(wikiDir, 'glossary.md'), 'utf-8');
    expect(content).not.toContain('{{LLM:');
  });
});
