/**
 * 断流检测与自动续写的纯函数部分（不依赖 AI SDK，可独立单测）。
 *
 * 续写策略：截断产物先在「安全切点」截齐（丢弃残缺的代码块/段落/表格行），
 * 再携带安全前缀发起续写，拼接后仍走质量闸门兜底。
 */

/** 判定一轮流式输出是否异常终止（输出预算耗尽或流中途出错） */
export function isAbnormalFinish(finish: string | undefined): boolean {
  return finish === 'length' || finish === 'error';
}

/** 安全前缀低于该长度时不值得发起续写调用（残骸交由闸门降级更划算） */
export const MIN_CONTINUATION_KEEP = 200;

export interface SafeCut {
  /** 截齐后的安全前缀 */
  kept: string;
}

/**
 * 在截断文本中寻找安全切点：
 * - 末尾悬在未闭合代码块内 → 切到开栏前的空行，残块由续写重新生成；
 * - 末尾是表格（流死在行中间的常见形态）→ 保留到最后一个以 | 结尾的完整行；
 * - 其余情况 → 切到围栏外最后一个空行。
 * 找不到安全切点或前缀过短时返回 null，调用方放弃续写。
 */
export function findSafeCut(text: string): SafeCut | null {
  const lines = text.split('\n');

  let endsInFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) endsInFence = !endsInFence;
  }

  let cutLine = -1;
  if (!endsInFence) {
    cutLine = lastCompleteTableRow(lines);
  }
  if (cutLine < 0) {
    cutLine = lastBlankLineOutsideFence(lines);
  }
  if (cutLine < 0) return null;

  const kept = lines.slice(0, cutLine + 1).join('\n');
  if (kept.trim().length < MIN_CONTINUATION_KEEP) return null;
  return { kept };
}

/** 围栏外最后一个空行的行号；没有则 -1 */
function lastBlankLineOutsideFence(lines: string[]): number {
  let inFence = false;
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.trim().length === 0) last = i;
  }
  return last;
}

/**
 * 末尾表格块中最后一个完整行（以 | 结尾）的行号；末尾不是表格或全为残行则 -1。
 * 从结尾空行之后向前收集连续 | 行构成表格块。
 */
function lastCompleteTableRow(lines: string[]): number {
  let end = lines.length - 1;
  while (end >= 0 && lines[end].trim().length === 0) end--;
  if (end < 0 || !lines[end].trimStart().startsWith('|')) return -1;
  let start = end;
  while (start > 0 && lines[start - 1].trimStart().startsWith('|')) start--;
  for (let i = end; i >= start; i--) {
    if (lines[i].trimEnd().endsWith('|')) return i;
  }
  return -1;
}
