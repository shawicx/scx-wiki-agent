import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ chat: () => ({}) }),
}));

import { streamText } from 'ai';
import { assembleSections } from '../../src/knowledge/wiki-continuation.js';
import { WikiPageGenerator } from '../../src/knowledge/wiki-page-generator.js';
import type { PageGenNotice } from '../../src/knowledge/wiki-page-generator.js';
import type { ModulesContext, ArchitectureContext, GlossaryContext, ModuleSummary } from '../../src/knowledge/types.js';
import type { SymbolType } from '../../src/core/types.js';

const mockStreamText = vi.mocked(streamText);

function streamResult(text: string, finish = 'stop') {
  return {
    fullStream: (async function* () {
      yield { type: 'text-delta', text };
    })(),
    finishReason: Promise.resolve(finish),
  };
}

function mod(name: string): ModuleSummary {
  return {
    name,
    files: [`src/${name}`],
    symbols: [{ name: `${name}Service`, type: 'class' as SymbolType, docstring: null, signature: null }],
    fileSymbols: [{ file: `src/${name}/index.ts`, symbols: [{ name: `${name}Service`, type: 'class' as SymbolType }] }],
    outgoingRelations: [],
    incomingRelations: [],
    codeSnippets: [],
  };
}

describe('assembleSections', () => {
  it('各节 trim 后以空行连接', () => {
    expect(assembleSections(['## A\n\n内容一  ', '  ## B\n\n内容二'])).toBe('## A\n\n内容一\n\n## B\n\n内容二');
  });

  it('跨节重复标题只保留首个（大小写不敏感）', () => {
    const result = assembleSections(['## 职责\n\nA', '## 职责\n\nB']);
    expect(result.match(/## 职责/g)).toHaveLength(1);
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('围栏内的 # 行不视为标题，不参与去重', () => {
    const fenced = (v: string) => '```bash\n# comment\n```\n' + v;
    const result = assembleSections([fenced('## 一\n\nA'), fenced('## 二\n\nB')]);
    expect(result.match(/# comment/g)).toHaveLength(2);
  });
});

describe('modules 页分节生成', () => {
  beforeEach(() => vi.clearAllMocks());

  it('组织概述 + 3 批详解 + 其他模块汇总，切片互相隔离', async () => {
    const ctx: ModulesContext = {
      modules: Array.from({ length: 9 }, (_, i) => mod(`m${i}`)),
      otherModules: [{ name: 'extra', fileCount: 3, symbolCount: 9 }],
    };
    mockStreamText.mockImplementation((() => streamResult('## 节内容\n\n表格')) as any);

    const notices: PageGenNotice[] = [];
    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key', n => notices.push(n));
    const result = await generator.generateModules(ctx, vi.fn());

    expect(mockStreamText).toHaveBeenCalledTimes(5);
    const prompts = mockStreamText.mock.calls.map(c => (c[0] as any).prompt as string);

    // 概述节：只有模块名与规模，无符号细节
    expect(prompts[0]).toContain('m0');
    expect(prompts[0]).toContain('m8');
    expect(prompts[0]).not.toContain('fileSymbols');
    // 详解节切片隔离：第 1 批含 m0-m3，不含 m4
    expect(prompts[1]).toContain('m0Service');
    expect(prompts[1]).toContain('m3Service');
    expect(prompts[1]).not.toContain('m4Service');
    expect(prompts[2]).toContain('m4Service');
    expect(prompts[3]).toContain('m8Service');
    // 汇总节只含 otherModules
    expect(prompts[4]).toContain('extra');
    expect(prompts[4]).not.toContain('m0Service');

    expect(result).toContain('## 节内容');
    expect(notices).toEqual([{ kind: 'sections', sections: 5, continuedSections: 0, truncated: false }]);
  });
});

describe('architecture 页分节生成', () => {
  beforeEach(() => vi.clearAllMocks());

  it('整体思路 → 详解分批（≤6 个/批）→ 依赖分析', async () => {
    const ctx: ArchitectureContext = {
      modules: Array.from({ length: 7 }, (_, i) => mod(`m${i}`)),
      interModuleRelations: [],
      layers: [{ name: 'knowledge', layer: 'core', reason: 'r' }],
    };
    mockStreamText.mockImplementation((() => streamResult('## 架构节\n\n分析')) as any);

    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key');
    await generator.generateArchitecture(ctx, vi.fn());

    expect(mockStreamText).toHaveBeenCalledTimes(4);
    const prompts = mockStreamText.mock.calls.map(c => (c[0] as any).prompt as string);

    // 首节为轻量模块清单（无符号），符号进详解节
    expect(prompts[0]).toContain('m0');
    expect(prompts[0]).not.toContain('m0Service');
    expect(prompts[0]).toContain('knowledge');
    expect(prompts[1]).toContain('m5Service');
    expect(prompts[1]).not.toContain('m6Service');
    expect(prompts[2]).toContain('m6Service');
  });
});

describe('glossary 页分节生成', () => {
  beforeEach(() => vi.clearAllMocks());

  function symbolsFor(moduleName: string, count: number, offset = 0) {
    return Array.from({ length: count }, (_, i) => ({
      name: `sym_${moduleName}_${offset + i}`,
      type: 'function' as SymbolType,
      filePath: `src/${moduleName}/f${offset + i}.ts`,
      startLine: i + 1,
      docstring: null,
      signature: null,
    }));
  }

  it('按模块整组入节，同模块符号不跨节碎片化', async () => {
    const ctx: GlossaryContext = {
      symbols: [...symbolsFor('knowledge', 15), ...symbolsFor('services', 10), ...symbolsFor('core', 5)],
    };
    mockStreamText.mockImplementation((() => streamResult('## 概念组\n\n表格')) as any);

    const notices: PageGenNotice[] = [];
    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key', n => notices.push(n));
    await generator.generateGlossary(ctx, vi.fn());

    expect(mockStreamText).toHaveBeenCalledTimes(2);
    const prompts = mockStreamText.mock.calls.map(c => (c[0] as any).prompt as string);

    expect(prompts[0]).toContain('sym_knowledge_0');
    expect(prompts[0]).not.toContain('sym_services_0');
    expect(prompts[1]).toContain('sym_services_0');
    expect(prompts[1]).toContain('sym_core_0');
    expect(prompts[1]).not.toContain('sym_knowledge_0');

    // 页面开头说明只由第 1 节承担
    const systems = mockStreamText.mock.calls.map(c => (c[0] as any).system as string);
    expect(systems[0]).toContain('文档价值');
    expect(systems[1]).not.toContain('文档价值');

    expect(notices).toEqual([{ kind: 'sections', sections: 2, continuedSections: 0, truncated: false }]);
  });

  it('补强符号按模块归入对应节', async () => {
    const ctx: GlossaryContext = {
      symbols: symbolsFor('knowledge', 15),
      supplementalSymbols: [{
        name: 'supService', type: 'class' as SymbolType,
        file: 'src/knowledge/sup.ts', complexity: 12, signature: 'x',
      }],
    };
    mockStreamText.mockImplementation((() => streamResult('## 概念组\n\n表格')) as any);

    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key');
    await generator.generateGlossary(ctx, vi.fn());

    const prompts = mockStreamText.mock.calls.map(c => (c[0] as any).prompt as string);
    expect(prompts[0]).toContain('supService');
  });
});

describe('分节与断流续写协同', () => {
  beforeEach(() => vi.clearAllMocks());

  it('节内截断自动续写，计入 continuedSections', async () => {
    const ctx: ModulesContext = { modules: [mod('solo')] };
    const LONG = '这是足够长的详解内容。'.repeat(30);
    mockStreamText
      .mockReturnValueOnce(streamResult('## 组织方式概述\n\n概述内容', 'stop') as any)
      .mockReturnValueOnce(streamResult(`## 模块详解\n\n${LONG}\n\n半截`, 'length') as any)
      .mockReturnValueOnce(streamResult('## 补齐的小节\n\n完整内容。', 'stop') as any);

    const notices: PageGenNotice[] = [];
    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key', n => notices.push(n));
    const result = await generator.generateModules(ctx, vi.fn());

    expect(mockStreamText).toHaveBeenCalledTimes(3);
    const third = mockStreamText.mock.calls[2][0] as any;
    expect(third.messages).toBeDefined();
    expect(third.messages[1].content).toContain('模块详解');

    expect(result).toContain('## 补齐的小节');
    expect(result).not.toContain('半截');
    expect(notices).toEqual([{ kind: 'sections', sections: 2, continuedSections: 1, truncated: false }]);
  });

  it('任一节为空则整页判失败返回空串', async () => {
    const ctx: ModulesContext = { modules: [mod('solo')] };
    mockStreamText
      .mockReturnValueOnce(streamResult('## 组织方式概述\n\n概述内容', 'stop') as any)
      .mockReturnValueOnce(streamResult('', 'stop') as any);

    const generator = new WikiPageGenerator('test-model', 'http://localhost', 'key');
    const result = await generator.generateModules(ctx, vi.fn());

    expect(result).toBe('');
    expect(mockStreamText).toHaveBeenCalledTimes(2);
  });
});
