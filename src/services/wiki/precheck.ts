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
import type { DataFlowContext } from '../../knowledge/types.js';
import { archiveDroppedPage } from './archive.js';

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
