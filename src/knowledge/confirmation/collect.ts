/**
 * 待确认项收集（准入分层，防伪待办）：
 * - claim 只认工具注入的 pending marker（`<!-- wiki:pending:claim:… -->`），
 *   被引用的格式说明原文（如 docstring 里引用的本模块注释）因无 marker 豁免；
 * - note 只认行首工具形态（`> ⚠️ **待确认**：`）；
 * - cell 只认表格行内的 ⚠️ 标记（key 带最近表头，防跨表撞名误聚合）；
 * - prose 只收非表格、非 `<details>` 证据块、非围栏内的正文行（实测证据
 *   引用全部出现在表格行）。
 */

import { parsePendingMarkers } from '../wiki-markers.js';
import {
  addPending,
  CELL_MARKER,
  NOTE_RE,
  noteText,
  cellLabel,
} from './types.js';
import type { PendingConfirmation } from './types.js';

/** 收集全部页面正文中的待确认项（跨页聚合去重；跳过 fenced 代码块与 <details> 证据块） */
export function collectPendingConfirmations(
  pages: Array<{ page: string; content: string }>,
): PendingConfirmation[] {
  const byKey = new Map<string, PendingConfirmation>();
  for (const { page, content } of pages) {
    let inFence = false;
    let inDetails = false;
    let lastTableHeader = ''; // 最近表格表头行（cell 结构化 key 用）
    const lines = content.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (/^\s*<details\b/.test(line)) { inDetails = true; continue; }
      if (/<\/details>/.test(line)) { inDetails = false; continue; }
      if (inDetails) continue;

      const isTableRow = line.trim().startsWith('|');
      // 表头行跟踪：| 列名行 且下一行是 |---| 分隔行
      if (isTableRow && li + 1 < lines.length && /^\s*\|[\s:|-]*\|?\s*$/.test(lines[li + 1]) && !/^\s*\|[\s:|-]*\|?\s*$/.test(line)) {
        lastTableHeader = line.trim();
      }

      const markers = parsePendingMarkers(line);

      // claim：只认工具注入的 pending marker（被引用证据文本无 marker，天然豁免）
      let matched = false;
      for (const mk of markers) {
        if (mk.kind === 'claim' && mk.identity.length > 0) {
          addPending(byKey, 'claim', mk.identity, line, page);
          matched = true;
        }
      }

      // note：行首工具形态（unconfirmedNote 产物）；marker identity 优先
      const note = line.match(NOTE_RE);
      if (note) {
        const identity = markers.find(m => m.kind === 'note')?.identity ?? noteText(note[1] ?? '');
        addPending(byKey, 'note', identity, line, page);
        matched = true;
      }

      // cell：表格行内 ⚠️ 标记（key = 最近表头 + 行首列，防跨表撞名误聚合）
      if (!matched && isTableRow && line.includes(CELL_MARKER)) {
        addPending(byKey, 'cell', cellLabel(line, lastTableHeader), line, page);
        matched = true;
      }

      // prose：非表格正文行的「待确认」（LLM R5 自由文本；证据引用均在表格行）
      if (!matched && !isTableRow && line.includes('待确认')) {
        addPending(byKey, 'prose', line.trim().slice(0, 60), line, page);
      }
    }
  }
  return [...byKey.values()];
}
