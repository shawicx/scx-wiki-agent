/** 文档小节与测试意图提取（doc-section / test-spec 证据通道）。 */

import type { IntentEvidence } from './shared.js';
import { TEST_TITLE_RE, TITLES_PER_TEST_FILE } from './shared.js';

/** markdown 文档切节：heading + 首段摘录 */
export function docSections(rel: string, src: string): IntentEvidence[] {
  const lines = src.split('\n');
  const sections: IntentEvidence[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,3})\s+(.{1,80})/);
    if (!m) continue;
    const level = m[1].length;
    const heading = m[2].trim();
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const headingUp = lines[j].match(/^(#{1,3})\s/);
      if (headingUp) {
        if (headingUp[1].length <= level) break;
        continue;
      }
      const t = lines[j].trim();
      if (t === '') { if (body.length > 0) break; continue; }
      body.push(t);
      if (body.join(' ').length > 220) break;
    }
    const excerpt = body.join(' ').slice(0, 200).trimEnd();
    if (excerpt.length < 10) continue;
    sections.push({
      kind: 'doc-section',
      target: { file: rel, line: i + 1 },
      text: `${heading}：${excerpt}`,
      anchor: `${rel}#${heading}`,
    });
  }
  return sections;
}

/**
 * 测试用例名证据：target.file = 解析出的被测源文件（解析不出锚定测试文件自身）。
 * 纯函数：文件相对路径列表 + 源码读取器注入（缓存由 provider 层负责）。
 */
export function collectTestSpecs(
  codeFiles: string[],
  allFiles: string[],
  readSource: (rel: string) => string | null,
): IntentEvidence[] {
  const codeFilesByStem = new Map<string, string[]>();
  for (const rel of codeFiles) {
    const stem = rel.split('/').pop()!.replace(/\.[^.]+$/, '');
    const list = codeFilesByStem.get(stem) ?? [];
    list.push(rel);
    codeFilesByStem.set(stem, list);
  }

  const out: IntentEvidence[] = [];
  for (const rel of allFiles) {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel)) continue;
    const src = readSource(rel);
    if (src === null) continue;
    const lines = src.split('\n');
    const titles: string[] = [];
    let firstLine = 0;
    for (let i = 0; i < lines.length && titles.length < TITLES_PER_TEST_FILE; i++) {
      const m = lines[i].match(TEST_TITLE_RE);
      if (!m) continue;
      if (firstLine === 0) firstLine = i + 1;
      titles.push(m[1]);
    }
    if (titles.length === 0) continue;
    const stem = rel.split('/').pop()!.replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/, '');
    const candidates = codeFilesByStem.get(stem) ?? [];
    // 同名源文件唯一时锚定之；多个时取路径目录重合最多者（tests/knowledge/x → src/knowledge/x）
    let target: string;
    if (candidates.length === 1) {
      target = candidates[0];
    } else if (candidates.length > 1) {
      const testDirs = rel.split('/').slice(0, -1);
      target = candidates
        .map(c => ({ c, score: c.split('/').slice(0, -1).filter((d, idx) => testDirs[idx] === d).length }))
        .sort((a, b) => b.score - a.score)[0].c;
    } else {
      target = rel;
    }
    out.push({
      kind: 'test-spec',
      target: { file: target },
      text: `行为承诺（${rel}）：${titles.join('；')}`,
      anchor: `${rel}:${firstLine}`,
    });
  }
  return out;
}
