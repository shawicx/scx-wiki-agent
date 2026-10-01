/** 跨页审校共享类型：指纹、问题、报告与降级动作。 */

/** 单张 markdown 表格的结构化指纹 */
export interface TableFingerprint {
  /** 表头（去空白后的列名序列） */
  header: string[];
  /** 行数 */
  rows: number;
  /** 首列单元格集合（重复检测的主键域） */
  firstColumn: Set<string>;
  /** 表格所在的小节标题（就近向上找 ##/###） */
  section: string;
}

/** 单页指纹：表格/术语/依赖/意图证据锚点 */
export interface PageFingerprint {
  page: string;
  tables: TableFingerprint[];
  /** 正文反引号标识符集合（术语统一检测域） */
  terms: Set<string>;
  /** `` `dep` `` 形式出现的依赖名 → 出现次数 */
  depMentions: Map<string, number>;
  /** 意图证据锚点集合（证据表「锚点」列 + commit: 前缀文本） */
  intentAnchors: Set<string>;
  /** 页面引用的源码文件（evidenceFiles，亲和度计算用） */
  files: Set<string>;
}

/** 跨页问题（warn 级为主，duplication 附带确定性动作） */
export interface CrossPageIssue {
  rule:
    | 'table-duplication'
    | 'intent-evidence-duplication'
    | 'page-scope-overlap'
    | 'term-inconsistency'
    | 'dep-consistency';
  /** 涉及页面（1-2 个） */
  pages: string[];
  /** 人读消息（进构建报告） */
  message: string;
}

/** 跨页审校确定性动作（生成后、裁决前应用） */
export type CrossPageAction =
  | { kind: 'demote-data-flow'; page: string }
  | { kind: 'fold-intent-tables'; page: string; keepAnchors: Set<string> };

export interface CrossPageReport {
  issues: CrossPageIssue[];
  actions: CrossPageAction[];
  /** 跨页亲和度（Related 增强用）：page → 相似页及共享要素 */
  affinity: Map<string, Array<{ page: string; sharedFiles: number; sharedSymbols: number }>>;
}

/** 页面互补职责对（静态声明：互相必现 Related 链接） */
export const COMPLEMENT_PAGES: ReadonlyArray<readonly [string, string]> = [
  ['data-flow', 'calls'],
  ['architecture', 'modules'],
  ['overview', 'tech-stack'],
  ['glossary', 'calls'],
];
