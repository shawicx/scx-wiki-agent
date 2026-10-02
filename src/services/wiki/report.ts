/** 构建报告（对应 project-wiki「完成后清单」）。 */

import type { PageQualityReport } from '../../knowledge/wiki-quality-validator.js';
import type { ClaimStats } from '../../knowledge/claim-verifier.js';
import type { OutlineReport } from '../../knowledge/outline.js';
import type { CrossPageAction, CrossPageIssue } from '../../knowledge/crosspage/types.js';
import type { IntentCandidateStats } from '../../knowledge/intent/shared.js';
import type { ChannelStats } from '../../knowledge/channels/stats.js';

export type PageStatus = 'created' | 'updated' | 'unchanged';

export interface WrittenPage {
  page: string;
  relPath: string;
  source: string;
  status: PageStatus;
}

export interface ConfirmSummary {
  total: number;
  resolved: number;
  kept: number;
  persisted: number;
}

export function printBuildReport(
  written: WrittenPage[],
  skipped: Array<{ page: string; reason: string }>,
  reports: PageQualityReport[],
  legacyRemoved: string[],
  continuations: Array<{ page: string; rounds: number; truncated: boolean }>,
  sectionedPages: Array<{ page: string; sections: number; continuedSections: number; truncated: boolean }>,
  thinkingOnly: Array<{ page: string; recovered: boolean }>,
  llmDropped: Array<{ page: string; reason: string }>,
  outline: OutlineReport | null,
  claimStats: Array<{ page: string } & ClaimStats>,
  citationStats: Array<{ page: string; cited: number; invalid: number }>,
  intentCoverage: Array<{ page: string; counts: Record<string, number> }>,
  confirmSummary: ConfirmSummary | null,
  confirmedFingerprints?: { valid: number; staleRaws: string[] },
  crossPage?: { issues: CrossPageIssue[]; actions: CrossPageAction[] },
  intentCandidates?: IntentCandidateStats | null,
  graphLanguages?: Array<{ language: string; file_count: number }>,
  ipcConsistency?: { scanLimit: string[]; unmatched: string[] } | null,
  ghostStripped?: number,
  channelStats?: Readonly<ChannelStats> | null,
): void {
  const lines: string[] = ['[wiki] 构建报告：'];

  const created = written.filter(w => w.status === 'created');
  const updated = written.filter(w => w.status === 'updated');
  const unchanged = written.filter(w => w.status === 'unchanged');
  const llmCount = written.filter(w => w.source === 'llm').length;
  const writtenCount = created.length + updated.length;
  lines.push(
    `  已写入 ${writtenCount} 页（新增 ${created.length} / 更新 ${updated.length}；LLM ${llmCount} / 规则 ${writtenCount - llmCount}）`,
  );

  if (unchanged.length > 0) {
    lines.push(`  未变 ${unchanged.length} 页（update 模式内容一致，跳过重写）`);
  }
  if (unchanged.length > 0 && writtenCount > 0) {
    lines.push(`  本次变更文件：${[...created, ...updated].map(w => w.relPath).join('、')}`);
  }

  if (outline) {
    if (outline.unparsable) {
      lines.push('  章节树：outline.json 结构不合规，已忽略（固定页面照常构建）');
    } else {
      const pageTotal = outline.chapters.reduce((n, c) => n + c.pages.length, 0);
      lines.push(`  章节树：${outline.chapters.length} 章 ${pageTotal} 页生效`);
      for (const d of outline.drops) {
        const at = d.page ? `${d.chapter}/${d.page}` : d.chapter;
        lines.push(`    - 剔除 ${at}（${d.title}）：${d.reasons.join('；')}`);
      }
      for (const w of outline.warnings) {
        lines.push(`    - [${w.code}] ${w.target}：${w.message}`);
      }
    }
  }

  if (continuations.length > 0) {
    const detail = continuations
      .map(c => `${c.page}（续 ${c.rounds} 轮${c.truncated ? '，末轮仍截断' : ''}）`)
      .join('、');
    lines.push(`  断流续写 ${continuations.length} 页：${detail}`);
  }

  if (sectionedPages.length > 0) {
    const detail = sectionedPages
      .map(s => `${s.page}（${s.sections} 节${s.continuedSections > 0 ? `·${s.continuedSections} 节续写` : ''}${s.truncated ? '·有节仍截断' : ''}）`)
      .join('、');
    lines.push(`  分节生成 ${sectionedPages.length} 页：${detail}`);
  }

  if (thinkingOnly.length > 0) {
    const detail = thinkingOnly
      .map(t => `${t.page}（${t.recovered ? '重试恢复，建议检查 provider 思考配置' : '降级规则路径'}）`)
      .join('、');
    lines.push(`  thinking-only 响应 ${thinkingOnly.length} 页（正文通道为空、思考通道非空）：${detail}`);
  }

  if (claimStats.length > 0) {
    const sum = claimStats.reduce(
      (acc, c) => ({
        total: acc.total + c.total,
        unverified: acc.unverified + c.unverified,
        mentionOnly: acc.mentionOnly + (c.mentionOnly ?? 0),
        ambiguous: acc.ambiguous + (c.ambiguous ?? 0),
        skipped: acc.skipped + c.skipped,
      }),
      { total: 0, unverified: 0, mentionOnly: 0, ambiguous: 0, skipped: 0 },
    );
    const flagged = claimStats
      .filter(c => c.unverified > 0)
      .map(c => `${c.page} ${c.unverified}`)
      .join('、');
    const mentionNote = sum.mentionOnly > 0 ? `，其中仅注释/配置提及 ${sum.mentionOnly}` : '';
    const ambiguityNote = sum.ambiguous > 0 ? `；同名歧义 ${sum.ambiguous} 处（多文件同名，叙述请以锚点为准）` : '';
    lines.push(
      `  断言校验 ${claimStats.length} 页：${sum.total - sum.unverified - sum.skipped}/${sum.total} 有实据，待确认 ${sum.unverified}${mentionNote}${flagged ? `（${flagged}）` : ''}${sum.skipped > 0 ? `，未核验 ${sum.skipped}（超探测上限）` : ''}${ambiguityNote}`,
    );
  }

  // 证据引用（topic 页 evidence-ID 试点：grounded generation 遵从率度量）
  if (citationStats.length > 0) {
    const detail = citationStats
      .map(c => `${c.page}（有效 ${c.cited}${c.invalid > 0 ? `·无效 ${c.invalid}` : ''}）`)
      .join('、');
    const totalInvalid = citationStats.reduce((n, c) => n + c.invalid, 0);
    lines.push(
      `  证据引用（topic 试点）${citationStats.length} 页：${detail}${totalInvalid > 0 ? '——存在编造编号，建议复查' : ''}`,
    );
  }

  // 人工裁决摘要（两阶段构建的阶段二产物）
  if (confirmSummary) {
    lines.push(
      `  人工裁决：${confirmSummary.total} 项待确认（确认 ${confirmSummary.resolved} / 保持 ${confirmSummary.kept}），新增持久化确认 ${confirmSummary.persisted} 条（confirmations.json，后续构建免标）`,
    );
  }

  // 持久化确认指纹状态（过期条目重新进入待确认队列，绝不静默沿用）
  if (confirmedFingerprints && (confirmedFingerprints.valid > 0 || confirmedFingerprints.staleRaws.length > 0)) {
    const staleNote = confirmedFingerprints.staleRaws.length > 0
      ? `，${confirmedFingerprints.staleRaws.length} 条已过期重新裁决（${confirmedFingerprints.staleRaws.slice(0, 5).join('、')}${confirmedFingerprints.staleRaws.length > 5 ? ' 等' : ''}）`
      : '';
    lines.push(`  持久化确认：${confirmedFingerprints.valid} 条指纹有效免标${staleNote}`);
  }

  if (llmDropped.length > 0) {
    const detail = llmDropped.map(d => `${d.page}（${d.reason}）`).join('、');
    lines.push(`  LLM 降级规则 ${llmDropped.length} 页：${detail}`);
  }

  if (legacyRemoved.length > 0) {
    lines.push(`  清理陈旧产物 ${legacyRemoved.length} 个：${legacyRemoved.join(', ')}`);
  }

  if (skipped.length > 0) {
    lines.push(`  跳过 ${skipped.length} 页：`);
    for (const s of skipped) {
      lines.push(`    - ${s.page}: ${s.reason}`);
    }
  }

  const anchors = reports.reduce(
    (acc, r) => ({
      total: acc.total + r.anchors.total,
      valid: acc.valid + r.anchors.valid,
      outOfRange: acc.outOfRange + (r.anchors.outOfRange ?? 0),
      comment: acc.comment + (r.anchors.comment ?? 0),
    }),
    { total: 0, valid: 0, outOfRange: 0, comment: 0 },
  );
  if (anchors.total > 0) {
    const rangeNote = anchors.outOfRange > 0 ? `，${anchors.outOfRange} 处行号超范围` : '';
    const commentNote = anchors.comment > 0 ? `，注释锚点 ${anchors.comment} 处` : '';
    lines.push(`  锚点核验：${anchors.valid}/${anchors.total} 可追溯到扫描文件清单${rangeNote}${commentNote}`);
  }

  // 事实句支撑率（claim-support：正文可信度度量，比证据块文件数更接近真实）
  const cs = reports.reduce(
    (acc, r) => ({ factual: acc.factual + r.claimSupport.factual, supported: acc.supported + r.claimSupport.supported }),
    { factual: 0, supported: 0 },
  );
  if (cs.factual > 0) {
    const weakPages = reports
      .filter(r => r.claimSupport.factual >= 5 && r.claimSupport.supported * 2 < r.claimSupport.factual)
      .map(r => r.page);
    lines.push(
      `  事实句支撑率：${cs.supported}/${cs.factual}（${Math.round((cs.supported / cs.factual) * 100)}%）${weakPages.length > 0 ? `，弱支撑页：${weakPages.join('、')}` : ''}`,
    );
  }

  const evidenceCovered = reports.filter(r => r.evidence > 0).length;
  if (reports.length > 0) {
    // 覆盖率口径：正文引用文件被锚定块覆盖的比例（比文件数量更接近 grounding 真实度）
    const cov = reports.reduce(
      (acc, r) => ({ cited: acc.cited + r.evidenceCoverage.cited, covered: acc.covered + r.evidenceCoverage.covered }),
      { cited: 0, covered: 0 },
    );
    const covNote = cov.cited > 0
      ? `，正文引用覆盖 ${cov.covered}/${cov.cited}（${Math.round((cov.covered / cov.cited) * 100)}%）`
      : '';
    lines.push(`  证据锚定：${evidenceCovered}/${reports.length} 页含源文件锚定块${covNote}`);
  }

  // 意图证据覆盖（「为什么」含量度量：注释/git/文档/测试四通道）
  if (intentCoverage.length > 0) {
    const totals: Record<string, number> = {};
    for (const { counts } of intentCoverage) {
      for (const [kind, n] of Object.entries(counts)) totals[kind] = (totals[kind] ?? 0) + n;
    }
    const detail = Object.entries(totals).sort().map(([k, n]) => `${k} ${n}`).join(' / ');
    lines.push(`  意图证据：${intentCoverage.length} 页携带（${detail}）`);
  }

  // 图谱语言覆盖（多语言仓库核对 MCP 索引范围：实验性语言的图谱通道是否可用）
  if (graphLanguages && graphLanguages.length > 0) {
    lines.push(`  图谱语言覆盖：${graphLanguages.map(l => `${l.language} ${l.file_count}`).join(' / ')}`);
  }

  // 通道覆盖（W6：每条确定性通道的命中/过滤指标，全部可回归）
  if (channelStats) {
    const parts: string[] = [];
    const vs = channelStats.vueSfc;
    if (vs) {
      parts.push(`vue-sfc ${vs.components} 组件/${vs.files} 文件（props ${vs.props}·emits ${vs.emits}${vs.fallbackFiles > 0 ? `·回落 ${vs.fallbackFiles}` : ''}）`);
    }
    const rm = channelStats.rustMethods;
    if (rm && rm.methods > 0) {
      parts.push(`rust-methods resolved ${rm.resolved}·ambiguous ${rm.ambiguous}（方法全集 ${rm.methods}）`);
    }
    const ef = channelStats.edgeFilter;
    if (ef && (ef.crossLanguage + ef.nonCode + ef.noLexicalEvidence) > 0) {
      parts.push(`假边过滤 ${ef.crossLanguage + ef.nonCode + ef.noLexicalEvidence}（跨语言 ${ef.crossLanguage}·非代码 ${ef.nonCode}·无词法 ${ef.noLexicalEvidence}）`);
    }
    const nc = channelStats.negativeClaim;
    if (nc && (nc.suspect + nc.confirmed) > 0) {
      parts.push(`负面断言 suspect ${nc.suspect}/confirmed ${nc.confirmed}`);
    }
    if (parts.length > 0) lines.push(`  通道覆盖：${parts.join('｜')}`);
  }

  // 幽灵链接剥离（指向「已注册但未规划」页面的死链已降格为纯文本）
  if (ghostStripped && ghostStripped > 0) {
    lines.push(`  幽灵链接：剥离 ${ghostStripped} 处（目标页本次未规划，死链已降格为纯文本）`);
  }

  // IPC 对账（口径局限 vs 真孤儿：负面断言必须与二次检索口径一致）
  if (ipcConsistency && (ipcConsistency.scanLimit.length > 0 || ipcConsistency.unmatched.length > 0)) {
    lines.push(
      `  IPC 对账：口径局限 ${ipcConsistency.scanLimit.length} 条（页面须标「扫描口径局限」）`
      + `，真孤儿 ${ipcConsistency.unmatched.length} 条（可如实断言未调用/无发射点）`,
    );
    for (const s of ipcConsistency.scanLimit.slice(0, 10)) {
      lines.push(`    - [口径局限] ${s}`);
    }
    if (ipcConsistency.scanLimit.length > 10) {
      lines.push(`    - …另有 ${ipcConsistency.scanLimit.length - 10} 条`);
    }
  }

  // 意图候选排序观测（防「按体积截断挤掉小核心文件」回归：入口/被测占比可见）
  if (intentCandidates && intentCandidates.gitTop.length > 0) {
    lines.push(
      `  意图候选：生产文件 ${intentCandidates.total} 个，git 挖掘 Top${intentCandidates.gitTop.length}`
      + `（入口 ${intentCandidates.gitTopEntryCount}、被测 ${intentCandidates.gitTopTestedCount}；排序=fan-in/入口/boundary/测试/churn）`,
    );
  }

  // 跨页审校（全局 pass：重复/越界/一致性 warn + 确定性降级动作）
  if (crossPage && (crossPage.issues.length > 0 || crossPage.actions.length > 0)) {
    lines.push(`  跨页审校：${crossPage.issues.length} 项告警，${crossPage.actions.length} 个降级动作`);
    for (const a of crossPage.actions) {
      lines.push(`    - [${a.kind}] ${a.page}`);
    }
    for (const i of crossPage.issues.slice(0, 10)) {
      lines.push(`    - [${i.rule}] ${i.message}`);
    }
    if (crossPage.issues.length > 10) {
      lines.push(`    - …另有 ${crossPage.issues.length - 10} 条`);
    }
  }

  const warns = reports.flatMap(r => r.issues.filter(i => i.severity === 'warn'));
  if (warns.length > 0) {
    lines.push(`  告警 ${warns.length} 条（不拦截写盘）：`);
    for (const w of warns.slice(0, 20)) {
      lines.push(`    - [${w.rule}] ${w.message}`);
    }
    if (warns.length > 20) {
      lines.push(`    - …另有 ${warns.length - 20} 条`);
    }
  }

  console.log(lines.join('\n'));
}
