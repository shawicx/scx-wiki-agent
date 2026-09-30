/** 两阶段构建·阶段一：全部页面内存生成 + 断言校验（不写盘）。 */

import { WikiContextBuilder } from '../../knowledge/wiki-context-builder.js';
import { WikiFallbackBuilder } from '../../knowledge/wiki-fallback-builder.js';
import { WikiPageGenerator } from '../../knowledge/wiki-page-generator.js';
import { sanitizeWikiOutput } from '../../knowledge/wiki-output-sanitizer.js';
import { validatePageContent } from '../../knowledge/wiki-quality-validator.js';
import { verifyAndAnnotateClaims, collectContextKeys } from '../../knowledge/claim-verifier.js';
import type { ClaimStats } from '../../knowledge/claim-verifier.js';
import { countIntentEvidence } from '../../knowledge/intent-evidence.js';
import { collectEvidenceFiles } from '../../knowledge/wiki-evidence.js';
import { resolveEvidenceCitations } from '../../knowledge/evidence-id.js';
import type { EvidenceRef } from '../../knowledge/evidence-id.js';
import { pageRelPath, isTopicPage } from '../../knowledge/page-registry.js';
import type { VerificationHub } from './verification.js';
import type { PageProduced, ProducedEntry } from './types.js';

export async function generateAllPages(
  verify: VerificationHub,
  rootDir: string,
  pages: string[],
  prebuiltContexts: Map<string, unknown>,
  contextBuilder: WikiContextBuilder,
  fallbackBuilder: WikiFallbackBuilder,
  pageGenerator: WikiPageGenerator,
  noLlm: boolean,
  onChunk: (filename: string, text: string) => void,
  plannedPaths: Set<string>,
  knownFiles: Set<string>,
  productionKnownFiles: Set<string>,
  persistedConfirmed: Set<string>,
  continuations: Array<{ page: string; rounds: number; truncated: boolean }>,
  sectionedPages: Array<{ page: string; sections: number; continuedSections: number; truncated: boolean }>,
  thinkingOnly: Array<{ page: string; recovered: boolean }>,
  llmDropped: Array<{ page: string; reason: string }>,
  skippedPages: Array<{ page: string; reason: string }>,
  setCurrentPage: (page: string) => void,
  claimStats: Array<{ page: string } & ClaimStats>,
  citationStats: Array<{ page: string; cited: number; invalid: number }>,
  intentCoverage: Array<{ page: string; counts: Record<string, number> }>,
): Promise<ProducedEntry[]> {
  const producedEntries: ProducedEntry[] = [];
  for (const page of pages) {
    const relPath = pageRelPath(page);
    setCurrentPage(page);

    const pageContext = prebuiltContexts.get(page) ?? contextBuilder.buildByName(page, pages);
    if (pageContext === null || pageContext === undefined) {
      skippedPages.push({ page, reason: '页面 context 未实现，跳过写盘' });
      continue;
    }

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
      evidenceFiles: collectEvidenceFiles(pageContext, pageKnownFiles, rootDir),
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
    } catch {
      llmDrop = 'LLM 生成异常';
    }
  }
  return { content: fallback.buildByName(page, pageContext), source: 'fallback', llmDrop };
}
