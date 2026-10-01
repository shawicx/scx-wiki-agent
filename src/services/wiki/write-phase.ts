/** 两阶段构建·阶段三：剥离 marker + 注入锚定块 + 写盘前闸门 + 写盘（update 模式在终稿上比较）。 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { buildEvidenceBlock, injectEvidenceBlock } from '../../knowledge/wiki-evidence.js';
import { stripPendingMarkers } from '../../knowledge/wiki-markers.js';
import { validatePageContent } from '../../knowledge/wiki-quality-validator.js';
import type { PageQualityReport } from '../../knowledge/wiki-quality-validator.js';
import { buildRelatedSection, findPageDescriptor } from '../../knowledge/page-registry.js';
import type { CrossLink } from '../../knowledge/page-registry.js';
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
  pages: string[],
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

  for (const entry of producedEntries) {
    const { page, relPath, source } = entry;

    // pending marker 是确认会话期脚手架，绝不写盘（keep 项的可见「待确认」文本保留）
    const content =
      injectEvidenceBlock(stripPendingMarkers(entry.content), buildEvidenceBlock(entry.evidenceFiles)) +
      buildRelatedSection(page, pages, crossLinks?.get(page));

    // 写盘前质量闸门（LLM 与规则路径都过闸；注入式真锚点核验访问器）
    const report = validatePageContent(
      content, {
        page, pagePath: relPath,
        knownFiles: entry.page === 'testing' ? knownFiles : productionKnownFiles,
        plannedPaths,
        tier: findPageDescriptor(page)?.tier,
        readFileLine: (f, l) => verify.readSourceLine(f, l),
        readFile: f => verify.readSourceFile(f),
        symbolFiles: verify.getSymbolIndex(entry.page === 'testing' ? 'all' : 'production').files,
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
