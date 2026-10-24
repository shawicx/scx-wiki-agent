/** conventions 页 AGENTS.md 摘录安全截断：未配对代码围栏不再产生结构损坏页。 */

import { describe, it, expect } from 'vitest';
import { buildConventions } from '../../src/knowledge/fallback/meta.js';
import type { ConventionsContext } from '../../src/knowledge/types.js';

const ctx = (agentsMd?: string): ConventionsContext => ({
  hasLinter: false,
  linterConfig: null,
  hasEditorConfig: false,
  editorConfig: null,
  agentsMd,
  constants: [],
  intent: [],
} as unknown as ConventionsContext);

describe('buildConventions：AGENTS.md 摘录截断', () => {
  it('500 字符截断吞掉闭合围栏时补围栏并标注，页面围栏配对', () => {
    const fence = '`'.repeat(3);
    const longBlock = `${fence}\nmacos/Sources/\n  NexviaCore/ ${'共享库说明文字。'.repeat(80)}\n${fence}`;
    const agentsMd = `# AGENTS\n\n## 架构地图\n\n${longBlock}\n\n## 其它段\n\n普通内容。\n`;
    const page = buildConventions(ctx(agentsMd));
    // 页面整体围栏数量必须配对（奇数即结构损坏，incomplete-page 会拦截）
    const fences = (page.match(/^```/gm) ?? []).length;
    expect(fences % 2).toBe(0);
    expect(page).toContain('此处截断');
  });

  it('无围栏或围栏完整的段落照旧截断，不添加标注', () => {
    const agentsMd = `# AGENTS\n\n## 提交规范\n\nConventional Commits + 中文描述，${'规约细节。'.repeat(60)}\n`;
    const page = buildConventions(ctx(agentsMd));
    expect(page).not.toContain('此处截断');
    expect(page).toContain('提交规范');
  });
});
