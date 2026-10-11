/**
 * 页面预检（data-flow / decisions）：证据不足时在 plannedPaths / README 索引 /
 * 编号目录清理计算**之前**整页剔除——否则目录表与 Related 会出现死链。
 * 预检构建的 context 存入 prebuiltContexts 复用（getArchitecture 无缓存，
 * 避免同一图谱查询跑两遍）。被剔除的旧页面文件删除前先归档留档
 * （archiveDroppedPage，归档失败回退直接删除），不再静默消失。
 */

import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import type { WikiContextBuilder } from '../../knowledge/wiki-context-builder.js';
import { pageRelPath } from '../../knowledge/page-registry.js';
import type { ClassesContext, DataFlowContext, GlossaryContext } from '../../knowledge/types.js';
import { archiveDroppedPage } from './archive.js';

/**
 * reference 层薄证据预检（M5）：类/类型清单低于阈值时清单页价值趋零——
 * 固定注册表不按仓库规模裁剪会对小项目模板化摊派。宁缺毋滥，同 data-flow 模式。
 */
export function classesDropReason(ctx: ClassesContext | null): string | null {
  if (!ctx) return '无类数据，跳过空壳页生成';
  if (ctx.classes.length < 3) {
    return `仅 ${ctx.classes.length} 个类，清单页信息量不足，跳过（阈值 3）`;
  }
  return null;
}

export function glossaryDropReason(ctx: GlossaryContext | null): string | null {
  if (!ctx) return '无带文档符号，跳过空壳页生成';
  const total = ctx.symbols.length + (ctx.supplementalSymbols?.length ?? 0);
  if (total < 3) {
    return `仅 ${total} 个带文档符号，关键概念页信息量不足，跳过（阈值 3）`;
  }
  return null;
}

/**
 * data-flow 成页预检：仅有控制流边（无签名、无调用实参、无返回类型、无 I/O 数据形态证据）
 * 时不得成页——否则页面退化成 calls.md 的复制品。返回 null 表示可成页，否则返回剔除原因。
 */
export function dataFlowDropReason(ctx: DataFlowContext | null): string | null {
  if (!ctx || ctx.sequences.length === 0) {
    return '无执行序列数据（可信 CALLS 边不足），跳过空壳页生成';
  }
  if (ctx.stages.length === 0 || ctx.shapeCoverage.dataBearingTransitions === 0) {
    return '仅有控制流边，缺少签名、调用参数、返回类型或 I/O 数据形态证据，跳过 data-flow 页生成';
  }
  return null;
}

export interface PrecheckResult {
  pages: string[];
  prebuiltContexts: Map<string, unknown>;
  skipped: Array<{ page: string; reason: string }>;
  legacyRemoved: string[];
}

export function runPagePrechecks(
  contextBuilder: WikiContextBuilder,
  wikiDir: string,
  agentDir: string,
  archiveLabel: string,
  pages: string[],
): PrecheckResult {
  const prebuiltContexts = new Map<string, unknown>();
  const skipped: Array<{ page: string; reason: string }> = [];
  const legacyRemoved: string[] = [];

  // data-flow：仅有控制流边（无签名/实参/返回类型/I-O 数据形态证据）时不得成页
  if (pages.includes('data-flow')) {
    const dfContext = contextBuilder.buildByName('data-flow', pages) as DataFlowContext | null;
    const dropReason = dataFlowDropReason(dfContext);
    if (dropReason === null && dfContext) {
      prebuiltContexts.set('data-flow', dfContext);
    } else {
      pages = pages.filter(p => p !== 'data-flow');
      dropExistingPage(wikiDir, pageRelPath('data-flow'), agentDir, archiveLabel, legacyRemoved);
      skipped.push({ page: 'data-flow', reason: dropReason ?? '缺少数据形态证据，跳过空壳页生成' });
    }
  }

  // classes / glossary（M5）：清单低于阈值时整页剔除，reference 层不模板化摊派
  if (pages.includes('classes')) {
    const clsContext = contextBuilder.buildByName('classes', pages) as ClassesContext | null;
    const dropReason = classesDropReason(clsContext);
    if (dropReason === null && clsContext) {
      prebuiltContexts.set('classes', clsContext);
    } else {
      pages = pages.filter(p => p !== 'classes');
      dropExistingPage(wikiDir, pageRelPath('classes'), agentDir, archiveLabel, legacyRemoved);
      skipped.push({ page: 'classes', reason: dropReason ?? '无类数据，跳过空壳页生成' });
    }
  }
  if (pages.includes('glossary')) {
    const glosContext = contextBuilder.buildByName('glossary', pages) as GlossaryContext | null;
    const dropReason = glossaryDropReason(glosContext);
    if (dropReason === null && glosContext) {
      prebuiltContexts.set('glossary', glosContext);
    } else {
      pages = pages.filter(p => p !== 'glossary');
      dropExistingPage(wikiDir, pageRelPath('glossary'), agentDir, archiveLabel, legacyRemoved);
      skipped.push({ page: 'glossary', reason: dropReason ?? '无带文档符号，跳过空壳页生成' });
    }
  }

  // decisions：git 演进/文档决策证据全缺时整页剔除（同款模式）
  if (pages.includes('decisions')) {
    const decContext = contextBuilder.buildByName('decisions', pages);
    if (decContext !== null && decContext !== undefined) {
      prebuiltContexts.set('decisions', decContext);
    } else {
      pages = pages.filter(p => p !== 'decisions');
      dropExistingPage(wikiDir, pageRelPath('decisions'), agentDir, archiveLabel, legacyRemoved);
      skipped.push({ page: 'decisions', reason: '无决策证据（git 历史/设计文档均不可用），跳过空壳页生成' });
    }
  }

  return { pages, prebuiltContexts, skipped, legacyRemoved };
}

/** 旧页面删除前留档（归档失败回退直接删除） */
function dropExistingPage(
  wikiDir: string,
  rel: string,
  agentDir: string,
  archiveLabel: string,
  legacyRemoved: string[],
): void {
  const oldPath = join(wikiDir, rel);
  if (!existsSync(oldPath)) return;
  if (!archiveDroppedPage(wikiDir, rel, agentDir, archiveLabel)) {
    rmSync(oldPath);
  }
  legacyRemoved.push(rel);
}
