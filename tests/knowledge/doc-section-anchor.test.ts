/** doc-section 证据锚点 slug 归一：生成侧与校验侧 headingSlug 同口径。 */

import { describe, it, expect } from 'vitest';
import { docSections } from '../../src/knowledge/intent/docs-tests.js';
import { headingSlug } from '../../src/knowledge/quality/anchors.js';

describe('docSections 锚点 slug', () => {
  it('英文标题大小写归一（#Features → #features），中文标题原样保留', () => {
    const src = [
      '# scx-nexvia',
      '',
      '## Features',
      '',
      'Subscriptions and routing presets shared across platforms.',
      '',
      '## 中文小节',
      '',
      '双端共享的订阅解析语义说明文字足够长度才成节。',
    ].join('\n');
    const sections = docSections('README.md', src);
    const anchors = sections.map(s => s.anchor);
    // 旧口径 README.md#Features 在校验侧 slug 化后不匹配（broken-anchor 误报）
    expect(anchors).toContain('README.md#features');
    expect(anchors).toContain(`README.md#${headingSlug('中文小节')}`);
    expect(anchors).not.toContain('README.md#Features');
    // 证据文本仍保留原始标题（读者可读）
    expect(sections.find(s => s.anchor === 'README.md#features')?.text).toContain('Features');
  });
});
