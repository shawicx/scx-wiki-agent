/**
 * 裁决应用与 replacement 安全校验。
 * marker 是会话期脚手架：applyConfirmations 消费后，写盘前由 wiki-service
 * 统一 stripPendingMarkers（keep 项的可见「待确认」文本保留）。
 * 用户输入的 replacement 先过 validateReplacement（拒绝密钥泄漏/残缺 Markdown），
 * 违规按 keep 处理。
 */

import { parsePendingMarkers, pendingMarker } from '../wiki-markers.js';
import { findSecretDetail } from '../wiki-quality-validator.js';
import { CELL_MARKER, NOTE_RE, noteText, cellLabel } from './types.js';
import type { ConfirmationDecision } from './types.js';

/** 应用裁决：返回改写后正文（keep 项与未裁决项原样保留；无效 replacement 按 keep 处理） */
export function applyConfirmations(
  content: string,
  decisions: ReadonlyMap<string, ConfirmationDecision>,
): string {
  if (decisions.size === 0) return content;
  const outLines: string[] = [];
  let inFence = false;
  let lastTableHeader = '';
  const lines = content.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      outLines.push(line);
      continue;
    }
    if (!inFence) {
      const isTableRow = line.trim().startsWith('|');
      if (isTableRow && li + 1 < lines.length && /^\s*\|[\s:|-]*\|?\s*$/.test(lines[li + 1]) && !/^\s*\|[\s:|-]*\|?\s*$/.test(line)) {
        lastTableHeader = line.trim();
      }
      const rewritten = rewriteLine(line, decisions, lastTableHeader);
      if (rewritten !== null) {
        if (rewritten !== '') outLines.push(rewritten);
        continue;
      }
    }
    outLines.push(line);
  }
  return outLines.join('\n');
}

/**
 * 用户输入的 replacement 安全校验：拒绝密钥泄漏、残缺 Markdown（反引号不配对）、
 * marker 注入与超长输入。返回违规原因，合规返回 null。
 */
export function validateReplacement(text: string): string | null {
  if (text.includes('<!--')) return '含 HTML 注释（禁止注入标记）';
  if (findSecretDetail(text)) return '疑似密钥/凭证内容';
  const ticks = (text.match(/`/g) ?? []).length;
  if (ticks % 2 !== 0) return '反引号不配对（inline code 残缺）';
  if (text.length > 600) return '过长（>600 字符）';
  return null;
}

/** 单行改写（围栏外）；返回 null 表示无裁决命中（原样保留，marker 由写盘前统一剥离） */
function rewriteLine(
  line: string,
  decisions: ReadonlyMap<string, ConfirmationDecision>,
  lastTableHeader: string,
): string | null {
  const markers = parsePendingMarkers(line);

  // claim：按 marker identity 裁决；resolve 移除可见标记与 marker
  const claimIds = markers.filter(m => m.kind === 'claim' && m.identity.length > 0).map(m => m.identity);
  if (claimIds.length > 0) {
    let out = line;
    for (const id of claimIds) {
      const d = decisions.get(`claim\n${id}`);
      if (d?.action === 'resolve') {
        out = out
          .split(`\`${id}\`（待确认）<!-- ${pendingMarker('claim', id)} -->`)
          .join(`\`${id}\``);
      }
    }
    return out;
  }

  const note = line.match(NOTE_RE);
  if (note) {
    const identity = markers.find(m => m.kind === 'note')?.identity ?? noteText(note[1] ?? '');
    const d = decisions.get(`note\n${identity}`);
    if (d?.action === 'resolve') {
      if (d.replacement && d.replacement.length > 0) {
        const violation = validateReplacement(d.replacement);
        return violation === null ? `> ✅ ${d.replacement}` : null;
      }
      return '';
    }
    return null;
  }

  if (line.includes(CELL_MARKER)) {
    const d = decisions.get(`cell\n${cellLabel(line, lastTableHeader)}`);
    if (d?.action === 'resolve') {
      const replacement = d.replacement?.trim() ?? '';
      if (replacement.length > 0 && validateReplacement(replacement) !== null) return null;
      return line.split(CELL_MARKER).join(replacement || '已确认');
    }
    return null;
  }

  if (line.includes('待确认')) {
    const d = decisions.get(`prose\n${line.trim().slice(0, 60)}`);
    if (d?.action === 'resolve' && d.replacement && d.replacement.length > 0) {
      return validateReplacement(d.replacement) === null ? d.replacement : null;
    }
    return null;
  }

  return null;
}
