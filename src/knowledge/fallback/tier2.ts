/**
 * Tier-2 surface 页的规则路径渲染（public-api/routes/components/state/routing/
 * workspaces/package-boundaries/db-schema）。中文标题 + 确定性事实表 +
 * 「本页确定知道的事实 / 未知项」区块；数据全部来自对应 context 的确定性提取。
 */

import { WikiBuilder } from '../wiki-builder.js';
import { hasIntent, intentTable, renderFactsAndUnknowns } from './shared.js';
import type {
  PublicApiContext, RoutesContext, ComponentsContext, StateContext,
  RoutingContext, WorkspacesContext, PackageBoundariesContext, DbSchemaContext,
} from '../types.js';

export function buildPublicApi(ctx: PublicApiContext): string {
  const builder = new WikiBuilder()
    .addTitle('公共 API')
    .addParagraph(`包 \`${ctx.packageName || '-'}\`${ctx.version ? `（v${ctx.version}）` : ''} 的对外导出面。全部条目来自 package.json 与入口文件的正则级确定性提取。`);

  if (ctx.exportsField.length > 0) {
    builder.addSection('exports 字段（package.json）', '');
    builder.addTable(
      ['子路径', '指向'],
      ctx.exportsField.map(e => [`\`${e.key}\``, `\`${e.value}\``]),
    );
  }
  if (ctx.entryDecls.length > 0) {
    builder.addSection('入口声明', '');
    builder.addTable(
      ['字段', '值'],
      ctx.entryDecls.map(e => [e.key, `\`${e.value}\``]),
    );
  }
  if (ctx.reExports.length > 0) {
    builder.addSection('入口 re-export 链', '入口 barrel 的转发关系（export * / export {…} from）');
    builder.addTable(
      ['入口文件', '转发目标', '形态', '行号'],
      ctx.reExports.map(r => [`\`${r.barrel}\``, `\`${r.target}\``, r.kind === 'star' ? 'export *' : 'export {…}', String(r.line)]),
    );
  }
  if (ctx.symbols.length > 0) {
    builder.addSection('导出符号（入口文件声明）', '');
    builder.addTable(
      ['符号', '文件', '行号'],
      ctx.symbols.map(s => [`\`${s.name}\``, `\`${s.file}\``, String(s.line)]),
    );
  }

  renderFactsAndUnknowns(
    builder,
    [
      ...(ctx.exportsField.length > 0 ? [`exports 字段声明 ${ctx.exportsField.length} 个子路径`] : []),
      `入口声明 ${ctx.entryDecls.length} 条、re-export ${ctx.reExports.length} 条、导出符号 ${ctx.symbols.length} 个（均带 file:line 锚点）`,
    ],
    [
      ...(ctx.exportsField.length === 0 ? ['package.json 无 exports 字段（子路径导出形态未声明）'] : []),
      ...(ctx.symbols.length === 0 ? ['入口文件未检出导出声明（可能全部经 re-export 转发）'] : []),
    ],
  );
  return builder.build();
}

export function buildRoutes(ctx: RoutesContext): string {
  const builder = new WikiBuilder()
    .addTitle('HTTP 路由')
    .addParagraph(`正则扫描检出 ${ctx.routes.length} 条路由（Express/Nest/Fastify/Hono 字面量注册）。动态注册（变量路径）不在内。`);

  builder.addSection('路由表', '');
  builder.addTable(
    ['方法', '路径', 'handler', '框架', '中间件', '源文件:行号'],
    ctx.routes.map(r => [
      r.method, `\`${r.path}\``, r.handler.startsWith('（') ? r.handler : `\`${r.handler}\``,
      r.framework, r.middleware.length > 0 ? r.middleware.map(m => `\`${m}\``).join('<br>') : '—',
      `${r.file}:${r.line}`,
    ]),
  );

  const byFramework = new Map<string, number>();
  for (const r of ctx.routes) byFramework.set(r.framework, (byFramework.get(r.framework) ?? 0) + 1);
  renderFactsAndUnknowns(
    builder,
    [
      `路由共 ${ctx.routes.length} 条：${[...byFramework].map(([f, n]) => `${f} ${n}`).join('、')}`,
      `带中间件链的路由 ${ctx.routes.filter(r => r.middleware.length > 0).length} 条`,
    ],
    [
      ...(ctx.routes.some(r => r.handler.startsWith('（')) ? [`${ctx.routes.filter(r => r.handler.startsWith('（')).length} 条为内联 handler（匿名函数，无符号锚点）`] : []),
      '动态注册的路由（循环/变量拼接路径）不在扫描范围内',
    ],
  );
  return builder.build();
}

export function buildComponents(ctx: ComponentsContext): string {
  const builder = new WikiBuilder()
    .addTitle('组件')
    .addParagraph(`扫描检出 ${ctx.components.length} 个前端组件（.vue SFC 与 PascalCase tsx/jsx）。被引用度为词法统计（import/标签引用计数）。`);

  builder.addSection('组件清单', '');
  builder.addTable(
    ['组件', '框架', 'props', 'emits', '被引用文件数', '测试配对', '文件'],
    ctx.components.map(c => [
      `\`${c.name}\``, c.framework, String(c.propsCount), String(c.emitsCount),
      String(c.usedByCount), c.testPaired ? '✅' : '—', `\`${c.file}\``,
    ]),
  );

  const vue = ctx.components.filter(c => c.framework === 'vue').length;
  renderFactsAndUnknowns(
    builder,
    [
      `组件 ${ctx.components.length} 个（Vue ${vue} / React ${ctx.components.length - vue}）`,
      `有测试配对的组件 ${ctx.components.filter(c => c.testPaired).length} 个`,
      `被 ≥2 个文件引用的组件 ${ctx.components.filter(c => c.usedByCount >= 2).length} 个`,
    ],
    [
      ...(ctx.components.some(c => c.propsCount === 0 && c.framework === 'vue')
        ? [`${ctx.components.filter(c => c.propsCount === 0 && c.framework === 'vue').length} 个 Vue 组件未检出 defineProps 声明`] : []),
      '被引用度为词法统计（含注释/字符串同名匹配的可能，作排序参考不作事实）',
    ],
  );
  return builder.build();
}

export function buildState(ctx: StateContext): string {
  const builder = new WikiBuilder()
    .addTitle('状态管理')
    .addParagraph(`扫描检出 ${ctx.stores.length} 个状态单元（Pinia/Vuex/Redux slice/Zustand/store composable）。消费数为引用该标识符的生产文件数。`);

  builder.addSection('store 清单', '');
  builder.addTable(
    ['名称', '类型', 'state 字段（近似）', '消费文件数', '源文件:行号'],
    ctx.stores.map(s => [
      `\`${s.name}\``, s.kind, String(s.stateKeys), String(s.consumerCount), `${s.file}:${s.line}`,
    ]),
  );

  const kinds = new Map<string, number>();
  for (const s of ctx.stores) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  renderFactsAndUnknowns(
    builder,
    [
      `状态单元 ${ctx.stores.length} 个：${[...kinds].map(([k, n]) => `${k} ${n}`).join('、')}`,
      `被 ≥2 个文件消费的 store ${ctx.stores.filter(s => s.consumerCount >= 2).length} 个`,
    ],
    [
      'state 字段数为定义处代码块的近似计数（非 AST 精确解析）',
      ...(!hasIntent(ctx.intent) ? ['未检出状态设计动机注释'] : []),
    ],
  );
  if (hasIntent(ctx.intent)) {
    builder.addSection('设计动机（意图证据）', '');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
  }
  return builder.build();
}

export function buildRouting(ctx: RoutingContext): string {
  const builder = new WikiBuilder()
    .addTitle('前端路由')
    .addParagraph(`扫描检出 ${ctx.routes.length} 条路由（vue-router 配置 / react-router Route 声明）。`);

  builder.addSection('路由表', '');
  builder.addTable(
    ['路径', '组件', '路由库', '源文件:行号'],
    ctx.routes.map(r => [
      `\`${r.path}\``, r.component.startsWith('（') ? r.component : `\`${r.component}\``, r.source, `${r.file}:${r.line}`,
    ]),
  );

  renderFactsAndUnknowns(
    builder,
    [
      `路由 ${ctx.routes.length} 条（${ctx.routes.filter(r => r.source === 'vue-router').length} vue-router / ${ctx.routes.filter(r => r.source === 'react-router').length} react-router）`,
      `组件未检出的路由 ${ctx.routes.filter(r => r.component.startsWith('（')).length} 条`,
    ],
    ['动态路由（变量拼接/menu 配置驱动）不在扫描范围内'],
  );
  return builder.build();
}

export function buildWorkspaces(ctx: WorkspacesContext): string {
  const builder = new WikiBuilder()
    .addTitle('工作区')
    .addParagraph(`monorepo 工作区（声明来源 \`${ctx.source}\`）：${ctx.packages.length} 个成员包，包间 import 依赖边 ${ctx.edges.length} 条。`);

  builder.addSection('成员包', '');
  builder.addTable(
    ['包名', '版本', '目录', 'private'],
    ctx.packages.map(p => [`\`${p.name}\``, p.version || '-', `\`${p.dir}\``, p.isPrivate ? '是' : '否']),
  );

  if (ctx.edges.length > 0) {
    builder.addSection('包间依赖（import 聚合）', '');
    builder.addTable(
      ['依赖方', '被依赖方', 'import 点数', '已声明'],
      ctx.edges.map(e => [`\`${e.from}\``, `\`${e.to}\``, String(e.importCount), e.declared ? '✅' : '❌ 未声明']),
    );
  }

  renderFactsAndUnknowns(
    builder,
    [
      `成员包 ${ctx.packages.length} 个（private ${ctx.packages.filter(p => p.isPrivate).length} 个）`,
      `包间依赖边 ${ctx.edges.length} 条，其中已声明 ${ctx.edges.filter(e => e.declared).length} 条`,
    ],
    [
      ...(ctx.edges.length === 0 ? ['未检出包间 import（各包相互独立，或超出扫描上限）'] : []),
      '依赖边来自相对 import 解析（动态加载/字符串拼接不在内）',
    ],
  );
  return builder.build();
}

export function buildPackageBoundaries(ctx: PackageBoundariesContext): string {
  const builder = new WikiBuilder()
    .addTitle('包间边界')
    .addParagraph(`包间依赖边界检查：${ctx.edges.length} 条依赖边中 ${ctx.edges.filter(e => !e.declared).length} 条未在 package.json 声明。`);

  if (ctx.edges.length > 0) {
    builder.addSection('依赖边全景', '');
    builder.addTable(
      ['依赖方', '被依赖方', 'import 点数', '声明状态'],
      ctx.edges.map(e => [`\`${e.from}\``, `\`${e.to}\``, String(e.importCount), e.declared ? '✅ 已声明' : '❌ 未声明']),
    );
  }

  if (ctx.violations.length > 0) {
    builder.addSection('边界违规（未声明依赖的跨包 import）', '⚠️ 以下跨包 import 未在依赖方 package.json 声明，属隐式耦合，构建工具链（pnpm/turbo）严格模式下会失败');
    builder.addTable(
      ['依赖方', '被依赖方'],
      ctx.violations.map(v => [`\`${v.from}\``, `\`${v.to}\``]),
    );
  }

  renderFactsAndUnknowns(
    builder,
    [
      `包 ${ctx.packages.length} 个、依赖边 ${ctx.edges.length} 条`,
      `声明率 ${ctx.edges.length > 0 ? Math.round((ctx.edges.filter(e => e.declared).length / ctx.edges.length) * 100) : 100}%`,
    ],
    [
      ...(ctx.violations.length === 0 ? ['未检出未声明依赖的跨包 import'] : [`边界违规 ${ctx.violations.length} 条（详见上表）`]),
    ],
  );
  return builder.build();
}

export function buildDbSchema(ctx: DbSchemaContext): string {
  const builder = new WikiBuilder()
    .addTitle('数据模型')
    .addParagraph(`schema 检出类型：${ctx.detectedKinds.join('、')}。模型 ${ctx.models.length} 个，字段为正则级提取（非 AST 解析）。`);

  for (const model of ctx.models) {
    builder.addSection(`${model.name}（${model.kind}）`, `定义：\`${model.file}:${model.line}\``);
    if (model.fields.length > 0) {
      builder.addTable(
        ['字段', '类型', '约束/属性'],
        model.fields.map(f => [f.name, `\`${f.type}\``, f.attrs || '—']),
      );
    } else {
      builder.addParagraph('未解析出字段（schema 语法超出解析范围，以源文件为准）。');
    }
  }

  renderFactsAndUnknowns(
    builder,
    [
      `模型 ${ctx.models.length} 个（${ctx.detectedKinds.map(k => `${k} ${ctx.models.filter(m => m.kind === k).length}`).join('、')}）`,
      `平均字段数 ${(ctx.models.reduce((n, m) => n + m.fields.length, 0) / Math.max(ctx.models.length, 1)).toFixed(1)}（单模型解析上限 15 字段）`,
    ],
    [
      ...(ctx.models.some(m => m.fields.length === 0) ? [`${ctx.models.filter(m => m.fields.length === 0).length} 个模型未解析出字段`] : []),
      '字段类型为字面量提取，未做 ORM 类型映射推断',
    ],
  );
  return builder.build();
}
