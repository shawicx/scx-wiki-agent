import type {
  ArchitectureContext,
  ModulesContext,
  ModuleSummary,
  GlossaryContext,
} from '../types.js';
import { generate, generateSectioned, chunk, intentToPrompt, moduleKeyOf, sectionScope } from './shared.js';
import type { GeneratorDeps, PageConfig } from './shared.js';

export async function generateArchitecture(deps: GeneratorDeps, ctx: ArchitectureContext, onChunk: (text: string) => void): Promise<string> {
  return generateSectioned(deps, onChunk, buildArchitectureSections(ctx));
}

/** 架构页确定性节表：整体思路+架构图 → 核心模块详解（≤6 个/批）→ 依赖分析+横切关注点 */
function buildArchitectureSections(ctx: ArchitectureContext): PageConfig[] {
  const symbolAnchor = (s: { file?: string; startLine?: number }) =>
    s.file && s.startLine && s.startLine > 0
      ? `${s.file}:${s.startLine}`
      : s.file ?? '';
  const toDetail = (m: ModuleSummary) => ({
    name: m.name,
    fileCount: m.fileCount ?? m.files.length,
    symbolCount: m.symbols.length,
    languages: m.languages ?? [],
    fanIn: m.fanIn,
    fanOut: m.fanOut,
    topSymbols: m.symbols
      .filter((s, i, a) => a.findIndex(t => t.name === s.name && t.file === s.file) === i)
      .slice(0, 6)
      .map(s => ({
        name: s.name,
        type: s.type,
        file: s.file,
        startLine: s.startLine,
        anchor: symbolAnchor(s),
        docstring: s.docstring,
        signature: s.signature,
      })),
    dependsOn: [...new Set(m.outgoingRelations.map(r => r.target))].slice(0, 5),
    usedBy: [...new Set(m.incomingRelations.map(r => r.source))].slice(0, 5),
    intent: intentToPrompt(m.intent),
  });
  const relations = ctx.interModuleRelations
    .filter((r, i, a) => a.findIndex(t => t.source === r.source && t.target === r.target) === i)
    .slice(0, 30);
  const detailBatches = chunk(ctx.modules.map(toDetail), 6);
  const sectionTitles = [
    '整体架构设计思路与架构图',
    ...detailBatches.map((_, i) => `核心模块详解（第${i + 1}批）`),
    '模块依赖分析与横切关注点',
  ];

  const sections: PageConfig[] = [
    {
      systemPrompt: `${sectionScope('架构文档', sectionTitles[0], sectionTitles)}\n\n你是一个资深软件架构师。请生成架构文档的「整体架构设计思路与架构图」节（Markdown格式）。

要求：
- 用中文撰写
- 用3-4段自然语言深入分析系统的分层方式、各层职责、层间协作机制、架构风格。结合 layers 数据说明每个包属于哪一层及原因
- "架构图"：用 Mermaid graph TD 展示完整的模块依赖关系图（节点用模块名，边表示依赖方向），Mermaid 图中的节点名必须与数据中的实际模块名一致
- 不要展开单个模块的符号细节（详解由其他节负责）`,
      userPrompt: JSON.stringify({
        modules: ctx.modules.map(m => ({
          name: m.name,
          fileCount: m.fileCount ?? m.files.length,
          symbolCount: m.symbols.length,
        })),
        relations,
        layers: ctx.layers,
        clusters: ctx.clusters,
      }, null, 2),
    },
  ];

  detailBatches.forEach((batch, i) => {
    sections.push({
      systemPrompt: `${sectionScope('架构文档', sectionTitles[i + 1], sectionTitles)}\n\n你是一个资深软件架构师。请生成架构文档的「核心模块详解」节（第${i + 1}/${detailBatches.length}批，Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 对本批每个模块，用1-2段详细描述其职责、核心符号的作用（引用 docstring 和 signature）、设计意图；如模块携带 intent（文件头自述/首提交/高频提交主题/测试行为承诺），设计意图必须优先引用这些证据原文并携带锚点（file:line / commit 哈希+日期），无证据的意图叙述标注「推断」并写明依据（R7）；fanIn/fanOut 是模块重要性的量化依据，可引用
- 模块的 languages 显示多语言时，必须分别说明各语言的职责域（如该模块同时含 TypeScript 与 Rust 代码）
- 如果模块有 topSymbols，必须逐一说明其用途；topSymbols 的 anchor 是提供的 file:line 证据，引用时必须原样保留
- 只描述本批数据中的模块，禁止描述其他批次的模块`,
      userPrompt: JSON.stringify({
        modules: batch,
        supplementalSymbols: ctx.supplementalSymbols ?? [],
      }, null, 2),
    });
  });

  sections.push({
    systemPrompt: `${sectionScope('架构文档', sectionTitles[sectionTitles.length - 1], sectionTitles)}\n\n你是一个资深软件架构师。请生成架构文档的「模块依赖分析与横切关注点」节（Markdown格式）。

要求：
- 用中文撰写
- "模块依赖分析"：基于 boundaries 数据，用表格列出每个依赖边及其调用次数，并用文字分析关键依赖路径
- "横切关注点"：分析错误处理、日志、配置管理等横切机制`,
    userPrompt: JSON.stringify({
      relations,
      boundaries: ctx.boundaries,
      modules: ctx.modules.map(m => ({
        name: m.name,
        dependsOn: [...new Set(m.outgoingRelations.map(r => r.target))].slice(0, 5),
        usedBy: [...new Set(m.incomingRelations.map(r => r.source))].slice(0, 5),
      })),
    }, null, 2),
  });

  return sections;
}

export async function generateModules(deps: GeneratorDeps, ctx: ModulesContext, onChunk: (text: string) => void): Promise<string> {
  return generateSectioned(deps, onChunk, buildModulesSections(ctx));
}

/** 模块页确定性节表：组织方式概述 → 模块详解（≤4 个/批）→ 其他模块汇总 */
function buildModulesSections(ctx: ModulesContext): PageConfig[] {
  const symbolAnchor = (s: { file?: string; startLine?: number }) =>
    s.file && s.startLine && s.startLine > 0
      ? `${s.file}:${s.startLine}`
      : s.file ?? '';
  const toDetail = (m: ModuleSummary) => ({
    name: m.name,
    fileCount: m.fileCount ?? m.files.length,
    files: m.files.slice(0, 10),
    languages: m.languages ?? [],
    fanIn: m.fanIn,
    fanOut: m.fanOut,
    topSymbols: m.symbols
      .filter((s, i, a) => a.findIndex(t => t.name === s.name && t.file === s.file) === i)
      .slice(0, 10)
      .map(s => ({
        name: s.name,
        type: s.type,
        file: s.file,
        startLine: s.startLine,
        anchor: symbolAnchor(s),
        docstring: s.docstring,
        signature: s.signature,
      })),
    fileSymbols: m.fileSymbols.map(fs => ({
      file: fs.file,
      symbols: fs.symbols.map(s => ({
        name: s.name,
        type: s.type,
        file: s.file,
        startLine: s.startLine,
        anchor: symbolAnchor(s),
      })),
    })),
    dependsOn: [...new Set(m.outgoingRelations.map(r => r.target))].slice(0, 5),
    usedBy: [...new Set(m.incomingRelations.map(r => r.source))].slice(0, 5),
    intent: intentToPrompt(m.intent),
  });

  const hasOther = (ctx.otherModules ?? []).length > 0;
  const detailBatches = chunk(ctx.modules, 4).map(batch => batch.map(toDetail));
  const sectionTitles = [
    '组织方式概述',
    ...detailBatches.map((_, i) => `模块详解（第${i + 1}批）`),
    ...(hasOther ? ['其他模块汇总'] : []),
  ];

  const sections: PageConfig[] = [
    {
      systemPrompt: `${sectionScope('模块文档', sectionTitles[0], sectionTitles)}\n\n你是一个资深代码文档专家。请生成模块文档的「组织方式概述」节（Markdown格式）。

要求：
- 用中文撰写，用1-2段概述项目的模块组织方式和设计原则（模块清单与规模见数据）
- 不要展开任何单个模块的内部细节（详解由其他节负责）
- 只基于提供的模块清单描述，严禁编造模块`,
      userPrompt: JSON.stringify({
        modules: ctx.modules.map(m => ({
          name: m.name,
          fileCount: m.fileCount ?? m.files.length,
          symbolCount: m.symbols.length,
        })),
      }, null, 2),
    },
  ];

  detailBatches.forEach((batch, i) => {
    sections.push({
      systemPrompt: `${sectionScope('模块文档', sectionTitles[i + 1], sectionTitles)}\n\n你是一个资深代码文档专家。请生成模块文档的「模块详解」节（第${i + 1}/${detailBatches.length}批，Markdown格式）。

要求：
- 用中文撰写，内容必须详尽完整，不要人为缩减篇幅
- 对本批的每个模块，包含：
  - "职责"：该模块承担的职责（基于符号的 docstring 和 signature 详细说明）
  - "设计意图"：设计这个模块的原因，它在整体架构中的角色；如模块携带 intent（文件头自述/首提交/高频提交主题/测试行为承诺），必须优先引用证据原文并携带锚点（file:line / commit 哈希+日期，R7），无证据时标注「推断」并写明依据（命名/签名/依赖方向）
  - "交互方式"：与其他模块的协作方式（基于 dependsOn 和 usedBy）
  - "文件结构"：用表格列出该模块的文件及其关键符号和职责（文件名 | 关键符号 | 职责）
  - "核心符号"：对每个 topSymbol，用1-2句说明其用途（基于 docstring/signature）；anchor 是工具提供的 file:line 证据，引用时必须原样保留
- 模块的 languages 显示多语言时，必须分别说明各语言的职责域
- 按模块重要性排序（保持数据顺序）
- 只描述本批数据中的模块，禁止描述其他批次的模块
- 不要输出原始代码片段，但要引用关键函数的签名`,
      userPrompt: JSON.stringify({
        modules: batch,
        supplementalSymbols: ctx.supplementalSymbols ?? [],
      }, null, 2),
    });
  });

  if (hasOther) {
    sections.push({
      systemPrompt: `${sectionScope('模块文档', '其他模块汇总', sectionTitles)}\n\n你是一个资深代码文档专家。请生成模块文档的「其他模块汇总」节（Markdown格式）。

要求：
- 用中文撰写
- 用一张表汇总 otherModules 的名称与规模（模块 | 文件数 | 符号数）
- 严禁虚构这些聚合模块的内部细节（未提供其符号数据）`,
      userPrompt: JSON.stringify({ otherModules: ctx.otherModules }, null, 2),
    });
  }

  return sections;
}

export async function generateGlossary(deps: GeneratorDeps, ctx: GlossaryContext, onChunk: (text: string) => void): Promise<string> {
  return generateSectioned(deps, onChunk, buildGlossarySections(ctx));
}

/**
 * 关键概念页确定性节表：符号按所属模块分组（整组进同一节，避免同模块符号跨节碎片化），
 * 贪心分桶为 1-3 节（每节约 20 个符号）；补强符号按模块归入对应节。
 */
function buildGlossarySections(ctx: GlossaryContext): PageConfig[] {
  const symbols = ctx.symbols.slice(0, 40);
  const supplemental = ctx.supplementalSymbols ?? [];

  const groupOrder: string[] = [];
  const groups = new Map<string, GlossaryContext['symbols']>();
  for (const s of symbols) {
    const key = moduleKeyOf(s.filePath);
    if (!groups.has(key)) {
      groups.set(key, []);
      groupOrder.push(key);
    }
    groups.get(key)!.push(s);
  }

  const sectionCount = Math.min(3, Math.max(1, Math.ceil(symbols.length / 20)));
  const target = Math.max(1, Math.ceil(symbols.length / sectionCount));
  const buckets: Array<{ keys: string[]; symbols: GlossaryContext['symbols'] }> = [];
  let current = { keys: [] as string[], symbols: [] as GlossaryContext['symbols'] };
  for (const key of groupOrder) {
    const group = groups.get(key)!;
    if (current.symbols.length > 0 && current.symbols.length + group.length > target && buckets.length < sectionCount - 1) {
      buckets.push(current);
      current = { keys: [], symbols: [] };
    }
    current.keys.push(key);
    current.symbols.push(...group);
  }
  if (current.symbols.length > 0 || buckets.length === 0) buckets.push(current);

  const supplementalBySection = buckets.map(() => [] as NonNullable<GlossaryContext['supplementalSymbols']>);
  for (const s of supplemental) {
    const idx = buckets.findIndex(b => b.keys.includes(moduleKeyOf(s.file)));
    supplementalBySection[idx >= 0 ? idx : buckets.length - 1].push(s);
  }

  const toEntry = (s: GlossaryContext['symbols'][number]) => ({
    name: s.name,
    type: s.type,
    file: s.startLine && s.startLine > 0 ? `${s.filePath}:${s.startLine}` : s.filePath,
    docstring: s.docstring,
    signature: s.signature,
    complexity: s.complexity,
  });

  const sectionTitles = buckets.map((b, i) => `关键概念（第${i + 1}批·${b.keys.join('/') || '补强符号'}）`);

  return buckets.map((b, i) => ({
    systemPrompt: `${sectionScope('关键概念参考', sectionTitles[i], sectionTitles)}\n\n你是一个资深代码文档专家。请生成"关键概念"参考页的这一批符号内容（Markdown格式）。

要求：
- 用中文撰写${i === 0 ? `
- 开头用1段说明这个页面列出了项目的关键类型和函数，及其文档价值` : ''}
- 基于符号的实际所属模块分组（不要按字母排序），每组用表格列出（名称 | 类型 | 签名 | 说明 | 所属文件）
- "说明"列：基于提供的 docstring（如果有）写出准确的说明；docstring 为空时根据符号名和类型推断，但要标注是推断
- "签名"列：填入提供的 signature（如有）
- 对每个分组，用一段话说明该组符号的整体职责
- 只描述本批数据中的符号，禁止描述其他批次的符号`,
    userPrompt: JSON.stringify({
      modules: b.keys,
      symbols: b.symbols.map(toEntry),
      supplementalSymbols: supplementalBySection[i],
    }, null, 2),
  }));
}
