import { WikiBuilder } from '../wiki-builder.js';
import { unconfirmedNote } from '../wiki-markers.js';
import type {
  OverviewContext,
  ArchitectureContext,
  ModulesContext,
  CallsContext,
  ClassesContext,
} from '../types.js';
import { hasIntent, intentTable, symbolAnchorText, languageSummary } from './shared.js';

export function buildOverview(ctx: OverviewContext): string {
  const builder = new WikiBuilder()
    .addTitle('Project Overview');

  if (ctx.packageDescription) {
    builder.addParagraph(ctx.packageDescription);
  }

  const productionCount = ctx.productionFileCount ?? ctx.fileCount;
  const testCount = ctx.testFileCount ?? 0;
  builder.addParagraph(
    `A ${ctx.projectType} project with ${productionCount} production files and ${testCount} test files (total ${ctx.fileCount}).`,
  );

  if (ctx.techStack.length > 0) {
    builder.addSection('Tech Stack', ctx.techStack.map(t => `- ${t}`).join('\n'));
  }

  if (ctx.entryFiles.length > 0) {
    builder.addSection('Entry Files', ctx.entryFiles.map(f => `- \`${f.path}\``).join('\n'));
  }

  if (ctx.sourceDirs.length > 0) {
    builder.addSection('Source Directories', ctx.sourceDirs.map(d => `- ${d}`).join('\n'));
  }

  if (ctx.topSymbols.length > 0) {
    builder.addSection('Hotspots (high fan-in)', '').addTable(
      ['Symbol', 'Type', 'Complexity'],
      ctx.topSymbols.map(s => [s.name, s.type, String(s.complexity ?? '')]),
    );
  }

  if (hasIntent(ctx.intent)) {
    builder.addSection('设计依据（意图证据）', '从源码注释、git 提交与仓库文档确定性提取（每条带锚点，可回溯验证）');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
  }

  return builder.build();
}

export function buildArchitecture(ctx: ArchitectureContext): string {
  const builder = new WikiBuilder()
    .addTitle('Architecture')
    .addParagraph('Module overview:');

  for (const mod of ctx.modules) {
    const topExports = mod.symbols
      .filter((s, i, a) => a.findIndex(t => t.name === s.name && t.file === s.file) === i)
      .slice(0, 5);
    const facts: string[] = [];
    if (mod.fileCount !== undefined || mod.files.length > 0) {
      facts.push(`Files: ${mod.fileCount ?? mod.files.length}`);
    }
    const languages = languageSummary(mod.languages);
    if (languages) facts.push(`Languages: ${languages}`);
    if (mod.fanIn !== undefined || mod.fanOut !== undefined) {
      facts.push(`Fan-in/out: ${mod.fanIn ?? 0} / ${mod.fanOut ?? 0}`);
    }
    if (topExports.length > 0) facts.push(`Key exports: ${topExports.map(symbolAnchorText).join(', ')}`);
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
    builder.addSection('Layers', '').addTable(
      ['Package', 'Layer', 'Reason'],
      ctx.layers.map(l => [l.name, l.layer, l.reason]),
    );
  }

  // 模块间调用边界（来自 MCP get_architecture）
  if (ctx.boundaries && ctx.boundaries.length > 0) {
    builder.addSection('Module Boundaries', '').addTable(
      ['From', 'To', 'Call Count'],
      ctx.boundaries.map(b => [b.from, b.to, String(b.callCount)]),
    );
  }

  const uniqueRelations = ctx.interModuleRelations
    .filter((r, i, a) => a.findIndex(t => t.source === r.source && t.target === r.target) === i)
    .slice(0, 20);

  if (uniqueRelations.length > 0) {
    builder.addSection('Module Dependencies', '').addTable(
      ['From', 'To'],
      uniqueRelations.map(r => [r.source, r.target]),
    );
  }

  return builder.build();
}

export function buildModules(ctx: ModulesContext): string {
  const builder = new WikiBuilder()
    .addTitle('Modules');

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
      parts.push(`Files: ${mod.fileCount ?? mod.files.length}`);
    }
    const languages = languageSummary(mod.languages);
    if (languages) parts.push(`Languages: ${languages}`);
    if (topExports) parts.push(`Key exports: ${topExports}`);
    if (dependsOn.length > 0) parts.push(`Depends on: ${dependsOn.map(d => `\`${d}\``).join(', ')}`);
    if (usedBy.length > 0) parts.push(`Used by: ${usedBy.map(u => `\`${u}\``).join(', ')}`);
    if (mod.fanIn !== undefined || mod.fanOut !== undefined) {
      parts.push(`Fan-in/out: ${mod.fanIn ?? 0} / ${mod.fanOut ?? 0}`);
    }

    builder.addSection(mod.name, parts.length > 0 ? parts.join('\n\n') : 'No details available.');

    if (hasIntent(mod.intent)) {
      builder.addSubSection('设计依据（意图证据）', '');
      builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(mod.intent));
    }

    if (mod.fileSymbols.length > 0) {
      builder.addSubSection('File Structure', '');
      builder.addTable(
        ['File', 'Key Symbols'],
        mod.fileSymbols.map(fs => [
          `\`${fs.file}\``,
          fs.symbols.slice(0, 5).map(symbolAnchorText).join(', ') || '-',
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

  return builder.build();
}

/**
 * calls.md：调用边表（R2 边表优于时序图）。
 * 纯规则生成，不使用 sequenceDiagram。
 */
export function buildCalls(ctx: CallsContext): string {
  const builder = new WikiBuilder()
    .addTitle('Calls')
    .addParagraph('调用关系边表（按入口/热点分组）。每条边可被 trace_path / CALLS 查询复现。');

  const calleeLabel = (e: { callee: string; calleeParent?: string | null }) =>
    e.calleeParent ? `${e.calleeParent}.${e.callee}` : e.callee;

  if (ctx.groups.length === 0 && ctx.fanIn.length === 0 && !ctx.ipc) {
    builder.addParagraph('No call edges traced.');
    return builder.build();
  }

  // Tauri IPC：真实跨语言执行边（前端 invoke → Rust 命令），置前
  if (ctx.ipc && ctx.ipc.commands.length > 0) {
    builder.addSection(
      'Tauri IPC 调用边（跨语言）',
      '前端 invoke ↔ Rust #[tauri::command] 对表（正则扫描；图谱 CALLS 边不覆盖跨语言边界，invoke(变量) 动态命令名不在内）',
    ).addTable(
      ['命令', '前端调用点', 'Rust 定义'],
      ctx.ipc.commands.slice(0, 40).map(c => [
        `\`${c.name}\``,
        c.frontendCalls.slice(0, 3).map(r => `${r.file}:${r.line}`).join('<br>') || '-',
        c.rustDef ? `${c.rustDef.file}:${c.rustDef.line}` : '-',
      ]),
    );
  }

  // 扇入表（被调用最多的符号）
  if (ctx.fanIn.length > 0) {
    builder.addSection('Fan-in（被调用次数）', '');
    builder.addTable(
      ['符号', '文件', '扇入'],
      ctx.fanIn.map(f => [f.symbol, f.file, String(f.inDegree)]),
    );
  }

  // 按入口分组的调用边表（hotspot 组诚实标注为热点锚定，非应用入口）
  for (const group of ctx.groups) {
    const subtitle = group.kind === 'hotspot'
      ? `高扇入热点锚定（非应用入口）：${group.entryFile}`
      : `入口文件：${group.entryFile}`;
    builder.addSection(group.entry, subtitle);
    builder.addTable(
      ['调用方', '被调用方', '源文件:行号'],
      group.edges.map(e => [
        e.caller,
        calleeLabel(e),
        e.calleeLine > 0 ? `${e.calleeFile}:${e.calleeLine}` : e.calleeFile,
      ]),
    );
  }

  return builder.build();
}

/**
 * classes.md：类层次与多态（降级适配）。
 * MCP 无 INHERITS 边，只做"类清单 + 每类方法表"，诚实标注数据局限。
 */
export function buildClasses(ctx: ClassesContext): string {
  const builder = new WikiBuilder()
    .addTitle('Classes');

  if (ctx.classes.length === 0) {
    builder.addParagraph('No classes found.');
    return builder.build();
  }

  // 数据局限说明（R1 诚实标注）
  if (!ctx.hasInheritance) {
    builder.addParagraph(
      unconfirmedNote('MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现'),
    );
  }

  for (const cls of ctx.classes) {
    const header = `${cls.filePath}:${cls.startLine}`;
    builder.addSection(cls.name, `源文件：\`${header}\`  限定名：\`${cls.qualifiedName}\``);

    if (cls.parentClass) {
      builder.addParagraph(`继承自：\`${cls.parentClass}\``);
    }

    if (cls.methods.length > 0) {
      builder.addTable(
        ['方法', '可见性', '签名', '说明', '源文件:行号'],
        cls.methods.map(m => [
          m.name,
          m.visibility,
          m.signature ? `\`${m.signature}\`` : '-',
          m.docstring ?? '-',
          m.startLine > 0 ? `${m.filePath}:${m.startLine}` : m.filePath,
        ]),
      );
    }
  }

  return builder.build();
}
