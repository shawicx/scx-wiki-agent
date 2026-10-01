import { WikiBuilder } from '../wiki-builder.js';
import type { DataFlowContext } from '../types.js';
import {
  FLOW_CALLS_POINTER,
  STAGE_ROLE_LABELS,
  STAGE_EVIDENCE_LABELS,
  IO_KIND_LABELS,
  IO_DIRECTION_LABELS,
  anchorText,
  inline,
  shapesText,
  limitationNotes,
  renderFactsAndUnknowns,
} from './shared.js';

/**
 * 数据流页规则渲染：输出确定性的「数据形态」证据（阶段表 / 转换表 / I-O 边界表 /
 * 类型定义），不再输出纯调用边表——纯控制流细节属于 calls.md。
 */
export function buildDataFlow(ctx: DataFlowContext): string {
  const builder = new WikiBuilder().addTitle('Data Flow');

  if (ctx.stages.length === 0 && ctx.transitions.length === 0) {
    builder.addParagraph('本页未采集到带数据形态证据的阶段：无签名、无调用实参、无返回类型、无 I/O 边界事件。');
    builder.addParagraph(FLOW_CALLS_POINTER);
    return builder.build();
  }

  builder.addParagraph(
    `数据处理共识别 ${ctx.stages.length} 个阶段、${ctx.transitions.length} 条带数据证据的调用转换、`
    + `${ctx.ioEvents.length} 个 I/O 边界事件。${FLOW_CALLS_POINTER}`,
  );

  // 数据阶段表
  builder.addSection('数据阶段', '');
  builder.addTable(
    ['阶段', '角色', '输入形态', '输出形态', '证据'],
    ctx.stages.map(s => [
      `${s.symbol}（${anchorText(s.file, s.line)}）`,
      STAGE_ROLE_LABELS[s.role] ?? s.role,
      shapesText(s.inputs),
      shapesText(s.outputs, true),
      s.evidenceKinds.length > 0
        ? s.evidenceKinds.map(k => STAGE_EVIDENCE_LABELS[k] ?? k).join(' / ')
        : '无',
    ]),
  );

  // 阶段转换表：调用点用 r.line，To 定义用 callee start_line，二者语义不同
  if (ctx.transitions.length > 0) {
    builder.addSection('阶段转换', '');
    builder.addTable(
      ['从', '到', '调用实参', '调用点', '定义处'],
      ctx.transitions.map(t => [
        t.from,
        t.to,
        t.args.length > 0
          ? t.args.map(a => a.expression ? inline(a.expression) : '—').join('<br>')
          : '未检出实参',
        anchorText(t.callFile, t.callLine),
        t.calleeDefinition,
      ]),
    );
  }

  // 输入与输出边界表
  if (ctx.ioEvents.length > 0) {
    builder.addSection('输入与输出边界', '');
    builder.addTable(
      ['类型', '方向', '数据介质', '所属阶段', '表达式', '位置'],
      ctx.ioEvents.map(e => [
        IO_KIND_LABELS[e.kind] ?? e.kind,
        IO_DIRECTION_LABELS[e.direction] ?? e.direction,
        e.medium ? inline(e.medium) : '—',
        e.symbol,
        inline(e.expression),
        anchorText(e.file, e.line) + (e.approximated ? '（函数体范围近似）' : ''),
      ]),
    );
  }

  // 关键数据结构
  if (ctx.typeDefinitions.length > 0) {
    builder.addSection('关键数据结构', '');
    for (const def of ctx.typeDefinitions) {
      builder.addSubSection(`${def.name}（${def.kind} · ${anchorText(def.file, def.line)}）`, '');
      builder.addCodeBlock('ts', def.text);
    }
  }

  // 本页确定知道的事实 + 未知项（证据局限平移并入，只描述确定性事实，不编造）
  const c = ctx.shapeCoverage;
  renderFactsAndUnknowns(
    builder,
    [
      `数据阶段 ${ctx.stages.length} 个（类型形态已知 ${c.typedStages} 个 / 未知 ${c.unknownStages} 个）`,
      `带数据证据的调用转换 ${ctx.transitions.length} 条（数据承载 ${c.dataBearingTransitions} 条）`,
      `I/O 边界事件 ${ctx.ioEvents.length} 个（读写文件/子进程/配置/env 等）`,
      `本地类型定义 ${ctx.typeDefinitions.length} 个（interface/type/enum/class）`,
    ],
    limitationNotes(ctx),
  );

  return builder.build();
}
