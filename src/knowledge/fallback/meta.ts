import { WikiBuilder } from '../wiki-builder.js';
import { unconfirmedNote } from '../wiki-markers.js';
import type {
  EnvironmentContext, TestingContext, ConventionsContext, ConstraintsContext,
} from '../types.js';
import { hasIntent, intentTable, renderFactsAndUnknowns } from './shared.js';
/**
 * environment.md：运行态信息（包名/版本/运行时/脚本/env 变量）。
 * 纯规则生成，数据来自 ConfigDetector 探测的实际配置文件。
 */
export function buildEnvironment(ctx: EnvironmentContext): string {
  const builder = new WikiBuilder().addTitle('运行环境');

  builder.addSection('项目信息', '');
  builder.addTable(
    ['项', '值'],
    [
      ['包名', ctx.packageName || '-'],
      ['版本', ctx.version || '-'],
      ['运行时', ctx.runtime],
      ['Node 版本', ctx.nodeVersion || '未指定'],
      ['包管理器', ctx.packageManager],
    ],
  );

  if (Object.keys(ctx.scripts).length > 0) {
    builder.addSection('脚本命令', '');
    builder.addTable(
      ['命令', '脚本'],
      Object.entries(ctx.scripts).map(([k, v]) => [k, `\`${v}\``]),
    );
  }

  if (ctx.envVars.length > 0) {
    builder.addSection('环境变量', '从生产源码 process.env 引用提取；用途列仅采集注释/缺省值/.env.example 等确定性证据');
    builder.addTable(
      ['变量名', '敏感', '用途', '生产引用'],
      ctx.envVars.map(v => [
        v.name,
        v.sensitive ? '⚠️ 是' : '否',
        v.purpose ?? '见生产引用',
        v.filePaths.join('<br>') || '-',
      ]),
    );
  }

  renderFactsAndUnknowns(
    builder,
    [
      `脚本命令 ${Object.keys(ctx.scripts).length} 条（来自 package.json）`,
      ...(ctx.envVars.length > 0
        ? [`生产环境变量 ${ctx.envVars.length} 个（敏感 ${ctx.envVars.filter(v => v.sensitive).length} 个），其中 ${ctx.envVars.filter(v => v.purpose).length} 个带确定性用途证据`]
        : []),
      ...(ctx.nodeVersion ? [`Node 版本要求：${ctx.nodeVersion}`] : []),
    ],
    [
      ...(ctx.envVars.filter(v => !v.purpose).length > 0
        ? [`${ctx.envVars.filter(v => !v.purpose).length} 个环境变量未检出用途证据（引用点无相邻注释/缺省值，.env.example 未提供）`]
        : []),
      ...(!ctx.nodeVersion ? ['未指定 Node 版本要求（.nvmrc / engines.node 均未检出）'] : []),
    ],
  );

  return builder.build();
}

/**
 * testing.md：测试框架/配置/目录/夹具/运行命令。
 * 纯规则生成，诚实标注未检测到的项。
 */
export function buildTesting(ctx: TestingContext): string {
  const builder = new WikiBuilder().addTitle('测试');

  builder.addTable(
    ['项', '值'],
    [
      ['框架', ctx.framework ?? '未检测到'],
      ['配置文件', ctx.configPath ?? '-'],
      ['运行命令', ctx.runCommand ? `\`${ctx.runCommand}\`` : '-'],
      ['测试目录', ctx.testDirs.join(', ') || '-'],
      ['夹具目录', ctx.fixturesDir ?? '-'],
      ['文件规模', `生产文件 ${ctx.productionFileCount} / 测试文件 ${ctx.testFileCount}`],
    ],
  );

  if (ctx.testOnlyEnvVars.length > 0) {
    builder.addSection('测试专用环境变量', '仅测试 / fixture 源码引用，不属于生产运行时配置');
    builder.addTable(
      ['变量名', '敏感', '测试引用'],
      ctx.testOnlyEnvVars.map(v => [
        v.name,
        v.sensitive ? '⚠️ 是' : '否',
        v.filePaths.join('<br>') || '-',
      ]),
    );
  }

  if (ctx.testOnlyConstants.length > 0) {
    builder.addSection('测试专用限制常量', '仅测试 / fixture 源码定义');
    builder.addTable(
      ['常量', '值', '源文件:行号'],
      ctx.testOnlyConstants.map(c => [
        `\`${c.name}\``,
        `\`${c.value}\``,
        c.line ? `${c.filePath}:${c.line}` : c.filePath,
      ]),
    );
  }

  if (ctx.testOnlyDeps.length > 0) {
    builder.addSection('测试专用依赖', '仅测试链路使用（测试文件 import 或测试命令引用）');
    builder.addTable(
      ['依赖', '版本', '测试证据'],
      ctx.testOnlyDeps.map(d => [
        `\`${d.name}\``,
        d.version,
        d.importFiles.map(f => `\`${f}\``).join('<br>')
          || (ctx.runCommand ? `\`${ctx.runCommand}\`` : '-'),
      ]),
    );
  }

  renderFactsAndUnknowns(
    builder,
    [
      `测试文件 ${ctx.testFileCount} 个（生产文件 ${ctx.productionFileCount} 个，测试/生产比 ${(ctx.testFileCount / Math.max(ctx.productionFileCount, 1)).toFixed(2)}）`,
      ...(ctx.framework ? [`测试框架：${ctx.framework}${ctx.configPath ? `（配置 ${ctx.configPath}）` : '（无独立配置文件，从依赖/脚本反推）'}`] : []),
      ...(ctx.runCommand ? [`运行命令：\`${ctx.runCommand}\``] : []),
      `测试专用依赖 ${ctx.testOnlyDeps.length} 个、专用环境变量 ${ctx.testOnlyEnvVars.length} 个、专用常量 ${ctx.testOnlyConstants.length} 个`,
    ],
    [
      ...(!ctx.framework ? ['未检测到测试框架（无配置文件，依赖与脚本中也无已知框架）'] : []),
      ...(!ctx.fixturesDir ? ['未检出夹具目录'] : []),
      ...(!ctx.configPath ? ['测试框架无独立配置文件（从依赖/脚本反推）'] : []),
    ],
  );

  return builder.build();
}

/**
 * conventions.md：规约文档（AI 头号参考）。
 * 诚实标注工具链检测结果：有 lint 则列规则，无则明确提示需人工补充。
 * 从 AGENTS.md 提取关键规约段落。
 */
export function buildConventions(ctx: ConventionsContext): string {
  const builder = new WikiBuilder().addTitle('规约');

  // 工具链检测状态（诚实标注）
  builder.addSection('工具链检测', '');
  builder.addTable(
    ['工具', '状态', '配置文件'],
    [
      ['Linter', ctx.hasLinter ? '✅ 已配置' : '❌ 未检测到', ctx.linterConfig ?? '-'],
      ['EditorConfig', ctx.hasEditorConfig ? '✅ 已配置' : '❌ 未检测到', '-'],
    ],
  );

  if (!ctx.hasLinter) {
    builder.addParagraph(
      unconfirmedNote('未检测到 lint 配置（eslint/biome），以下命名/格式规约'),
    );
  }

  if (ctx.editorConfig) {
    builder.addSection('EditorConfig', '');
    builder.addCodeBlock('ini', ctx.editorConfig);
  }

  // AGENTS.md 规约提取（按 ## 段落切分，取前 5 段）
  if (ctx.agentsMd) {
    builder.addSection('AI 协作规约（AGENTS.md）', '');
    const sections = ctx.agentsMd.split(/^## /m).slice(1);
    for (const section of sections.slice(0, 5)) {
      const lines = section.trim().split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim().slice(0, 500);
      builder.addSubSection(title, body || '（无内容）');
    }
  }

  renderFactsAndUnknowns(
    builder,
    [
      `lint 工具链：${ctx.hasLinter ? `已配置（${ctx.linterConfig}）` : '未检出'}`,
      `EditorConfig：${ctx.hasEditorConfig ? '已配置' : '未检出'}`,
      ...(ctx.agentsMd ? [`AGENTS.md 存在，规约段落摘录前 5 段`] : []),
    ],
    [
      ...(!ctx.hasLinter ? ['lint 规则清单未检出（配置文件缺失）'] : []),
      ...(!ctx.editorConfig ? ['无 .editorconfig，编辑器格式基线未约定'] : []),
      ...(!ctx.agentsMd ? ['无 AGENTS.md，AI 协作规约未检出'] : []),
    ],
  );

  return builder.build();
}

/**
 * constraints.md：项目边界与代价。
 * 限制常量（源码 MAX/LIMIT/TIMEOUT）+ 高复杂度函数表（complexity > 3）。
 */
export function buildConstraints(ctx: ConstraintsContext): string {
  const builder = new WikiBuilder().addTitle('约束与限制');

  builder.addParagraph('项目边界与代价：性能预算、复杂度上限、已知限制。');

  if (ctx.constants.length > 0) {
    builder.addSection('限制常量（源码提取）', '');
    builder.addTable(
      ['常量', '值', '源文件:行号'],
      ctx.constants.map(c => [
        `\`${c.name}\``,
        `\`${c.value}\``,
        c.line ? `${c.filePath}:${c.line}` : c.filePath,
      ]),
    );
  }

  // 常量注释证据：每个限制「防什么」的作者亲述（有则逐条对上常量表）
  if (hasIntent(ctx.intent)) {
    builder.addSection('限制由来（源码注释证据）', '');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
  }

  if (ctx.hotFunctions.length > 0) {
    builder.addSection('高复杂度函数（complexity > 3）', '关注圈复杂度高的函数，考虑重构');
    builder.addTable(
      ['函数', '源文件', '复杂度', '循环深度'],
      ctx.hotFunctions.map(f => [f.name, f.filePath, String(f.complexity), String(f.loopDepth)]),
    );
  }

  if (ctx.constants.length === 0 && ctx.hotFunctions.length === 0) {
    builder.addParagraph('未检测到显著限制常量或高复杂度函数。');
  }

  renderFactsAndUnknowns(
    builder,
    [
      `限制常量 ${ctx.constants.length} 个（源码 MAX/MIN/LIMIT/TIMEOUT 类命名提取，均带 file:line 锚点）`,
      `高复杂度函数 ${ctx.hotFunctions.length} 个（complexity > 3，最高 ${ctx.hotFunctions[0]?.complexity ?? 0}）`,
      ...(hasIntent(ctx.intent) ? [`限制由来注释证据 ${ctx.intent!.length} 条`] : []),
    ],
    [
      ...(ctx.constants.length === 0 ? ['未检出 MAX/MIN/LIMIT/TIMEOUT 类限制常量'] : []),
      ...(ctx.hotFunctions.length === 0 ? ['未检出 complexity > 3 的函数'] : []),
      ...(!hasIntent(ctx.intent) ? ['限制常量无相邻注释证据（由来未检出）'] : []),
    ],
  );

  return builder.build();
}

