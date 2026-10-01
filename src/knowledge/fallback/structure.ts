import { WikiBuilder } from '../wiki-builder.js';
import { unconfirmedNote } from '../wiki-markers.js';
import type {
  OverviewContext,
  ArchitectureContext,
  ModulesContext,
} from '../types.js';
import {
  hasIntent, intentTable, symbolAnchorText, languageSummary,
  summarizeDocstring, renderFactsAndUnknowns,
} from './shared.js';

export function buildOverview(ctx: OverviewContext): string {
  const builder = new WikiBuilder()
    .addTitle('项目概览');

  if (ctx.packageDescription) {
    builder.addParagraph(ctx.packageDescription);
  }

  const productionCount = ctx.productionFileCount ?? ctx.fileCount;
  const testCount = ctx.testFileCount ?? 0;
  builder.addParagraph(
    `${ctx.projectType} 类型项目：生产文件 ${productionCount} 个、测试文件 ${testCount} 个（共 ${ctx.fileCount} 个）。`,
  );

  if (ctx.techStack.length > 0) {
    builder.addSection('技术栈', ctx.techStack.map(t => `- ${t}`).join('\n'));
  }

  if (ctx.entryFiles.length > 0) {
    builder.addSection('入口文件', ctx.entryFiles.map(f => `- \`${f.path}\``).join('\n'));
  }

  if (ctx.sourceDirs.length > 0) {
    builder.addSection('源码目录', ctx.sourceDirs.map(d => `- ${d}`).join('\n'));
  }

  if (ctx.topSymbols.length > 0) {
    builder.addSection('热点符号（高扇入）', '').addTable(
      ['符号', '类型', '复杂度'],
      ctx.topSymbols.map(s => [s.name, s.type, String(s.complexity ?? '')]),
    );
  }

  if (hasIntent(ctx.intent)) {
    builder.addSection('设计依据（意图证据）', '从源码注释、git 提交与仓库文档确定性提取（每条带锚点，可回溯验证）');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
  }

  renderFactsAndUnknowns(
    builder,
    [
      `生产文件 ${productionCount} 个、测试文件 ${testCount} 个、扫描文件共 ${ctx.fileCount} 个`,
      `技术栈检出 ${ctx.techStack.length} 项${ctx.techStack.length > 0 ? `（${ctx.techStack.slice(0, 5).join('、')}${ctx.techStack.length > 5 ? ' 等' : ''}）` : ''}`,
      `入口文件 ${ctx.entryFiles.length} 个、源码目录 ${ctx.sourceDirs.length} 个`,
      `高扇入热点符号 ${ctx.topSymbols.length} 个`,
      ...(hasIntent(ctx.intent)
        ? [`意图证据 ${ctx.intent!.length} 条（源码注释 / git 提交 / 仓库文档，均带锚点）`]
        : []),
    ],
    [
      ...(ctx.packageDescription ? [] : ['package.json 未提供项目描述（packageDescription 为空）']),
      ...(ctx.topSymbols.length === 0 ? ['未检出高扇入热点符号'] : []),
      ...(!hasIntent(ctx.intent) ? ['未检出意图证据（源码无注释标记 / 无 git 历史 / 无文档小节可用）'] : []),
    ],
  );

  return builder.build();
}

export function buildArchitecture(ctx: ArchitectureContext): string {
  const builder = new WikiBuilder()
    .addTitle('架构')
    .addParagraph('模块概览：');

  for (const mod of ctx.modules) {
    const topExports = mod.symbols
      .filter((s, i, a) => a.findIndex(t => t.name === s.name && t.file === s.file) === i)
      .slice(0, 5);
    const facts: string[] = [];
    if (mod.fileCount !== undefined || mod.files.length > 0) {
      facts.push(`文件数：${mod.fileCount ?? mod.files.length}`);
    }
    const languages = languageSummary(mod.languages);
    if (languages) facts.push(`语言：${languages}`);
    if (mod.fanIn !== undefined || mod.fanOut !== undefined) {
      facts.push(`扇入/扇出：${mod.fanIn ?? 0} / ${mod.fanOut ?? 0}`);
    }
    if (topExports.length > 0) facts.push(`关键导出：${topExports.map(symbolAnchorText).join(', ')}`);
    builder.addSection(mod.name, facts.join('\n\n'));
  }

  // 模块级意图证据（文件头自述/首提交/高频主题/行为承诺）
  for (const mod of ctx.modules) {
    if (!hasIntent(mod.intent)) continue;
    builder.addSection(`设计依据：${mod.name}`, '');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(mod.intent));
  }

  // 分层信息（来自 MCP get_architecture，消费侧过滤后）
  if (ctx.layers && ctx.layers.length > 0) {
    builder.addSection('分层', '').addTable(
      ['包', '层级', '依据'],
      ctx.layers.map(l => [l.name, l.layer, l.reason]),
    );
  }

  // 模块间调用边界（来自 MCP get_architecture）
  if (ctx.boundaries && ctx.boundaries.length > 0) {
    builder.addSection('模块间调用边界', '').addTable(
      ['调用方', '被调用方', '调用次数'],
      ctx.boundaries.map(b => [b.from, b.to, String(b.callCount)]),
    );
  }

  const uniqueRelations = ctx.interModuleRelations
    .filter((r, i, a) => a.findIndex(t => t.source === r.source && t.target === r.target) === i)
    .slice(0, 20);

  if (uniqueRelations.length > 0) {
    builder.addSection('模块依赖', '').addTable(
      ['依赖方', '被依赖方'],
      uniqueRelations.map(r => [r.source, r.target]),
    );
  }

  const moduleNames = ctx.modules.map(m => m.name);
  renderFactsAndUnknowns(
    builder,
    [
      `生产模块 ${ctx.modules.length} 个（${moduleNames.slice(0, 8).join('、')}${moduleNames.length > 8 ? ' 等' : ''}）`,
      ...(() => {
        const withExports = ctx.modules.filter(m => m.symbols.length > 0).length;
        return [`其中 ${withExports} 个模块检出图谱符号（类/函数/方法）`];
      })(),
      ...(ctx.boundaries ? [`模块间调用边界 ${ctx.boundaries.length} 条`] : []),
      ...(ctx.layers ? [`分层记录 ${ctx.layers.length} 条`] : []),
      `模块依赖对 ${uniqueRelations.length} 条（去重后，最多展示 20 条）`,
    ],
    [
      ...(ctx.modules.some(m => m.symbols.length === 0)
        ? [`${ctx.modules.filter(m => m.symbols.length === 0).length} 个模块未检出图谱符号（文件存在但无已索引的类/函数/方法）`]
        : []),
      ...(!ctx.layers || ctx.layers.length === 0 ? ['图谱未提供分层（layers）数据'] : []),
      ...(!ctx.boundaries || ctx.boundaries.length === 0 ? ['图谱未提供模块间调用边界数据'] : []),
    ],
  );

  return builder.build();
}

export function buildModules(ctx: ModulesContext): string {
  const builder = new WikiBuilder()
    .addTitle('模块');

  for (const mod of ctx.modules) {
    const topExports = mod.symbols
      .filter((s, i, a) => a.findIndex(t => t.name === s.name && t.file === s.file) === i)
      .slice(0, 5)
      .map(symbolAnchorText)
      .join(', ');

    const dependsOn = [...new Set(mod.outgoingRelations.map(r => r.target))].slice(0, 5);
    const usedBy = [...new Set(mod.incomingRelations.map(r => r.source))].slice(0, 5);

    const parts: string[] = [];
    if (mod.fileCount !== undefined || mod.files.length > 0) {
      parts.push(`文件数：${mod.fileCount ?? mod.files.length}`);
    }
    const languages = languageSummary(mod.languages);
    if (languages) parts.push(`语言：${languages}`);
    if (topExports) parts.push(`关键导出：${topExports}`);
    if (dependsOn.length > 0) parts.push(`依赖：${dependsOn.map(d => `\`${d}\``).join(', ')}`);
    if (usedBy.length > 0) parts.push(`被依赖：${usedBy.map(u => `\`${u}\``).join(', ')}`);
    if (mod.fanIn !== undefined || mod.fanOut !== undefined) {
      parts.push(`扇入/扇出：${mod.fanIn ?? 0} / ${mod.fanOut ?? 0}`);
    }

    builder.addSection(
      mod.name,
      parts.length > 0
        ? parts.join('\n\n')
        : `该模块仅有图谱边界记录：未检出文件清单、符号与依赖证据（扇入/扇出 ${mod.fanIn ?? 0} / ${mod.fanOut ?? 0}）。`,
    );

    if (hasIntent(mod.intent)) {
      builder.addSubSection('设计依据（意图证据）', '');
      builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(mod.intent));
    }

    if (mod.fileSymbols.length > 0) {
      builder.addSubSection('文件结构', '');
      builder.addTable(
        ['文件', '关键符号'],
        mod.fileSymbols.map(fs => [
          `\`${fs.file}\``,
          fs.symbols.slice(0, 5).map(symbolAnchorText).join(', ') || '未检出已索引符号',
        ]),
      );
    }
  }

  // 大仓库聚合：详述上限外的模块只列名称与规模
  if (ctx.otherModules && ctx.otherModules.length > 0) {
    builder.addSection(
      `其他模块（${ctx.otherModules.length} 个，概要）`,
      '模块数超过详述上限，以下仅列名称与规模（详述按扇入/扇出/节点数/生产文件数综合重要性取前 12）。',
    );
    builder.addTable(
      ['模块', '文件数', '符号数'],
      ctx.otherModules.map(m => [m.name, String(m.fileCount), String(m.symbolCount)]),
    );
  }

  renderFactsAndUnknowns(
    builder,
    [
      `详述模块 ${ctx.modules.length} 个${ctx.otherModules ? `，聚合概要模块 ${ctx.otherModules.length} 个` : ''}`,
      `检出依赖关系的模块 ${ctx.modules.filter(m => m.outgoingRelations.length > 0 || m.incomingRelations.length > 0).length} 个`,
      `检出意图证据（注释/提交/文档）的模块 ${ctx.modules.filter(m => hasIntent(m.intent)).length} 个`,
    ],
    [
      ...(ctx.modules.filter(m => m.symbols.length === 0).length > 0
        ? [`${ctx.modules.filter(m => m.symbols.length === 0).length} 个详述模块未检出图谱符号`]
        : []),
      ...(ctx.modules.filter(m => m.outgoingRelations.length === 0 && m.incomingRelations.length === 0).length > 0
        ? [`${ctx.modules.filter(m => m.outgoingRelations.length === 0 && m.incomingRelations.length === 0).length} 个详述模块未检出模块间依赖证据`]
        : []),
    ],
  );

  return builder.build();
}

