/** Wiki 时效戳：README 索引页头注入生成基准（commit + 日期），过期状态对读者/AI 可感知。 */

import type { ProducedEntry } from './types.js';

/** 时效戳正则：匹配既有戳行（幂等替换；commit 段允许空=无 git 仓库） */
const FRESHNESS_RE = /^> 本 Wiki 基于 commit `[0-9a-z]*`(?:（无 git）)?（\d{4}-\d{2}-\d{2}）生成.*$/m;

/** README 索引页头注入/刷新生成基准戳。只改 README 一页：update 模式其余页的
 *  内容一致跳过不受影响（戳变 → 仅 README 重写）。 */
export function stampFreshness(entries: ProducedEntry[], repoHead: string | null): void {
  const readme = entries.find(e => e.page === 'readme');
  if (!readme) return;
  const head8 = repoHead?.slice(0, 8) ?? '';
  const stamp = `> 本 Wiki 基于 commit \`${head8}\`${head8 ? '' : '（无 git）'}（${new Date().toISOString().slice(0, 10)}）生成；代码演进后请重新构建以保证内容与实现一致。`;
  const lines = readme.content.split('\n');
  const existing = lines.findIndex(l => FRESHNESS_RE.test(l));
  if (existing >= 0) {
    if (lines[existing] === stamp) return; // 同 HEAD 同日重建：内容不变，保留 update 跳过
    lines[existing] = stamp;
  } else {
    // 插在首个一级标题行之后（空行分隔）
    const titleIdx = lines.findIndex(l => l.startsWith('# '));
    lines.splice(titleIdx >= 0 ? titleIdx + 1 : 0, 0, '', stamp);
  }
  readme.content = lines.join('\n');
}
