import { WikiBuilder } from '../wiki-builder.js';
import { unconfirmedNote } from '../wiki-markers.js';
import type { CallsContext, ClassesContext } from '../types.js';
import { hasIntent, intentTable, summarizeDocstring, renderFactsAndUnknowns } from './shared.js';

/**
 * calls.md：调用边表（R2 边表优于时序图）。
 * 纯规则生成，不使用 sequenceDiagram。
 */
export function buildCalls(ctx: CallsContext): string {
  const builder = new WikiBuilder()
    .addTitle('调用关系')
    .addParagraph('调用关系边表（按入口/热点分组）。每条边可被 trace_path / CALLS 查询复现。');

  const calleeLabel = (e: { callee: string; calleeParent?: string | null }) =>
    e.calleeParent ? `${e.calleeParent}.${e.callee}` : e.callee;

  if (ctx.groups.length === 0 && ctx.fanIn.length === 0 && !ctx.ipc) {
    builder.addParagraph('未从图谱检出可复核的调用边（消费侧过滤后为空）。');
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
    builder.addSection('扇入（被调用次数）', '');
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

  renderFactsAndUnknowns(
    builder,
    [
      `调用边分组 ${ctx.groups.length} 组（入口 ${ctx.groups.filter(g => g.kind !== 'hotspot').length} / 热点锚定 ${ctx.groups.filter(g => g.kind === 'hotspot').length}）`,
      `调用边共 ${ctx.groups.reduce((n, g) => n + g.edges.length, 0)} 条（每组内已去重）`,
      `扇入表条目 ${ctx.fanIn.length} 个`,
      ...(ctx.ipc ? [`Tauri IPC 跨语言命令 ${ctx.ipc.commands.length} 个、事件 ${ctx.ipc.events.length} 个`] : []),
    ],
    [
      ...(ctx.groups.length === 0 ? ['无入口分组（图谱入口检出为空，或全部被消费侧过滤）'] : []),
      ...(ctx.ipc && ctx.ipc.commands.some(c => c.rustDef === null)
        ? [`${ctx.ipc.commands.filter(c => c.rustDef === null).length} 个 invoke 命令未检出 Rust 侧定义（仅前端调用）`]
        : []),
    ],
  );

  return builder.build();
}

/**
 * classes.md：类层次与多态（降级适配）。
 * MCP 无 INHERITS 边，只做"类清单 + 每类方法表"，诚实标注数据局限。
 */
export function buildClasses(ctx: ClassesContext): string {
  const builder = new WikiBuilder()
    .addTitle('类');

  if (ctx.classes.length === 0) {
    builder.addParagraph('未在图谱中检出类（Class 节点为空）。');
    return builder.build();
  }

  // 数据局限说明（R1 诚实标注）
  if (!ctx.hasInheritance) {
    builder.addParagraph(
      unconfirmedNote('MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树；多态方法的子类实现'),
    );
  }

  const methodCount = ctx.classes.reduce((n, c) => n + c.methods.length, 0);
  const documented = ctx.classes.reduce(
    (n, c) => n + c.methods.filter(m => m.docstring && m.docstring.trim().length > 0).length, 0);

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
          summarizeDocstring(m.docstring),
          m.startLine > 0 ? `${m.filePath}:${m.startLine}` : m.filePath,
        ]),
      );
    }
  }

  renderFactsAndUnknowns(
    builder,
    [
      `检出类 ${ctx.classes.length} 个，成员方法共 ${methodCount} 个`,
      `带 docstring 说明的方法 ${documented} 个`,
      ...(ctx.classes.filter(c => c.parentClass).length > 0
        ? [`显式声明父类（源码回落检出）的类 ${ctx.classes.filter(c => c.parentClass).length} 个`]
        : []),
    ],
    [
      ...(!ctx.hasInheritance ? ['图谱无 INHERITS 边：继承树与多态实现未检出'] : []),
      ...(methodCount - documented > 0 ? [`${methodCount - documented} 个方法无 docstring，说明列为确定性摘要缺失（以签名与锚点为准）`] : []),
    ],
  );

  return builder.build();
}
