/** 质量闸门共享类型（原 wiki-quality-validator.ts 拆分，零逻辑变化） */

export type QualitySeverity = 'error' | 'warn';

export type QualityRule =
  | 'empty-shell'
  | 'secret'
  | 'dead-link'
  | 'broken-anchor'
  | 'thin-evidence'
  | 'mermaid-ghost'
  | 'diagram-misuse'
  | 'unanchored-rationale'
  | 'incomplete-page'
  | 'unanchored-dependency'
  | 'claim-support';

export interface QualityIssue {
  rule: QualityRule;
  severity: QualitySeverity;
  message: string;
}

/** 单页质量报告 */
export interface PageQualityReport {
  page: string;
  /** 无 error 级违规时为 true（warn 不拦截写盘） */
  passed: boolean;
  issues: QualityIssue[];
  /** 锚点核验统计（分类需注入 readFileLine，未注入时分类为 0） */
  anchors: { total: number; valid: number; outOfRange: number; comment: number; doc: number; usage: number };
  /** 证据锚定块内源文件数 */
  evidence: number;
  /** 事实句支撑率（claim-support 度量） */
  claimSupport: { factual: number; supported: number; unsupportedSample: string[] };
}

export interface ValidateOptions {
  page: string;
  /** 本页在 wiki 内的相对路径（用于解析页内相对链接），如 'readme.md' */
  pagePath: string;
  /** 仓库内真实文件相对路径集合（scanner 结果） */
  knownFiles: ReadonlySet<string>;
  /** 本次构建将写入的 wiki 相对路径集合（如 'overview.md'） */
  plannedPaths: ReadonlySet<string>;
  /** 页面层级（structure/operations/surface），thin-evidence 仅对 structure 生效 */
  tier?: string;
  /** 生成期事实：该页续写耗尽轮数后仍截断（incomplete-page 由 warn 升级为 error） */
  truncated?: boolean;
  /** 注入式源码行读取（保持纯函数契约）：返回 null = 不可读/行号超范围 */
  readFileLine?: (file: string, line: number) => string | null;
  /** 注入式整文件读取（文档锚点 heading 解析用）：返回 null = 不可读 */
  readFile?: (file: string) => string | null;
  /** 简名 → 定义文件集（getSymbolIndex 产物）：锚点-符号关联核验用 */
  symbolFiles?: ReadonlyMap<string, ReadonlySet<string>>;
}
