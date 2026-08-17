/**
 * 页面所属层级。
 * - structure：结构层——描述"代码是什么"（架构、模块、API、调用关系等），可机器生成
 * - operations：运行规约层——描述"怎么跑/必须遵守什么"（环境、规约、测试、约束），需人工提炼
 * - surface：表层——描述"对外入口是什么"，按项目类型替换（CLI/后端/前端各不同）
 */
export type PageTier = 'structure' | 'operations' | 'surface';

/**
 * 页面描述符。每个 wiki 页面对应一个描述符，注册到 PAGE_REGISTRY。
 *
 * 设计原则：descriptor 只持有元数据（name/dir/tier/answer），不持有方法引用。
 * 具体的 context 构建 / LLM 生成 / fallback 生成都由三个 builder 各自按 page name 派发
 * （WikiContextBuilder.buildByName / WikiPageGenerator.generateByName / WikiFallbackBuilder.buildByName）。
 * 这样保持类型安全，且新增页面时三处 builder 各加一个 case 即可，无需改 WikiService。
 */
export interface PageDescriptor {
  /** 页面文件名（不含 .md），也是 --pages 参数值 */
  name: string;
  /**
   * 输出目录（编号分层，对齐 project-wiki 目录规范：一级目录数字排序）。
   * '' 表示输出到 wiki 根目录。
   */
  dir: string;
  tier: PageTier;
  /** 该页面回答的核心问题（用于 README 索引表） */
  answer: string;
}

/**
 * 全部已注册的页面，按编号目录分组排列（生成顺序）。
 *
 * 新增页面：①在此追加描述符；②三个 builder 各加一个 case；
 * ③types.ts 加对应 Context 接口（如需 LLM 路径）。
 */
export const PAGE_REGISTRY: PageDescriptor[] = [
  { name: 'readme', tier: 'structure', dir: '', answer: 'wiki 总入口 + 文档索引 + 项目元数据' },
  { name: 'overview', tier: 'structure', dir: '01-overview', answer: '项目是什么、解决什么问题' },
  { name: 'tech-stack', tier: 'operations', dir: '01-overview', answer: '技术栈与依赖说明（含声明未用，R3）' },
  { name: 'environment', tier: 'operations', dir: '01-overview', answer: '运行时、包管理器、env 变量、脚本命令' },
  { name: 'architecture', tier: 'structure', dir: '02-architecture', answer: '分层结构、模块依赖、扇入扇出' },
  { name: 'data-flow', tier: 'structure', dir: '02-architecture', answer: '数据形态与阶段转换（阶段表，非时序图）' },
  { name: 'modules', tier: 'structure', dir: '02-architecture', answer: '每个模块的文件、符号、职责' },
  { name: 'api', tier: 'structure', dir: '03-interface', answer: '导出函数与 CLI 命令（带 file:line）' },
  { name: 'cli', tier: 'surface', dir: '03-interface', answer: 'CLI 命令、参数、退出码' },
  { name: 'decisions', tier: 'structure', dir: '04-design', answer: '架构决策记录（ADR：编号+状态+背景+决策+后果）' },
  { name: 'onboarding', tier: 'operations', dir: '05-guides', answer: '上手指南：环境准备、安装、首次运行、脚本' },
  { name: 'testing', tier: 'operations', dir: '05-guides', answer: '框架、测试目录、覆盖率、夹具' },
  { name: 'troubleshooting', tier: 'operations', dir: '05-guides', answer: '排障手册：错误分类、诊断步骤、常见陷阱' },
  { name: 'conventions', tier: 'operations', dir: '06-constraints', answer: '命名、导入、注释规范与禁止项' },
  { name: 'constraints', tier: 'operations', dir: '06-constraints', answer: '性能预算、复杂度上限、已知限制' },
  { name: 'calls', tier: 'structure', dir: '07-reference', answer: '调用关系边表（按入口分组，带 file:line）' },
  { name: 'classes', tier: 'structure', dir: '07-reference', answer: '类清单与成员方法（继承树待 MCP 支持）' },
  { name: 'glossary', tier: 'structure', dir: '07-reference', answer: '类型/枚举字典（含成员值）' },
];

/** 全部页面名（供 WikiService 和 CLI 校验用） */
export const ALL_PAGE_NAMES: string[] = PAGE_REGISTRY.map(p => p.name);

/**
 * Tier 2（surface 层）按项目类型动态激活的页面映射。
 *
 * surface 层文档描述"对外入口"，不同项目类型入口形态不同：
 * - cli/agent：CLI 命令
 * - backend：HTTP 路由 + 数据库 schema
 * - frontend：组件 + 状态 + 路由
 * - library：公共 API
 * - monorepo：workspace 边界
 *
 * 注：非 cli 类型（routes/db-schema/components/...）的 context/fallback build*
 * 尚未实现，激活后 buildByName 返回 null，WikiService 会跳过写盘（不产出空文件）。
 */
const TIER2_BY_TYPE: Record<string, string[]> = {
  cli: ['cli'],
  agent: ['cli'],
  backend: ['routes', 'db-schema'],
  frontend: ['components', 'state', 'routing'],
  library: ['public-api'],
  monorepo: ['workspaces', 'package-boundaries'],
};

/** 根据项目类型返回应激活的 Tier 2 页面 */
export function tier2PagesFor(projectType: string): string[] {
  return TIER2_BY_TYPE[projectType] ?? [];
}

/** 查找页面描述符 */
export function findPageDescriptor(name: string): PageDescriptor | undefined {
  return PAGE_REGISTRY.find(p => p.name === name);
}

/**
 * 页面在 wiki 内的输出相对路径（编号目录 + 文件名）。
 * readme 特例输出为 README.md（wiki 总入口约定）。
 */
export function pageRelPath(name: string): string {
  const desc = findPageDescriptor(name);
  const filename = name === 'readme' ? 'README.md' : `${name}.md`;
  if (!desc || !desc.dir) return filename;
  return `${desc.dir}/${filename}`;
}

/**
 * 页底 Related 区块（project-wiki「页底 Related 链接」要求）。
 * 只链接本次构建计划内的页面，保证零死链；数据全部来自 PAGE_REGISTRY。
 */
export function buildRelatedSection(page: string, plannedPages: readonly string[]): string {
  const desc = findPageDescriptor(page);
  if (!desc || page === 'readme') return '';

  const siblings = PAGE_REGISTRY.filter(
    p => p.name !== page && p.dir === desc.dir && plannedPages.includes(p.name),
  );

  const items: string[] = [];
  if (siblings.length > 0) {
    items.push(`- 同目录：${siblings.map(p => `[${p.name}.md](${p.name}.md)`).join(' · ')}`);
  }
  if (plannedPages.includes('readme')) {
    const readmeLink = desc.dir ? '../README.md' : 'README.md';
    items.push(`- 总入口：[README](${readmeLink})`);
  }
  if (items.length === 0) return '';

  return `\n## Related\n\n${items.join('\n')}\n`;
}
