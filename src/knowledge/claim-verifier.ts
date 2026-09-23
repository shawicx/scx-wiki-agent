/**
 * 正文断言校验（DeepWiki-Open 文本断言交叉核验的确定性实现）。
 *
 * 抽取 LLM 生成正文 inline 代码片段中的标识符声明，三级核验：
 * 图谱符号全集 → 扫描文件名干 → search_code 词法探测（import/注释/配置中出现也算实据）。
 * 查无实据的声明改写为「待确认」标注（R5 风格，保留信息量），统计进构建报告。
 *
 * 仅作用于 LLM 生成路径（fallback 页由真实数据确定性生成，不过校验）。
 * 纯函数核心 + 注入式探测回调，可独立单测；探测失败按有实据处理（不误标）。
 */

import { WIKI_MAX_GREP_PROBES } from '../shared/constants.js';

/** 单个声明：raw = 反引号内原文（用于改写定位），name = 末段标识符（用于核验） */
interface Claim {
  raw: string;
  name: string;
}

export interface ClaimStats {
  /** 抽取的声明数（按原文去重） */
  total: number;
  /** 三级核验通过 */
  verified: number;
  /** 查无实据 → 已标注待确认 */
  unverified: number;
  /** 超出探测上限未核验（不标注） */
  skipped: number;
}

export interface ClaimVerifyContext {
  /** 图谱符号名全集（构建内一次查询缓存） */
  symbols: ReadonlySet<string>;
  /** 扫描清单内文件相对路径 */
  knownFiles: ReadonlySet<string>;
  /** 词法存在性探测；返回 grep 命中数，抛错按有实据处理 */
  grepCount: (pattern: string) => number;
}

/** 不参与核验的 JS 字面量/关键字（末段或整词命中即跳过） */
const NON_CLAIM_WORDS = new Set([
  'true', 'false', 'null', 'undefined', 'this', 'typeof', 'instanceof',
  'string', 'number', 'boolean', 'const', 'async', 'await', 'return',
]);

/** 提取 inline 反引号片段中的标识符声明（跳过 fenced 代码块） */
export function extractClaims(markdown: string): Claim[] {
  const seen = new Set<string>();
  const claims: Claim[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const span = m[1].trim();
      const name = normalizeClaim(span);
      if (name && !seen.has(span)) {
        seen.add(span);
        claims.push({ raw: span, name });
      }
    }
  }
  return claims;
}

/** 归一化为可核验标识符名：剥调用括号、点链取末段；路径/短语/短词/字面量/非 ASCII 返回 null */
function normalizeClaim(raw: string): string | null {
  const s = raw.replace(/\(\s*\)$/, '');
  if (s.includes('/') || /\s/.test(s)) return null;
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(s)) return null;
  const name = s.split('.').pop()!;
  if (name.length < 3) return null;
  if (NON_CLAIM_WORDS.has(s) || NON_CLAIM_WORDS.has(name)) return null;
  return name;
}

/** 核验并标注：返回改写后正文与统计 */
export function verifyAndAnnotateClaims(
  markdown: string,
  ctx: ClaimVerifyContext,
): { content: string; stats: ClaimStats } {
  const claims = extractClaims(markdown);
  const stems = fileStems(ctx.knownFiles);
  const locallyVerified = (name: string) => ctx.symbols.has(name) || stems.has(name);

  const verdictByName = new Map<string, boolean>();
  const probedNames = new Set<string>();
  let probes = 0;
  const badRaws = new Set<string>();

  for (const { raw, name } of claims) {
    let verdict = verdictByName.get(name);
    if (verdict === undefined) {
      if (locallyVerified(name)) {
        verdict = true;
      } else if (probes >= WIKI_MAX_GREP_PROBES) {
        verdict = true; // 上限外不核验不标注（计 skipped）
      } else {
        probes++;
        probedNames.add(name);
        try {
          verdict = ctx.grepCount(name) > 0;
        } catch {
          verdict = true; // 探测失败按有实据处理，宁漏勿误
        }
      }
      verdictByName.set(name, verdict);
    }
    if (!verdict) badRaws.add(raw);
  }

  let skipped = 0;
  for (const name of verdictByName.keys()) {
    if (!locallyVerified(name) && !probedNames.has(name)) skipped++;
  }

  let content = markdown;
  for (const raw of badRaws) {
    content = content.split(`\`${raw}\``).join(`\`${raw}\`（待确认）`);
  }

  return {
    content,
    stats: {
      total: claims.length,
      verified: claims.length - badRaws.size - skipped,
      unverified: badRaws.size,
      skipped,
    },
  };
}

/** 扫描文件名干集合（`src/a/outline.ts` → `outline`） */
function fileStems(files: ReadonlySet<string>): Set<string> {
  const stems = new Set<string>();
  for (const f of files) {
    const base = f.split('/').pop() ?? f;
    stems.add(base.replace(/\.[^.]+$/, ''));
  }
  return stems;
}
