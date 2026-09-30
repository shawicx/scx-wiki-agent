import { WikiBuilder } from '../wiki-builder.js';
import { unconfirmedNote } from '../wiki-markers.js';
import type {
  EnvironmentContext, TestingContext, ConventionsContext, ConstraintsContext,
  DecisionsContext, CliContext, TechStackContext,
} from '../types.js';
import { hasIntent, intentTable } from './shared.js';
/**
 * environment.md：运行态信息（包名/版本/运行时/脚本/env 变量）。
 * 纯规则生成，数据来自 ConfigDetector 探测的实际配置文件。
 */
export function buildEnvironment(ctx: EnvironmentContext): string {
  const builder = new WikiBuilder().addTitle('Environment');

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
    builder.addSection('环境变量', '从生产源码 process.env 引用提取');
    builder.addTable(
      ['变量名', '敏感', '生产引用'],
      ctx.envVars.map(v => [
        v.name,
        v.sensitive ? '⚠️ 是' : '否',
        v.filePaths.join('<br>') || '-',
      ]),
    );
  }

  return builder.build();
}

/**
 * testing.md：测试框架/配置/目录/夹具/运行命令。
 * 纯规则生成，诚实标注未检测到的项。
 */
export function buildTesting(ctx: TestingContext): string {
  const builder = new WikiBuilder().addTitle('Testing');

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

  return builder.build();
}

/**
 * conventions.md：规约文档（AI 头号参考）。
 * 诚实标注工具链检测结果：有 lint 则列规则，无则明确提示需人工补充。
 * 从 AGENTS.md 提取关键规约段落。
 */
export function buildConventions(ctx: ConventionsContext): string {
  const builder = new WikiBuilder().addTitle('Conventions');

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

  return builder.build();
}

/**
 * constraints.md：项目边界与代价。
 * 限制常量（源码 MAX/LIMIT/TIMEOUT）+ 高复杂度函数表（complexity > 3）。
 */
export function buildConstraints(ctx: ConstraintsContext): string {
  const builder = new WikiBuilder().addTitle('Constraints');

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

  return builder.build();
}

/**
 * decisions.md：设计决策与演进（git 提交 + 文档证据锚定）。
 * 纯规则生成：只渲染真实证据（提交对表/文档摘录/变更热点），
 * 每条带 commit 哈希+日期 或 文档路径锚点，规避「推导伪装成决策」。
 */
export function buildDecisions(ctx: DecisionsContext): string {
  const builder = new WikiBuilder()
    .addTitle('Design Decisions & Evolution')
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

  return builder.build();
}

/**
 * cli.md：CLI 命令参考。
 * 命令表（含 file:line）+ 每命令参数表（commander .option 解析）+ 退出码表。
 */
export function buildCli(ctx: CliContext): string {
  const builder = new WikiBuilder().addTitle('CLI');

  if (ctx.commands.length === 0) {
    builder.addParagraph('No CLI commands detected.');
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

  return builder.build();
}

/**
 * tech-stack.md：技术栈（R3 拒绝编造用途）。
 * 三张表：核心依赖（含首个 import 点）、开发依赖、声明未用依赖。
 */
export function buildTechStack(ctx: TechStackContext): string {
  const builder = new WikiBuilder()
    .addTitle('Tech Stack')
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

  return builder.build();
}
