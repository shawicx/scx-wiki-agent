/**
 * LLM 生成 wiki 输出的轻量后处理。
 *
 * 思考模型/部分 provider 会在正文前混入对话残骸（"好的，作为…"/"根据您提供的JSON数据…"），
 * 或用 ```markdown 围栏包裹整个输出。本模块做确定性清理，不调用 LLM。
 *
 * fallback 路径（规则生成）无需过此 sanitizer。
 */

/** 常见的对话残骸/寒暄前导语开头特征 */
const PREAMBLE_PATTERNS = [
  /^(好的|当然|没问题|明白了|收到|根据您?提供的|基于(提供|给定)的|作为.{0,20}(专家|架构师|工程师|助手)|我来|我将|我会|以下是|下面是|这份文档)/,
];

/**
 * 清理 LLM 输出：移除首行寒暄前导语 + 去除整体 markdown 围栏。
 * 保留首个 # / ## 标题及之后的所有内容。
 *
 * 处理顺序：先 stripPreamble（把 ``` 也视为结构行，截到围栏处），
 * 再 stripCodeFences（此时围栏已在开头）。
 *
 * @param pageName 页面名，用于 R2 sequenceDiagram 违规告警（仅 calls 页允许时序图）
 */
export function sanitizeWikiOutput(raw: string, pageName?: string): string {
  let text = stripPreamble(raw);
  text = stripCodeFences(text);
  text = repairBrokenTableRows(text);
  text = stripFillerCells(text);
  // R2: sequenceDiagram 仅允许出现在 calls 页（其他页应使用边表）
  if (pageName && pageName !== 'calls' && /sequenceDiagram/.test(text)) {
    console.warn(`[wiki-sanitizer] R2 违规：${pageName}.md 检测到 sequenceDiagram，应改用边表（时序图仅 calls 页允许）。`);
  }
  return text.trim();
}

/**
 * 「数据未提供（…）」类数据集口吻填充确定性降级为「—」：
 * system prompt 已禁止该措辞但 LLM 偶发不遵守（实测 modules.md 28 行）。
 * 如实声明边界应使用「未检出/无证据」措辞，不属于本替换范围。
 */
export function stripFillerCells(text: string): string {
  return text.replace(/数据未提供（[^）\n]*）/g, '—');
}

/**
 * 修复断裂的表格行：LLM 偶发把一行拆成两段——
 * `| \`cmd\` |` 单独成行（残行），其余单元格落在下一个非空行且不以 `|` 开头。
 * 确定性合并两段（实测 api.md sftp_open 行）。只处理「残行 + 紧随的延续段」形态，
 * 普通段落/代码块不受影响。
 */
export function repairBrokenTableRows(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 残行特征：以 | 开头、| 结尾、只有一个内容单元格（| x | 形态）
    const isStub = /^\|\s*[^\n|]+\s*\|$/.test(line.trim());
    if (isStub) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      const next = lines[j];
      // 延续段：非空、不是新表格行/标题/列表/围栏，且含 `|`（其余单元格在同一段里）
      if (next && !/^\||^#{1,6}\s|^[-*]\s|^```/.test(next.trim()) && next.includes('|')) {
        out.push(`${line} ${next.trim()}`);
        i = j;
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

/**
 * 去除整个内容被 ```markdown ... ``` 包裹的情况。
 * 仅当首行是 ``` 开头且末行是 ``` 时处理。
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  return fenceMatch ? fenceMatch[1] : text;
}

/**
 * 移除首行寒暄前导语。
 * 从首行开始扫描，跳过所有"非标题/非表格/非列表"的开场白行，
 * 直到遇到第一个 Markdown 结构行（# 标题、| 表格、- 列表、> 引用、``` 代码块）。
 */
function stripPreamble(text: string): string {
  const lines = text.split('\n');

  // 找第一个"结构性"行的索引
  const structIdx = lines.findIndex(line =>
    /^(#{1,6}\s|\||->|>|```|-\s|\d+\.\s)/.test(line.trim()),
  );

  if (structIdx <= 0) {
    // 没找到结构行，或首行就是结构行 —— 检查首行是否匹配残骸模式
    if (PREAMBLE_PATTERNS.some(re => re.test(lines[0]?.trim() ?? ''))) {
      return lines.slice(1).join('\n').replace(/^\s*\n/, '');
    }
    return text;
  }

  // 若首行（结构行之前）匹配残骸模式，丢弃结构行之前的所有内容
  const headLines = lines.slice(0, structIdx).join(' ').trim();
  if (structIdx > 0 && PREAMBLE_PATTERNS.some(re => re.test(headLines))) {
    return lines.slice(structIdx).join('\n');
  }

  return text;
}
