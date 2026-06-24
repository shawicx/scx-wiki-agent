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
 * 设计原则：descriptor 只持有元数据（name/tier/answer），不持有方法引用。
 * 具体的 context 构建 / LLM 生成 / fallback 生成都由三个 builder 各自按 page name 派发
 * （WikiContextBuilder.buildByName / WikiPageGenerator.generateByName / WikiFallbackBuilder.buildByName）。
 * 这样保持类型安全，且新增页面时三处 builder 各加一个 case 即可，无需改 WikiService。
 */
export interface PageDescriptor {
  /** 页面文件名（不含 .md），也是 --pages 参数值 */
  name: string;
  tier: PageTier;
  /** 该页面回答的核心问题（用于 README 索引表） */
  answer: string;
}

/**
 * 全部已注册的页面，按生成顺序排列。
 *
 * 新增页面：①在此追加描述符；②三个 builder 各加一个 case；
 * ③types.ts 加对应 Context 接口（如需 LLM 路径）。
 */
export const PAGE_REGISTRY: PageDescriptor[] = [
  { name: 'readme', tier: 'structure', answer: 'wiki 总入口 + 文档索引 + 项目元数据' },
  { name: 'overview', tier: 'structure', answer: '项目是什么、解决什么问题' },
  { name: 'architecture', tier: 'structure', answer: '分层结构、模块依赖、扇入扇出' },
  { name: 'modules', tier: 'structure', answer: '每个模块的文件、符号、职责' },
  { name: 'api', tier: 'structure', answer: '导出函数与 CLI 命令（带 file:line）' },
  { name: 'data-flow', tier: 'structure', answer: '数据形态与阶段转换（阶段表，非时序图）' },
  { name: 'glossary', tier: 'structure', answer: '类型/枚举字典（含成员值）' },
  { name: 'calls', tier: 'structure', answer: '调用关系边表（按入口分组，带 file:line）' },
  { name: 'classes', tier: 'structure', answer: '类清单与成员方法（继承树待 MCP 支持）' },
  { name: 'onboarding', tier: 'operations', answer: '环境准备、安装、基本使用' },
  { name: 'troubleshooting', tier: 'operations', answer: '常见问题与排障步骤' },
];

/** 全部页面名（供 WikiService 和 CLI 校验用） */
export const ALL_PAGE_NAMES: string[] = PAGE_REGISTRY.map(p => p.name);

/** 查找页面描述符 */
export function findPageDescriptor(name: string): PageDescriptor | undefined {
  return PAGE_REGISTRY.find(p => p.name === name);
}
