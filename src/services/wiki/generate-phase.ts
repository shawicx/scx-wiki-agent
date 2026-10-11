/** 两阶段构建·阶段一：全部页面内存生成 + 断言校验（不写盘）。 */

import { WikiContextBuilder } from '../../knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../../knowledge/wiki-fallback-builder.js';
import { WikiPageGenerator } from '../../knowledge/wiki-page-generator.js';
import { sanitizeWikiOutput } from '../../knowledge/wiki-output-sanitizer.js';
import { validatePageContent } from '../../knowledge/wiki-quality-validator.js';
import { verifyAndAnnotateClaims, collectContextKeys } from '../../knowledge/claim-verifier.js';
import type { ClaimStats } from '../../knowledge/claim-verifier.js';
import { countIntentEvidence } from '../../knowledge/intent-evidence.js';
import { collectEvidenceFiles, rankEvidenceFiles } from '../../knowledge/wiki-evidence.js';
import { resolveEvidenceCitations } from '../../knowledge/evidence-id.js';
import { collectAbsenceSuspectNames } from '../../knowledge/ipc-consistency.js';
import type { EvidenceRef } from '../../knowledge/evidence-id.js';
import { pageRelPath, isTopicPage } from '../../knowledge/page-registry.js';
import type { VerificationHub } from './verification.js';
import type { PageProduced, ProducedEntry } from './types.js';

/**
 * 阶段一输入：builders + 作用域集 + 人工确认白名单等装配依赖。
 * （替代旧的 21 个位置参数——位置实参换序/漏传无编译期防护。）
 */
export interface PageGenerationInput {
  verify: VerificationHub;
  rootDir: string;
  /** 计划生成的页面名（经 precheck 过滤） */
  pages: string[];
  /** precheck 期已建好的 context（data-flow/decisions 复用，避免重复图谱查询） */
  prebuiltContexts: ReadonlyMap<string, unknown>;
  contextBuilder: WikiContextBuilder;
  fallbackBuilder: WikiFallbackBuilder;
  pageGenerator: WikiPageGenerator;
  noLlm: boolean;
  onChunk: (filename: string, text: string) => void;
  knownFiles: ReadonlySet<string>;
  productionKnownFiles: ReadonlySet<string>;
  persistedConfirmed: ReadonlySet<string>;
  /** 当前页名同步（service 侧 notice 统计的 currentPage 闭包替代） */
  setCurrentPage: (page: string) => void;
}

/** 构建期可变统计累加器（报告数据源；notice 回调在生成期间写入） */
export interface BuildStats {
  continuations: Array<{ page: string; rounds: number; truncated: boolean }>;
  sectionedPages: Array<{ page: string; sections: number; continuedSections: number; truncated: boolean }>;
  thinkingOnly: Array<{ page: string; recovered: boolean }>;
  llmDropped: Array<{ page: string; reason: string }>;
  skippedPages: Array<{ page: string; reason: string }>;
  claimStats: Array<{ page: string } & ClaimStats>;
  citationStats: Array<{ page: string; cited: number; invalid: number }>;
  intentCoverage: Array<{ page: string; counts: Record<string, number> }>;
}

export async function generateAllPages(
  input: PageGenerationInput,
  stats: BuildStats,): Promise<ProducedEntry[]> {
  // 预遍历：先建全部 context，null 的页在生成前剔除——
  // plannedPaths / readme 索引 / 跨页链接都必须基于「实际会产出」的页面集，
  // 否则生成期才跳过的页面（如无 vue-router 的 routing）会以死链漏进索引与正文
  const { verify, contextBuilder, fallbackBuilder, pageGenerator, noLlm, onChunk } = input;
  const { knownFiles, productionKnownFiles, persistedConfirmed, setCurrentPage } = input;
  const { continuations, sectionedPages, thinkingOnly, llmDropped } = stats;
  const { skippedPages, claimStats, citationStats, intentCoverage } = stats;
  const pages = input.pages;
  const contexts = new Map<string, unknown>();
  for (const page of pages) {
    contexts.set(page, input.prebuiltContexts.get(page) ?? contextBuilder.buildByName(page, pages));
  }
  const effectivePages = pages.filter(p => {
    const ctx = contexts.get(p);
    if (ctx === null || ctx === undefined) {
      skippedPages.push({ page: p, reason: '页面 context 未实现，跳过写盘' });
      return false;
    }
    return true;
  });
  // readme 索引以实际产出集重建（readme context 是纯本地数据，重建零成本）
  if (effectivePages.includes('readme')) {
    contexts.set('readme', contextBuilder.buildByName('readme', effectivePages));
  }
  const plannedPaths = new Set(effectivePages.map(p => pageRelPath(p)));

  const producedEntries: ProducedEntry[] = [];
  for (const page of effectivePages) {
    const relPath = pageRelPath(page);
    setCurrentPage(page);

    const pageContext = contexts.get(page)!;

    // 意图证据覆盖统计（构建报告「为什么」含量度量）
    const intentCounts = countIntentEvidence(pageContext);
    if (Object.keys(intentCounts).length > 0) {
      intentCoverage.push({ page, counts: intentCounts });
    }

    // LLM 输出在生成阶段过闸：error 级违规直接降级规则路径。
    const pageKnownFiles = page === 'testing' ? knownFiles : productionKnownFiles;
    const pageTruncated = () =>
      continuations.some(c => c.page === page && c.truncated) ||
      sectionedPages.some(s => s.page === page && s.truncated);
    const gate = (content: string): boolean =>
      validatePageContent(content, {
        page, pagePath: relPath, knownFiles: pageKnownFiles, plannedPaths,
        truncated: pageTruncated(),
        readFileLine: (f, l) => verify.readSourceLine(f, l),
        readFile: f => verify.readSourceFile(f),
        symbolFiles: verify.getSymbolIndex(page === 'testing' ? 'all' : 'production').files,
        absenceSuspects: collectAbsenceSuspectNames(pageContext),
      }).passed;

    const produced = await generatePage(
      page, pageContext, fallbackBuilder, pageGenerator, noLlm, onChunk, gate,
    );
    if (produced.llmDrop) {
      // 降级原因精确标记（供排查）：thinking-only 重试未恢复 / 截断残页被闸门拦截
      const thinkingFailed = thinkingOnly.some(t => t.page === page && !t.recovered);
      const truncatedDropped = produced.llmDrop === '质量闸门未过' && pageTruncated();
      llmDropped.push({
        page,
        reason: thinkingFailed
          ? 'provider thinking-only response'
          : truncatedDropped
            ? '输出仍截断（incomplete-page）'
            : produced.llmDrop,
      });
    }

    // 正文断言校验（仅 LLM 页）：三级核验后，查无实据/仅提及的标识符标注「待确认」。
    // universe 并入：源码回落符号 + 声明依赖名 + 本页 context 数据字段名；
    // qualifiedNames 供点链声明后缀匹配；symbolFiles 供同名歧义统计；
    // probe 为词法命中行分类；confirmed 为人工确认白名单，命中即免标。
    let bodyContent = produced.content;
    if (produced.source === 'llm') {
      // 证据引用解析（topic 页 evidence-ID 试点）：确定性剥离 [E#] 脚手架
      const evidenceIndex = (pageContext as { evidenceIndex?: EvidenceRef[] }).evidenceIndex;
      if (isTopicPage(page) && evidenceIndex && evidenceIndex.length > 0) {
        const resolved = resolveEvidenceCitations(bodyContent, evidenceIndex);
        bodyContent = resolved.content;
        citationStats.push({ page, cited: resolved.cited, invalid: resolved.invalid });
      }
      const index = verify.getSymbolIndex(page === 'testing' ? 'all' : 'production');
      const universe = new Set<string>(index.names);
      for (const n of contextBuilder.getFallbackSymbolNames()) universe.add(n);
      for (const dep of contextBuilder.getDepNames()) universe.add(dep);
      for (const key of collectContextKeys(pageContext)) universe.add(key);
      const symbolFiles = new Map<string, Set<string>>();
      for (const [name, files] of index.files) {
        const scoped = new Set([...files].filter(f => pageKnownFiles.has(f) && !f.startsWith('.wiki/')));
        if (scoped.size > 0) symbolFiles.set(name, scoped);
      }
      const verified = verifyAndAnnotateClaims(bodyContent, {
        symbols: universe,
        qualifiedNames: index.qualified,
        symbolFiles,
        knownFiles: pageKnownFiles,
        probe: name => verify.probeClaimEvidence(name, pageKnownFiles),
        confirmed: persistedConfirmed,
      });
      bodyContent = verified.content;
      claimStats.push({ page, ...verified.stats });
    }

    producedEntries.push({
      page,
      relPath,
      source: produced.source,
      content: bodyContent,
      // 分层相关性排序（T1 正文引用置顶 > 符号定义 > 意图证据 > 入口/代表 > 配置兜底）
      evidenceFiles: rankEvidenceFiles(pageContext, bodyContent, pageKnownFiles, input.rootDir),
      context: pageContext,
    });
  }
  return producedEntries;
}

export async function generatePage(
  page: string,
  pageContext: unknown,
  fallback: WikiFallbackBuilder,
  generator: WikiPageGenerator,
  noLlm: boolean,
  onChunk: (filename: string, text: string) => void,
  gate?: (content: string) => boolean,
): Promise<PageProduced> {
  let llmDrop: string | undefined;
  if (!noLlm && generator.hasModel()) {
    try {
      const content = await generator.generateByName(page, pageContext, (text) => onChunk(page, text));
      if (content.trim().length > 0) {
        // 清理 LLM 输出残骸（首行寒暄、markdown 围栏，R2 时序图告警）
        const cleaned = sanitizeWikiOutput(content, page);
        if (!gate || gate(cleaned)) {
          return { content: cleaned, source: 'llm' };
        }
        // LLM 输出未过质量闸门 → 降级规则路径
        llmDrop = '质量闸门未过';
      } else {
        llmDrop = 'LLM 输出为空';
      }
    } catch (err) {
      // 保留可诊断的错误摘要（超时/限流/鉴权/断网可区分）；
      // AbortSignal.timeout → "This operation was aborted"、429 → provider 报文
      const detail = err instanceof Error ? err.message : String(err);
      llmDrop = `LLM 生成异常（${detail.slice(0, 120)}）`;
    }
  }
  return { content: fallback.buildByName(page, pageContext), source: 'fallback', llmDrop };
}
