import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WikiService } from '../../../src/services/wiki-service.js';
import { createMockClient } from '../../helpers/mock-mcp-client.js';
import { join } from 'path';
import { mkdirSync, rmSync, readFileSync } from 'fs';
import { tmpBase, makeBackendScanResult } from './helpers.js';
import { buildRelatedSection } from '../../../src/knowledge/page-registry.js';

vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

import { streamText } from 'ai';
const mockStreamText = vi.mocked(streamText);

const tmpDir = join(tmpBase, 'crosspage');

describe('跨页审校端到端', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('LLM 页复述他页专属表头 → 构建报告输出跨页审校告警（page-scope-overlap）', async () => {
    // overview 的 LLM 输出复述了 glossary 的专属表头 → 越界告警（warn 不拦截写盘）
    mockStreamText.mockImplementation((() => ({
      fullStream: (async function* () {
        yield {
          type: 'text-delta',
          text: [
            '# 概览',
            '',
            '| Name | Type | Signature |',
            '| --- | --- | --- |',
            '| main | Function | () => void |',
          ].join('\n'),
        };
      })(),
      finishReason: Promise.resolve('stop'),
    })) as any);

    const client = createMockClient();
    const wikiDir = join(tmpDir, 'wiki');
    const agentDir = join(tmpDir, '.scx-wiki-agent');
    rmSync(join(agentDir, 'outline.json'), { force: true });

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => { logs.push(String(msg)); });
    try {
      const service = new WikiService(client as any, makeBackendScanResult());
      await service.buildWiki(wikiDir, { model: 'test-model', pages: ['overview', 'glossary'] });
    } finally {
      spy.mockRestore();
    }

    const report = logs.join('\n');
    expect(report).toContain('跨页审校');
    expect(report).toContain('page-scope-overlap');
    // warn 不拦截写盘
    expect(readFileSync(join(wikiDir, '01-overview', 'overview.md'), 'utf-8')).toContain('# 概览');
  });
});

describe('Related 跨目录链接渲染', () => {
  it('crossLinks 渲染互补职责与亲和度链接；未列入计划的目标被过滤（零死链）', () => {
    const related = buildRelatedSection(
      'calls',
      ['calls', 'data-flow', 'overview'],
      [
        { target: 'data-flow', reason: '互补职责' },
        { target: 'overview', reason: '共享 3 个符号' },
        { target: 'tech-stack', reason: '不在计划内' },
      ],
    );
    expect(related).toContain('## Related');
    expect(related).toContain('互补职责：[data-flow.md](../02-architecture/data-flow.md)');
    expect(related).toContain('共享 3 个符号：[overview.md](../01-overview/overview.md)');
    expect(related).not.toContain('tech-stack.md');
  });

  it('无跨目录链接时保持原行为（仅同目录 + 总入口）', () => {
    const related = buildRelatedSection('overview', ['overview', 'tech-stack']);
    expect(related).toContain('## Related');
    expect(related).toContain('同目录');
    expect(related).not.toContain('互补职责');
  });
});
