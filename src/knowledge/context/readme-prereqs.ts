/** M6：README 前置/环境要求小节提取（onboarding 页「版本要求/系统依赖」的证据源）。 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { ContextDeps } from './shared.js';

/** heading 命中 前置/先决/环境要求/依赖要求/安装/prerequisite/requirement/install 的小节 */
const README_PREREQ_HEADING_RE = /前置|先决|环境要求|环境准备|依赖要求|系统要求|prerequisite|requirement|安装|install/i;

export interface ReadmePrereqSection {
  title: string;
  text: string;
  anchor: string;
}

export function readmePrereqSections(deps: ContextDeps, maxSections = 4): ReadmePrereqSection[] {
  let content: string;
  try {
    content = readFileSync(join(deps.scanResult.rootDir, 'README.md'), 'utf-8');
  } catch {
    return [];
  }
  const sections: ReadmePrereqSection[] = [];
  const headingRe = /^#{1,4}\s+(.+)$/gm;
  const heads: Array<{ title: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(content)) !== null) heads.push({ title: m[1].trim(), start: m.index });
  for (let i = 0; i < heads.length && sections.length < maxSections; i++) {
    if (!README_PREREQ_HEADING_RE.test(heads[i].title)) continue;
    const end = i + 1 < heads.length ? heads[i + 1].start : content.length;
    const text = content.slice(heads[i].start, end)
      .replace(/^#{1,4}\s+.+\n?/, '').trim().split('\n').slice(0, 8).join('\n')
      .slice(0, 240);
    if (text.length === 0) continue;
    sections.push({ title: heads[i].title, text, anchor: `README.md#${heads[i].title}` });
  }
  return sections;
}
