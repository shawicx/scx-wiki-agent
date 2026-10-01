import { WikiBuilder } from '../wiki-builder.js';
import type {
  DecisionsContext, CliContext, TechStackContext,
} from '../types.js';
import { hasIntent, intentTable, renderFactsAndUnknowns } from './shared.js';

/**
 * decisions.md：设计决策与演进（git 提交 + 文档证据锚定）。
 * 纯规则生成：只渲染真实证据（提交对表/文档摘录/变更热点），
 * 每条带 commit 哈希+日期 或 文档路径锚点，规避「推导伪装成决策」。
 */
export function buildDecisions(ctx: DecisionsContext): string {
  const builder = new WikiBuilder()
    .addTitle('设计决策与演进')
    .addParagraph('基于 git 提交历史与仓库设计文档确定性提取，每条决策带证据锚点（commit 哈希+日期 / 文档路径），可回溯验证。');

  const commitCell = (c: { hash: string; date: string; subject: string } | null) =>
    c ? `\`${c.hash.slice(0, 8)}\`（${c.date}）${c.subject}` : '-';

  if (ctx.gitTimeline.length > 0) {
    builder.addSection('演进时间线（按模块）', '首次提交主题是模块「诞生动机」的最直接证据。');
    builder.addTable(
      ['模块', '提交数', '首次提交', '最近提交', '高频主题'],
      ctx.gitTimeline.map(t => [
        t.module,
        String(t.commitCount),
        commitCell(t.first),
        commitCell(t.last),
        t.themes.length > 0 ? t.themes.join('、') : '-',
      ]),
    );
  }

  if (ctx.docDecisions.length > 0) {
    builder.addSection('文档记录的决策', '仓库 README / docs 的设计文档小节摘录（锚点 = 文档路径#标题）。');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.docDecisions));
  }

  if (ctx.depCommits && ctx.depCommits.length > 0) {
    builder.addSection('依赖引入决策（提交佐证）', '');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.depCommits));
  }

  if (ctx.hotFileChurn.length > 0) {
    builder.addSection('高频变更热点（维护风险）', '提交次数最多的文件，变更越频繁维护风险越高。');
    builder.addTable(
      ['文件', '提交数', '最近提交'],
      ctx.hotFileChurn.map(c => [c.file, String(c.commitCount), commitCell(c.last)]),
    );
  }

  renderFactsAndUnknowns(
    builder,
    [
      `模块时间线 ${ctx.gitTimeline.length} 条（每条含首次/最近提交锚点）`,
      `文档决策证据 ${ctx.docDecisions.length} 条、依赖引入提交 ${ctx.depCommits?.length ?? 0} 条`,
      `高频变更文件 ${ctx.hotFileChurn.length} 个`,
    ],
    [
      ...(ctx.gitTimeline.length === 0 ? ['无 git 提交证据（非 git 仓库或无历史）'] : []),
      ...(ctx.docDecisions.length === 0 ? ['仓库文档未记录设计决策小节'] : []),
      ...(!ctx.depCommits || ctx.depCommits.length === 0 ? ['依赖引入无提交佐证'] : []),
    ],
  );

  return builder.build();
}

/**
 * cli.md：CLI 命令参考。
 * 命令表（含 file:line）+ 每命令参数表（commander .option 解析）+ 退出码表。
 */
export function buildCli(ctx: CliContext): string {
  const builder = new WikiBuilder().addTitle('CLI 参考');

  if (ctx.commands.length === 0) {
    builder.addParagraph('未检出 CLI 命令定义（commander .command 注册为空）。');
    return builder.build();
  }

  // 命令总表
  builder.addSection('命令', '');
  builder.addTable(
    ['命令', '说明', '源文件:行号'],
    ctx.commands.map(c => [
      `\`${c.name}\``,
      c.description || '-',
      c.startLine > 0 ? `${c.filePath}:${c.startLine}` : c.filePath,
    ]),
  );

  // 每个命令的参数
  for (const cmd of ctx.commands) {
    if (cmd.options.length > 0) {
      builder.addSection(`\`${cmd.name}\` 参数`, '');
      builder.addTable(
        ['参数', '说明'],
        cmd.options.map(o => [`\`${o.flag}\``, o.description]),
      );
    }
  }

  // 退出码
  if (ctx.exitCodes.length > 0) {
    builder.addSection('退出码', '');
    builder.addTable(
      ['码', '上下文', '源文件'],
      ctx.exitCodes.map(e => [String(e.code), `\`${e.context}\``, e.filePath]),
    );
  }

  renderFactsAndUnknowns(
    builder,
    [
      `CLI 命令 ${ctx.commands.length} 个（commander 注册提取，均带 file:line 锚点）`,
      `命令参数共 ${ctx.commands.reduce((n, c) => n + c.options.length, 0)} 个`,
      `退出码 ${ctx.exitCodes.length} 个（process.exit 调用点提取）`,
    ],
    [
      ...(ctx.commands.filter(c => !c.description).length > 0
        ? [`${ctx.commands.filter(c => !c.description).length} 个命令无描述文本（docstring 与 .command('name', 'desc') 均未提供）`]
        : []),
    ],
  );

  return builder.build();
}

/**
 * tech-stack.md：技术栈（R3 拒绝编造用途）。
 * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。
 */
export function buildTechStack(ctx: TechStackContext): string {
  const builder = new WikiBuilder()
    .addTitle('技术栈')
    .addParagraph('技术栈与依赖说明。每个依赖均标注源码首个 import 点（R3 拒绝编造用途）。');

  if (ctx.coreDeps.length > 0) {
    builder.addSection('核心依赖', '');
    builder.addTable(
      ['依赖', '版本', '首个 import 点'],
      ctx.coreDeps.map(d => [
        `\`${d.name}\``,
        d.version,
        d.importFiles[0] ? `\`${d.importFiles[0]}\`` : '-',
      ]),
    );
  }

  if (ctx.devDeps.length > 0) {
    builder.addSection('开发依赖', '仅开发环境使用');
    builder.addTable(
      ['依赖', '版本', '使用方式', '首个 import 点'],
      ctx.devDeps.map(d => [
        `\`${d.name}\``,
        d.version,
        d.usageKind,
        d.importFiles[0] ? `\`${d.importFiles[0]}\`` : '-',
      ]),
    );
  }

  if (ctx.testDeps.length > 0) {
    builder.addSection('测试专用依赖', '仅测试链路使用，不属于生产运行时技术栈');
    builder.addTable(
      ['依赖', '版本', '首个测试 import 点'],
      ctx.testDeps.map(d => [
        `\`${d.name}\``,
        d.version,
        d.importFiles[0] ? `\`${d.importFiles[0]}\`` : '-',
      ]),
    );
  }

  if (ctx.unusedDeps.length > 0) {
    builder.addSection('声明未用依赖', '⚠️ package.json 声明但源码中 0 import，请确认是否需要');
    builder.addTable(
      ['依赖', '版本'],
      ctx.unusedDeps.map(d => [`\`${d.name}\``, d.version]),
    );
  }

  // 依赖引入动机（git 提交佐证，R7 锚点保留）
  if (hasIntent(ctx.intent)) {
    builder.addSection('引入动机（提交佐证）', '');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
  }

  builder.addSection('运行时与构建', '');
  builder.addTable(
    ['项', '值'],
    [
      ['模块系统', ctx.runtime],
      ['构建工具', ctx.buildTool],
      ['包管理器', ctx.packageManager],
    ],
  );

  renderFactsAndUnknowns(
    builder,
    [
      `核心依赖 ${ctx.coreDeps.length} 个、开发依赖 ${ctx.devDeps.length} 个、测试专用 ${ctx.testDeps.length} 个`,
      ...(ctx.unusedDeps.length > 0 ? [`声明未用依赖 ${ctx.unusedDeps.length} 个（package.json 有声明、源码 0 import）`] : []),
      `模块系统 ${ctx.runtime} / 构建工具 ${ctx.buildTool} / 包管理器 ${ctx.packageManager}`,
      ...(hasIntent(ctx.intent) ? [`依赖引入动机提交证据 ${ctx.intent!.length} 条`] : []),
    ],
    [
      ...(ctx.coreDeps.filter(d => d.importFiles.length === 0).length > 0
        ? [`${ctx.coreDeps.filter(d => d.importFiles.length === 0).length} 个核心依赖未检出 import 点（用途证据缺失）`]
        : []),
      ...(ctx.unusedDeps.length > 0 ? ['声明未用依赖的取舍原因未知（需人工确认是否移除）'] : []),
    ],
  );

  return builder.build();
}
