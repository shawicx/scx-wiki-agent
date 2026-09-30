/**
 * Evidence-ID（grounded generation 试点，topic 页）：
 *
 * 生成前：把页面 context 的每条证据（符号/调用边/边界/意图）编号为稳定的
 * E1..En（确定性排序：类别 → 锚点 → 名称），随 prompt 下发；system prompt
 * 要求事实性声明以 [E#] 标注支撑证据。
 *
 * 生成后：确定性解析 [E#] 引用——有效引用计数（证据覆盖度量），无效引用
 * （LLM 编造的编号）计数并剥离；全部 [E#] 脚手架从成稿中移除（面向读者
 * 的锚点仍由正文 file:line 承担，R1 不变）。
 *
 * 试点范围：topic 页（topic:<id>）。跑稳（引用有效率稳定）后可推广固定页。
 * 纯函数，可独立单测。
 */

import type { TopicContext } from './types.js';

/** 单条证据引用（prompt 下发与成稿解析共用） */
export interface EvidenceRef {
  /** 稳定编号：E1..En */
  id: string;
  kind: 'symbol' | 'edge' | 'boundary' | 'intent';
  /** 符号名 / caller→callee / from→to / 意图摘要（≤40 字） */
  name: string;
  /** 证据锚点：file:line / from→to / intent anchor */
  anchor: string;
}

const KIND_ORDER: Record<EvidenceRef['kind'], number> = { symbol: 0, edge: 1, boundary: 2, intent: 3 };

/**
 * 从 topic context 构建确定性证据索引：排序键（类别, 锚点, 名称）固定，
 * context 不变则编号跨构建稳定（缓存/增量构建友好）。
 */
export function buildEvidenceIndex(
  ctx: Pick<TopicContext, 'symbols' | 'edges' | 'boundaries' | 'intent'>,
): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  for (const s of ctx.symbols) {
    refs.push({
      id: '',
      kind: 'symbol',
      name: s.name,
      anchor: s.startLine && s.startLine > 0 ? `${s.file}:${s.startLine}` : s.file,
    });
  }
  for (const e of ctx.edges) {
    refs.push({
      id: '',
      kind: 'edge',
      name: `${e.caller}→${e.callee}`,
      anchor: e.line > 0 ? `${e.file}:${e.line}` : e.file,
    });
  }
  for (const b of ctx.boundaries) {
    refs.push({ id: '', kind: 'boundary', name: `${b.from}→${b.to}`, anchor: `${b.from}→${b.to}（${b.callCount} 次调用）` });
  }
  for (const i of ctx.intent ?? []) {
    refs.push({ id: '', kind: 'intent', name: i.text.slice(0, 40), anchor: i.anchor });
  }
  refs.sort((a, b) =>
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || a.anchor.localeCompare(b.anchor)
    || a.name.localeCompare(b.name),
  );
  return refs.map((r, i) => ({ ...r, id: `E${i + 1}` }));
}

export interface CitationResolution {
  /** 剥离全部 [E#] 脚手架后的成稿 */
  content: string;
  /** 有效引用次数（编号存在于索引） */
  cited: number;
  /** 无效引用次数（LLM 编造的编号） */
  invalid: number;
}

/** [E#] 引用标记（含 fenced 代码块外的全文范围；编号脚手架不应进代码块） */
const CITATION_RE = /\[(E\d+)\]/g;

/**
 * 解析成稿中的证据引用：有效/无效计数，并剥离全部 [E#] 标记
 * （脚手架不面向读者；正文的 file:line 锚点承担可验证性）。
 */
export function resolveEvidenceCitations(content: string, index: EvidenceRef[]): CitationResolution {
  const ids = new Set(index.map(r => r.id));
  let cited = 0;
  let invalid = 0;
  const stripped = content.replace(CITATION_RE, (_m, id: string) => {
    if (ids.has(id)) {
      cited++;
      return '';
    }
    invalid++;
    return '';
  });
  return { content: stripped, cited, invalid };
}
