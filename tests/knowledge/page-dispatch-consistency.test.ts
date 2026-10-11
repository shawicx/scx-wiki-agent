import { describe, it, expect } from 'vitest';
import { ALL_PAGE_NAMES, LLM_EXEMPT_PAGES } from '../../src/knowledge/page-registry.js';
import { CONTEXT_PAGES } from '../../src/knowledge/context/index.js';
import { GENERATOR_PAGES } from '../../src/knowledge/generator/index.js';
import { FALLBACK_PAGES } from '../../src/knowledge/fallback/index.js';

/**
 * M1：三路页面分发的注册表一致性静态校验。
 * 旧实现是三个并行 switch（default 静默 null/''），漏 case 只在运行期以
 * 「页面被静默跳过/悄悄降级」表现；本测试把该失败模式前移到 CI。
 */
describe('页面分发注册表一致性（漏 case 在 CI 拦截）', () => {
  const registry = [...ALL_PAGE_NAMES].sort();

  it('CONTEXT_PAGES 键集与 PAGE_REGISTRY 完全一致', () => {
    expect(Object.keys(CONTEXT_PAGES).sort()).toEqual(registry);
  });

  it('FALLBACK_PAGES 键集与 PAGE_REGISTRY 完全一致', () => {
    expect(Object.keys(FALLBACK_PAGES).sort()).toEqual(registry);
  });

  it('GENERATOR_PAGES 键集 + LLM_EXEMPT_PAGES 与 PAGE_REGISTRY 一致（无页面被静默降级）', () => {
    const generatorCovered = [...Object.keys(GENERATOR_PAGES), ...LLM_EXEMPT_PAGES].sort();
    expect(generatorCovered).toEqual(registry);
    // 豁免清单本身不得与生成器键集重叠（重复注册同样是错误）
    for (const page of LLM_EXEMPT_PAGES) {
      expect(GENERATOR_PAGES[page]).toBeUndefined();
    }
  });
});
