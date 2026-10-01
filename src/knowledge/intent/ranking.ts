/**
 * 意图候选文件重要性排序（纯函数）：替代「文件体积降序」代理。
 *
 * 背景：IntentEvidenceProvider 的 git per-file 挖掘截 GIT_FILE_CAP（30）个文件，
 * 契约要求调用方按重要性排序（热点优先）。体积是糟糕的代理——大文件（聚合
 * barrel / 长页面）会挤掉小而核心的模块。本模块用多信号确定性评分：
 * 文件级 fan-in / 入口文件 / boundary 端点包 / 符号数 / 测试配对 /
 * README·docs 提及 / 全仓 churn。评分只作排序，绝不作为事实输出。
 */

import { matchPackageForFile } from '../../shared/utils.js';

/** 各信号权重（归一化到 [0,1] 后加权求和） */
export const RANKING_WEIGHTS = {
  fanIn: 4,
  entry: 3,
  boundary: 2,
  symbols: 1,
  tested: 2,
  docsMention: 1,
  churn: 2,
} as const;

export interface RankingInputs {
  /** 生产代码文件（relativePath + size；size 仅作同分决胜） */
  files: Array<{ relativePath: string; size: number }>;
  /** 文件级 fan-in（CALLS 入边计数） */
  fanInByFile: Map<string, number>;
  /** 文件级符号数（图谱节点计数） */
  symbolCountByFile: Map<string, number>;
  /** 入口文件集合（架构快照 entry_points.file） */
  entryFiles: Set<string>;
  /** boundary 端点包名集合（from/to 并集） */
  boundaryPackages: Set<string>;
  /** 全部包名（文件→包归属判定用） */
  packageNames: readonly string[];
  /** 有测试配对的生产文件集合 */
  testedFiles: Set<string>;
  /** 被 README / docs 提及的生产文件集合 */
  docsMentionedFiles: Set<string>;
  /** 全仓 churn 计数（文件 → 提交次数；git 不可用时为空 Map） */
  churnCounts: Map<string, number>;
}

/** log 归一化：value / max 映射到 [0,1]，压制单信号的长尾垄断 */
function logNormalize(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.log2(1 + value) / Math.log2(1 + max);
}

export interface RankedFile {
  file: string;
  score: number;
  signals: {
    fanIn: number; entry: boolean; boundary: boolean; tested: boolean;
    docsMention: boolean; churn: number; symbols: number;
  };
}

/** 全量生产文件按重要性降序（同分：size 降序 → 路径字典序，输出确定） */
export function rankIntentCandidates(input: RankingInputs): RankedFile[] {
  const maxFanIn = Math.max(0, ...input.fanInByFile.values());
  const maxSymbols = Math.max(0, ...input.symbolCountByFile.values());
  const maxChurn = Math.max(0, ...input.churnCounts.values());
  const sizeByFile = new Map(input.files.map(f => [f.relativePath, f.size]));

  const ranked = input.files.map(f => {
    const fanIn = input.fanInByFile.get(f.relativePath) ?? 0;
    const symbols = input.symbolCountByFile.get(f.relativePath) ?? 0;
    const churn = input.churnCounts.get(f.relativePath) ?? 0;
    const pkg = matchPackageForFile(f.relativePath, input.packageNames);
    const entry = input.entryFiles.has(f.relativePath);
    const boundary = pkg !== null && input.boundaryPackages.has(pkg);
    const tested = input.testedFiles.has(f.relativePath);
    const docsMention = input.docsMentionedFiles.has(f.relativePath);

    const score =
      RANKING_WEIGHTS.fanIn * logNormalize(fanIn, maxFanIn)
      + RANKING_WEIGHTS.entry * (entry ? 1 : 0)
      + RANKING_WEIGHTS.boundary * (boundary ? 1 : 0)
      + RANKING_WEIGHTS.symbols * logNormalize(symbols, maxSymbols)
      + RANKING_WEIGHTS.tested * (tested ? 1 : 0)
      + RANKING_WEIGHTS.docsMention * (docsMention ? 1 : 0)
      + RANKING_WEIGHTS.churn * logNormalize(churn, maxChurn);

    return {
      file: f.relativePath,
      score,
      signals: { fanIn, entry, boundary, tested, docsMention, churn, symbols },
    };
  });

  return ranked.sort((a, b) =>
    b.score - a.score
    || (sizeByFile.get(b.file) ?? 0) - (sizeByFile.get(a.file) ?? 0)
    || a.file.localeCompare(b.file));
}
