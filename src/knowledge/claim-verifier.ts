/**
 * 正文断言校验（DeepWiki-Open 文本断言交叉核验的确定性实现）。
 *
 * 抽取 LLM 生成正文 inline 代码片段中的标识符声明，三级核验：
 * 图谱符号全集（简名 + qualified_name 后缀匹配，点链全串优先、逐级回退到末段）
 * → 扫描文件名干 → 词法证据探测（注入式回调，区分代码实据与纯注释/配置提及：
 * 仅 definition/usage 算功能实据）。
 * 查无实据或仅提及的声明改写为「待确认」标注（R5 风格，保留信息量），
 * 统计进构建报告（含仅提及与同名歧义计数）。
 *
 * 注意：本模块是「存在性 + 证据类别」核验，不是语义正确性核验——
 * 真名字 + 假语义的声明由 R1-R7 prompt 纪律与质量闸门约束。
 *
 * 仅作用于 LLM 生成路径（fallback 页由真实数据确定性生成，不过校验）。
 * 纯函数核心 + 注入式探测回调，可独立单测；探测失败按有实据处理（不误标）。
 */

import { WIKI_MAX_GREP_PROBES } from '../shared/constants.js';
import { pendingMarker } from './wiki-markers.js';

/** 单个声明：raw = 反引号内原文（改写定位），chain = 完整点链（优先核验），name = 末段标识符（回退核验/探测） */
interface Claim {
  raw: string;
  chain: string;
  name: string;
}

/** 词法证据类别：usage = 定义/调用/import 等代码实据；mention = 仅注释/配置提及 */
export type ProbeEvidenceKind = 'usage' | 'mention';

export interface ClaimStats {
  /** 抽取的声明数（按原文去重） */
  total: number;
  /** 三级核验通过 */
  verified: number;
  /** 查无实据或仅提及 → 已标注待确认 */
  unverified: number;
  /** 其中「仅注释/配置提及」（无代码实据）的子集 */
  mentionOnly: number;
  /** 解析到多个文件的同名符号数（歧义提示，不拦截） */
  ambiguous: number;
  /** 超出探测上限未核验（不标注） */
  skipped: number;
}

export interface ClaimVerifyContext {
  /** 图谱符号名全集（构建内一次查询缓存；含源码回落/依赖/数据字段名） */
  symbols: ReadonlySet<string>;
  /** 图谱 qualified_name 全串集（可选）：点链声明按后缀匹配，消灭 qualified 假阴性 */
  qualifiedNames?: ReadonlySet<string>;
  /** 简名 → 出现文件集（可选）：同名多文件符号计入歧义统计 */
  symbolFiles?: ReadonlyMap<string, ReadonlySet<string>>;
  /** 扫描清单内文件相对路径 */
  knownFiles: ReadonlySet<string>;
  /** 词法证据探测（三级通道）：返回证据类别，null = 无命中；抛错按有实据处理 */
  probe: (name: string) => ProbeEvidenceKind | null;
  /** 人工确认白名单（claim 原文，confirmations.json）：命中即有实据，
   *  不再标注也不占探测额度（待确认项交互裁决的持久化回写） */
  confirmed?: ReadonlySet<string>;
}

/** 不参与核验的 JS 字面量/关键字与包清单通用词汇（末段或整词命中即跳过） */
const NON_CLAIM_WORDS = new Set([
  'true', 'false', 'null', 'undefined', 'this', 'typeof', 'instanceof',
  'string', 'number', 'boolean', 'const', 'async', 'await', 'return',
  'engines', 'dependencies', 'devDependencies', 'peerDependencies',
  'repository', 'homepage', 'license', 'keywords', 'scripts',
  'dependsOn', 'usedBy', 'relations', 'moduleNames', 'otherModules',
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
      const chain = normalizeClaim(span);
      if (chain && !seen.has(span)) {
        seen.add(span);
        claims.push({ raw: span, chain, name: chain.split('.').pop()! });
      }
    }
  }
  return claims;
}

/** 归一化为可核验标识符点链：剥调用括号；路径/短语/短词/字面量/非 ASCII 返回 null */
function normalizeClaim(raw: string): string | null {
  const s = raw.replace(/\(\s*\)$/, '');
  if (s.includes('/') || /\s/.test(s)) return null;
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(s)) return null;
  const name = s.split('.').pop()!;
  if (name.length < 3) return null;
  if (NON_CLAIM_WORDS.has(s) || NON_CLAIM_WORDS.has(name)) return null;
  return s;
}

/** 点链的核验候选序列：全串 → 去首段 → … → 末段（qualified 优先，回退到短名） */
function chainCandidates(chain: string): string[] {
  const parts = chain.split('.');
  return Array.from({ length: parts.length }, (_, i) => parts.slice(i).join('.'));
}

/** qualified_name 后缀匹配：qn 全串等于候选，或以 `.候选` 结尾（`pkg.Class.method` 命中 `Class.method`） */
function matchesQualified(qualifiedNames: ReadonlySet<string>, candidate: string): boolean {
  for (const qn of qualifiedNames) {
    if (qn === candidate || qn.endsWith('.' + candidate)) return true;
  }
  return false;
}

/** 核验并标注：返回改写后正文与统计 */
export function verifyAndAnnotateClaims(
  markdown: string,
  ctx: ClaimVerifyContext,
): { content: string; stats: ClaimStats } {
  const claims = extractClaims(markdown);
  const stems = fileStems(ctx.knownFiles);
  const locallyVerified = (chain: string) =>
    chainCandidates(chain).some(
      c => ctx.symbols.has(c) || stems.has(c) || (ctx.qualifiedNames ? matchesQualified(ctx.qualifiedNames, c) : false),
    );

  const verdictByName = new Map<string, boolean>();
  const probedNames = new Set<string>();
  const whitelistedNames = new Set<string>();
  const mentionOnlyNames = new Set<string>();
  const ambiguousNames = new Set<string>();
  let probes = 0;
  const badRaws = new Set<string>();

  for (const { raw, chain, name } of claims) {
    // 同名歧义统计（不拦截）：末段名解析到多个文件的符号
    if (ctx.symbolFiles) {
      const files = ctx.symbolFiles.get(name);
      if (files && files.size > 1) ambiguousNames.add(name);
    }
    if (ctx.confirmed?.has(raw)) {
      whitelistedNames.add(name);
      verdictByName.set(name, true);
      continue;
    }
    let verdict = verdictByName.get(name);
    if (verdict === undefined) {
      if (locallyVerified(chain)) {
        verdict = true;
      } else if (probes >= WIKI_MAX_GREP_PROBES) {
        verdict = true; // 上限外不核验不标注（计 skipped）
      } else {
        probes++;
        probedNames.add(name);
        try {
          const kind = ctx.probe(name);
          verdict = kind === 'usage';
          if (kind === 'mention') mentionOnlyNames.add(name);
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
    if (whitelistedNames.has(name)) continue;
    if (!locallyVerified(name) && !probedNames.has(name)) skipped++;
  }

  let content = markdown;
  for (const raw of badRaws) {
    // 可见标注 + pending marker（--confirm 收集器只认 marker：被引用的证据
    // 文本若恰好包含同形文本，因无 marker 不进确认队列）
    content = content
      .split(`\`${raw}\``)
      .join(`\`${raw}\`（待确认）<!-- ${pendingMarker('claim', raw)} -->`);
  }

  return {
    content,
    stats: {
      total: claims.length,
      verified: claims.length - badRaws.size - skipped,
      unverified: badRaws.size,
      mentionOnly: mentionOnlyNames.size,
      ambiguous: ambiguousNames.size,
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

/** # 注释语言（yaml/sh/toml/env/py 等）；SQL/Lua 用 -- */
const HASH_COMMENT_EXTS = new Set([
  'yaml', 'yml', 'sh', 'bash', 'zsh', 'toml', 'env', 'py', 'rb', 'rake',
  'conf', 'ini', 'properties', 'gemspec', 'editorconfig',
]);
const DASH_COMMENT_EXTS = new Set(['sql', 'lua', 'hs']);

/**
 * 判定命中行是否为纯注释/提及行（证据分类用，保守策略）：
 * 只有明确的注释前缀才算 mention，其余（代码/字符串/配置值）一律算代码实据——
 * 宁可放过（usage），不可误标真实依赖为「待确认」。
 */
export function isCommentLine(line: string, file: string): boolean {
  const t = line.trim();
  if (t === '') return true;
  if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return true;
  const dot = file.lastIndexOf('.');
  const ext = dot >= 0 ? file.slice(dot + 1).toLowerCase() : '';
  if ((ext === 'md' || ext === 'vue' || ext === 'html') && t.startsWith('<!--')) return true;
  if (HASH_COMMENT_EXTS.has(ext) && t.startsWith('#')) return true;
  if (DASH_COMMENT_EXTS.has(ext) && t.startsWith('--')) return true;
  return false;
}

/**
 * 收集页面 context 的数据字段名与标识符形字符串值全集（递归，深度 ≤3）。
 * LLM 常把数据字段名写进反引号（如 `importFiles`、`nodeVersion`），也会引用
 * 数据中的配置键名（如 .editorconfig 的 `insert_final_newline`）——它们都来自
 * 工具自家数据契约/真实仓库扫描，有实据，不该被断言校验反手标成「待确认」。
 */
export function collectContextKeys(ctx: unknown, depth = 0): Set<string> {
  const keys = new Set<string>();
  collectInto(ctx, depth, keys, { budget: 800 });
  return keys;
}

const IDENTIFIER_LIKE = /^[A-Za-z_$][\w$.-]{2,63}$/;

function collectInto(node: unknown, depth: number, out: Set<string>, budget: { budget: number }): void {
  if (depth >= 3 || budget.budget <= 0 || node === null || typeof node !== 'object') return;
  const items = Array.isArray(node) ? node : [node];
  for (const item of items) {
    if (budget.budget <= 0) return;
    budget.budget--;
    if (item === null || typeof item !== 'object') continue;
    for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
      if (key.length >= 3) out.add(key);
      if (typeof value === 'string' && IDENTIFIER_LIKE.test(value)) out.add(value);
      collectInto(value, depth + 1, out, budget);
    }
  }
}
