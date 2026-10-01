/**
 * 写盘前质量闸门入口（原 wiki-quality-validator.ts 拆分，零逻辑变化）。
 *
 * 规则与严重级：
 * - empty-shell    (error)：无正文空壳页。诚实标注"无数据"的页面（标题 +
 *   一句说明）不算空壳，只有完全没有非标题正文时才拦截。
 * - secret         (error)：疑似密钥/凭证值泄漏，拒绝写盘（LLM 路径降级规则生成）。
 * - dead-link      (warn) ：markdown 相对导航链接指向本次不产出的页面。
 * - broken-anchor  (warn) ：file:line 锚点无法在扫描文件清单中追溯到（R1 事后核验），
 *   含 `:0` 残缺锚点；注入 readFileLine 时 additionally 校验行号范围与锚点-符号
 *   关联（符号唯一解析但定义文件不含锚点文件时告警）；注入 readFile 时校验
 *   docs/foo.md#标题 文档锚点与页内 #fragment 链接的目标存在性。
 * - claim-support  (warn) ：正文事实句（含反引号标识符的行）中带证据锚点或
 *   「推断」标注的比例过低（<50% 且事实句 ≥5）。
 * - thin-evidence  (warn) ：structure 层页面证据锚定块内源文件数不足下限
 *   （readme 索引页与 operations 配置驱动页豁免）。
 * - mermaid-ghost  (warn) ：Mermaid 图中引用扫描清单外的文件路径（防幽灵节点）。
 * - diagram-misuse (warn) ：sequenceDiagram 出现在 calls 页之外（R2 边表优于时序图）。
 * - unanchored-rationale (warn)：动机/设计/演进类小节零证据锚点（R7 事后核验：
 *   file:line 与 commit 哈希+日期均无）。
 * - incomplete-page (warn/error)：疑似截断残页（未闭合代码块 / 末尾表格残行）。
 *   默认 warn；当生成期已知该页续写后仍截断（opts.truncated）时升级为 error，
 *   拒绝写盘并降级规则路径重建。
 * - unanchored-dependency (warn)：tech-stack 页核心/开发/测试依赖表格行缺
 *   import 点锚点（R3 事后核验：依赖"用途"须有 import 点佐证，不能只报名字）。
 *
 * error 拒绝写盘；warn 记入构建报告。纯函数，不做 I/O。
 */

import { checkAnchors, checkFragmentLinks } from './anchors.js';
import {
  checkClaimSupport,
  checkDeadLinks,
  checkEmptyShell,
  checkEvidenceCoverage,
  checkIncompletePage,
  checkMermaid,
  checkSecrets,
  checkThinEvidence,
  checkUnanchoredDependency,
  checkUnanchoredRationale,
} from './rules.js';
import type { PageQualityReport, QualityIssue, ValidateOptions } from './types.js';

export function validatePageContent(content: string, opts: ValidateOptions): PageQualityReport {
  const issues: QualityIssue[] = [];
  const text = content.trim();

  checkEmptyShell(text, issues);
  checkSecrets(text, issues);
  const anchors = checkAnchors(text, opts, issues);
  checkDeadLinks(text, opts, issues);
  checkFragmentLinks(text, opts, issues);
  const evidence = checkThinEvidence(text, opts, issues);
  const evidenceCov = checkEvidenceCoverage(text, opts, issues);
  checkMermaid(text, opts, issues);
  checkUnanchoredRationale(text, issues);
  checkIncompletePage(text, opts, issues);
  checkUnanchoredDependency(text, opts, issues);
  const claimSupport = checkClaimSupport(text, issues);

  return {
    page: opts.page,
    passed: !issues.some(i => i.severity === 'error'),
    issues,
    anchors,
    evidence,
    evidenceCoverage: evidenceCov,
    claimSupport,
  };
}

export { headingSlug } from './anchors.js';
export { findSecretDetail } from './rules.js';
export type {
  PageQualityReport,
  QualityIssue,
  QualityRule,
  QualitySeverity,
  ValidateOptions,
} from './types.js';
