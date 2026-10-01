/** 注释证据挖掘：文件头自述 / 符号注释 / why-marker / 限制常量注释。 */

import type { IntentEvidence } from './shared.js';
import {
  cleanCommentText,
  commentContent,
  constDefMatch,
  sanitizeText,
  SYMBOL_COMMENTS_PER_FILE,
  topLevelDef,
  WHY_MARKER_RE,
  WHY_MARKERS_PER_FILE,
} from './shared.js';

/** 单文件注释证据提取（纯函数；缓存由 provider 层负责） */
export function collectCommentEvidence(rel: string, src: string, domain: string): IntentEvidence[] {
  const lines = src.split('\n');
  const evidence: IntentEvidence[] = [];

  // 文件头：首段连续注释（跳过 shebang 与版权行，剩余 ≥12 字符才算自述）。
  // Python 模块级 docstring 与 # 注释（Python/Go）同为本通道来源。
  let header: string[] = [];
  let inDocstring = false;
  for (const line of lines) {
    const t = line.trim();
    if (t === '') { if (header.length > 0) break; continue; }
    if (t.startsWith('#!')) continue;
    const q = t.startsWith('"""') ? '"""' : t.startsWith("'''") ? "'''" : null;
    if (inDocstring || q !== null) {
      // docstring 行：剥引号取正文；单行自闭合（"xxx"）即结束
      const body = t.replace(/^['"]{0,3}/, '').replace(/['"]{0,3}$/, '');
      if (body.trim()) header.push(body);
      if (q !== null && t.indexOf(q, 3) >= 0) break;
      inDocstring = true;
      continue;
    }
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('#')) {
      const c = commentContent(line);
      if (c !== null && !/^(copyright|licensed|spdx|@license)/i.test(c.trim())) header.push(c);
      if (t.includes('*/') && t.startsWith('/*')) break;
      continue;
    }
    break;
  }
  const headerText = sanitizeText(cleanCommentText(header.join(' ')));
  // 头注释仅复述文件路径（如「// src/knowledge/types.ts」）时是噪音，不构成意图证据
  if (headerText.length >= 12 && headerText !== rel && !headerText.endsWith(rel.split('/').pop()!)) {
    evidence.push({
      kind: 'file-header',
      target: { file: rel, line: 1 },
      text: headerText,
      anchor: `${rel}:1`,
    });
  }

  // 符号注释：顶层定义行上方紧邻注释（≤3 行，遇空行停）
  let symbolFound = 0;
  for (let i = 0; i < lines.length && symbolFound < SYMBOL_COMMENTS_PER_FILE; i++) {
    const def = topLevelDef(lines[i], domain);
    if (!def) continue;
    const commentLines: string[] = [];
    for (let j = i - 1; j >= 0 && commentLines.length < 3 && i - j <= 4; j--) {
      const t = lines[j].trim();
      if (t === '') break;
      const c = commentContent(lines[j]);
      if (c === null) break;
      commentLines.unshift(c);
    }
    const text = sanitizeText(cleanCommentText(commentLines.join(' ')));
    if (text.length >= 8) {
      symbolFound++;
      evidence.push({
        kind: 'symbol-comment',
        target: { file: rel, line: i + 1, symbol: def.name },
        text,
        anchor: `${rel}:${i + 1}`,
      });
    }
  }

  // why-marker：注释行中的 TODO/FIXME/HACK/... 标记（≤5 条/文件）
  let markersFound = 0;
  for (let i = 0; i < lines.length && markersFound < WHY_MARKERS_PER_FILE; i++) {
    const c = commentContent(lines[i]);
    if (c === null) continue;
    const m = c.match(WHY_MARKER_RE);
    if (!m) continue;
    const text = sanitizeText(cleanCommentText(`${m[1]}: ${m[2]}`));
    if (text.length < 6) continue;
    markersFound++;
    evidence.push({
      kind: 'why-marker',
      target: { file: rel, line: i + 1 },
      text,
      anchor: `${rel}:${i + 1}`,
    });
  }

  // 常量注释：限制常量定义行的同行尾注释或上一行注释
  for (let i = 0; i < lines.length; i++) {
    const m = constDefMatch(lines[i], domain);
    if (!m) continue;
    const name = m.name;
    const inline = lines[i].match(/(?:\/\/|#)\s*(.+)$/);
    const prevC = i > 0 ? commentContent(lines[i - 1]) : null;
    const raw = inline ? inline[1] : prevC;
    if (!raw) continue;
    const text = sanitizeText(cleanCommentText(raw));
    if (text.length < 4) continue;
    evidence.push({
      kind: 'const-comment',
      target: { file: rel, line: i + 1, symbol: name },
      text,
      anchor: `${rel}:${i + 1}`,
    });
  }

  return evidence;
}
