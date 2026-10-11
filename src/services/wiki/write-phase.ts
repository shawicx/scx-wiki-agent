/** 两阶段构建·阶段三：剥离 marker + 注入锚定块 + 写盘前闸门 + 写盘（update 模式在终稿上比较）。 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { buildEvidenceBlock, injectEvidenceBlock } from '../../knowledge/wiki-evidence.js';
import { stripPendingMarkers } from '../../knowledge/wiki-markers.js';
import { validatePageContent } from '../../knowledge/wiki-quality-validator.js';
import { collectAbsenceSuspectNames } from '../../knowledge/ipc-consistency.js';
import type { PageQualityReport } from '../../knowledge/wiki-quality-validator.js';
import { buildRelatedSection, findPageDescriptor } from '../../knowledge/page-registry.js';
import type { CrossLink } from '../../knowledge/page-registry.js';
import { stripUnplannedPageLinks, normalizeRepoFileLinks } from '../../knowledge/ghost-links.js';
import type { VerificationHub } from './verification.js';
import type { ProducedEntry, WrittenPage } from './types.js';

export interface WritePhaseResult {
  filenames: string[];
  writtenPages: WrittenPage[];
  qualityReports: PageQualityReport[];
  skippedPages: Array<{ page: string; reason: string }>;
}

export function writeProducedPages(
  wikiDir: string,
  mode: 'full' | 'update',
  producedEntries: ProducedEntry[],
  plannedPaths: Set<string>,
  knownFiles: Set<string>,
  productionKnownFiles: Set<string>,
  verify: VerificationHub,
  crossLinks?: ReadonlyMap<string, CrossLink[]>,
): WritePhaseResult {
  const filenames: string[] = [];
  const writtenPages: WrittenPage[] = [];
  const qualityReports: PageQualityReport[] = [];
  const skippedPages: Array<{ page: string; reason: string }> = [];

  const repoRoot = dirname(wikiDir);

  // ---- 第一遍：正文装配 + 质量闸门，确定终稿页面集合 ----
  // Related/剥离依赖「最终写出集合」，而写出集合要等闸门结果——先全部过闸，
  // 第二遍才用通过者生成 Related，杜绝「注册有名、实际未写出」的死链 Related。
  const gated = new Map<string, { body: string; report: PageQualityReport }>();
  for (const entry of producedEntries) {
    const { page, relPath, source } = entry;

    // pending marker 是确认会话期脚手架，绝不写盘（keep 项的可见「待确认」文本保留）
    // + 仓库文件链接归一化（LLM 可能把仓库根相对路径直接当链接目标）
    let body =
      injectEvidenceBlock(stripPendingMarkers(entry.content), buildEvidenceBlock(entry.evidenceFiles));
    const [fixedBody, fixedLinks] = normalizeRepoFileLinks(
      body,
      relPath,
      target => existsSync(join(repoRoot, target)),
    );
    if (fixedLinks > 0) body = fixedBody;

    // 写盘前质量闸门（LLM 与规则路径都过闸；注入式真锚点核验访问器）
    const report = validatePageContent(
      body, {
        page, pagePath: relPath,
        knownFiles: entry.page === 'testing' ? knownFiles : productionKnownFiles,
        plannedPaths,
        tier: findPageDescriptor(page)?.tier,
        readFileLine: (f, l) => verify.readSourceLine(f, l),
        readFile: f => verify.readSourceFile(f),
        symbolFiles: verify.getSymbolIndex(entry.page === 'testing' ? 'all' : 'production').files,
        absenceSuspects: collectAbsenceSuspectNames(entry.context),
      },
    );
    qualityReports.push(report);
    if (!report.passed) {
      const errors = report.issues
        .filter(i => i.severity === 'error')
        .map(i => i.message)
        .join('; ');
      skippedPages.push({ page, reason: `质量闸门拦截：${errors}` });
      continue;
    }
    gated.set(page, { body, report });
  }

  // ---- 第二遍：终稿集合上的 Related 注入 + 补充剥离 + 写盘 ----
  const writtenNames = [...gated.keys()];
  const writtenRelPaths = new Set(producedEntries.filter(e => gated.has(e.page)).map(e => e.relPath));
  for (const entry of producedEntries) {
    const gatedEntry = gated.get(entry.page);
    if (!gatedEntry) continue;
    const { page, relPath, source } = entry;
    let content =
      gatedEntry.body + buildRelatedSection(page, writtenNames, crossLinks?.get(page));
    // 终稿集合口径的补充剥离：闸门淘汰页的页名在 service 阶段尚在产出集内，
    // 其入链在此处补剥（只减链接，不影响已通过的闸门结论）
    content = stripUnplannedPageLinks(content, writtenRelPaths)[0];

    // M9：页脚标注生成路径（闸门之后注入，不影响质量检查）——
    // 逐页混用回退时读者可预期深度差异；source 翻转（llm↔fallback）时
    // 页脚随内容变化，update 模式自然触发重写
    content += `\n<!-- wiki:source: ${source} -->\n`;

    const targetPath = join(wikiDir, relPath);
    const existed = existsSync(targetPath);

    // update 模式：内容与现有文件一致时跳过重写（project-wiki「只改过时部分」）
    if (mode === 'update' && existed && readFileSync(targetPath, 'utf-8') === content) {
      filenames.push(relPath);
      writtenPages.push({ page, relPath, source, status: 'unchanged' });
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content, 'utf-8');
    filenames.push(relPath);
    writtenPages.push({ page, relPath, source, status: existed ? 'updated' : 'created' });
  }

  return { filenames, writtenPages, qualityReports, skippedPages };
}
