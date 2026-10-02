import { WikiBuilder } from '../wiki-builder.js';
import { unconfirmedNote } from '../wiki-markers.js';
import type {
  ApiContext,
  GlossaryContext,
  OnboardingContext,
  TroubleshootingContext,
  ReadmeContext,
} from '../types.js';
import { hasIntent, intentTable, summarizeDocstring, renderFactsAndUnknowns } from './shared.js';

export function buildApi(ctx: ApiContext): string {
  const builder = new WikiBuilder()
    .addTitle('API 参考');

  // Tauri IPC 面（desktop 项目 API 的主体，置前）
  if (ctx.ipc && (ctx.ipc.commands.length > 0 || ctx.ipc.events.length > 0)) {
    if (ctx.ipc.commands.length > 0) {
      builder.addSection('Tauri IPC 命令', '前端 invoke ↔ Rust #[tauri::command] 对表（正则扫描，invoke(变量) 动态命令名不在内）').addTable(
        ['命令', '前端调用点', 'Rust 定义', '状态'],
        ctx.ipc.commands.map(c => [
          `\`${c.name}\``,
          c.frontendCalls.slice(0, 3).map(r => `${r.file}:${r.line}`).join('<br>')
            || (c.frontendMissSuspect?.length
              ? `扫描口径局限（源码存在引用：${c.frontendMissSuspect.map(r => `${r.file}:${r.line}`).join('<br>')}）`
              : '-'),
          c.rustDef ? `${c.rustDef.file}:${c.rustDef.line}`
            : (c.rustMissSuspect?.length
              ? `扫描口径局限（源码存在疑似定义：${c.rustMissSuspect.map(r => `${r.file}:${r.line}`).join('<br>')}）`
              : '-'),
          c.rustDef === null && c.rustMissSuspect?.length ? '对表未对齐（口径局限）'
            : c.rustDef === null ? '仅前端调用'
            : c.frontendCalls.length === 0 && c.frontendMissSuspect?.length ? '对表未对齐（口径局限）'
            : c.frontendCalls.length === 0 ? '未被前端调用' : '双侧',
        ]),
      );
    }
    if (ctx.ipc.events.length > 0) {
      builder.addSection('Tauri IPC 事件', '').addTable(
        ['事件', '前端监听点', '发射点'],
        ctx.ipc.events.map(e => [
          `\`${e.name}\``,
          e.listeners.slice(0, 3).map(r => `${r.file}:${r.line}`).join('<br>')
            || (e.listenMissSuspect?.length ? '扫描口径局限（源码存在引用）' : '-'),
          e.emits.slice(0, 3).map(r => `${r.side} ${r.file}:${r.line}`).join('<br>')
            || (e.emitMissSuspect?.length
              ? `扫描口径局限（源码存在引用：${e.emitMissSuspect.map(r => `${r.file}:${r.line}`).join('<br>')}）`
              : '-'),
        ]),
      );
    }
  }

  const commands = ctx.commands.filter((c, i, a) => a.findIndex(t => t.name === c.name) === i);
  if (commands.length > 0) {
    builder.addSection('CLI 命令', '').addTable(
      ['命令', '文件', '行号'],
      commands.map(c => [c.name, c.filePath, String(c.startLine)]),
    );
  }

  const functions = ctx.exportedFunctions
    .filter((f, i, a) => a.findIndex(t => t.name === f.name) === i)
    .slice(0, 20);
  if (functions.length > 0) {
    builder.addSection('导出函数', '').addTable(
      ['函数', '签名', '文件'],
      functions.map(f => [f.name, f.signature ?? '', f.filePath]),
    );
  }

  const hasIpc = !!ctx.ipc && (ctx.ipc.commands.length > 0 || ctx.ipc.events.length > 0);
  if (!hasIpc && commands.length === 0 && functions.length === 0) {
    builder.addParagraph('未检出 API 面：无 IPC 命令、CLI 命令与导出函数证据。');
  }

  renderFactsAndUnknowns(
    builder,
    [
      ...(ctx.ipc ? [`Tauri IPC 命令 ${ctx.ipc.commands.length} 个（双侧 ${ctx.ipc.commands.filter(c => c.rustDef && c.frontendCalls.length > 0).length} / 仅前端 ${ctx.ipc.commands.filter(c => !c.rustDef).length}）`, `Tauri IPC 事件 ${ctx.ipc.events.length} 个`] : []),
      `CLI 命令 ${commands.length} 个（去重后）`,
      `导出函数 ${ctx.exportedFunctions.length} 个（展示前 ${functions.length} 个）`,
    ],
    [
      ...(ctx.ipc && ctx.ipc.commands.some(c => c.rustDef === null)
        ? [`${ctx.ipc.commands.filter(c => c.rustDef === null).length} 个命令未检出 Rust 侧定义`] : []),
      ...(ctx.exportedFunctions.length > functions.length
        ? [`${ctx.exportedFunctions.length - functions.length} 个导出函数超出展示上限未列出`] : []),
    ],
  );

  return builder.build();
}

export function buildGlossary(ctx: GlossaryContext): string {
  const builder = new WikiBuilder()
    .addTitle('核心概念');

  if (ctx.symbols.length === 0) {
    builder.addParagraph('未检出带 docstring 的核心符号（图谱 Class/Method/Function/Interface 节点为空或均无注释）。');
    return builder.build();
  }

  builder.addTable(
    ['名称', '类型', '签名', '说明', '源文件:行号'],
    ctx.symbols.map(s => [
      s.name,
      s.type,
      s.signature ?? '',
      summarizeDocstring(s.docstring),
      s.startLine && s.startLine > 0 ? `${s.filePath}:${s.startLine}` : s.filePath,
    ]),
  );

  const documented = ctx.symbols.filter(s => s.docstring && s.docstring.trim().length > 0).length;
  renderFactsAndUnknowns(
    builder,
    [
      `核心符号 ${ctx.symbols.length} 个（图谱检出，按 类 → 方法 → 函数 → 接口 排序）`,
      `带 docstring 说明的符号 ${documented} 个，说明列为第一段确定性摘要`,
    ],
    [
      ...(ctx.symbols.length - documented > 0
        ? [`${ctx.symbols.length - documented} 个符号无 docstring，说明列以签名与源文件锚点为准`] : []),
    ],
  );

  return builder.build();
}

export function buildOnboarding(ctx: OnboardingContext): string {
  const builder = new WikiBuilder()
    .addTitle('快速上手');

  const prereqs: string[] = [];
  if (ctx.nodeVersion) prereqs.push(`- Node.js ${ctx.nodeVersion}`);
  if (ctx.hasTypeScript) prereqs.push(`- TypeScript`);
  if (ctx.packageManager !== 'npm') prereqs.push(`- ${ctx.packageManager}`);
  if (prereqs.length > 0) {
    builder.addSection('环境要求', prereqs.join('\n'));
  }

  builder.addSection('安装', `\`\`\`bash\n# 安装依赖\n${ctx.packageManager} install\n\`\`\``);

  // 首次运行最小示例（可复制执行）
  if (ctx.firstRunExample) {
    builder.addSection('首次运行（最小示例）', '复制执行以下命令验证环境是否就绪');
    builder.addCodeBlock('bash', ctx.firstRunExample);
  }

  // 可用脚本命令
  if (ctx.scripts && Object.keys(ctx.scripts).length > 0) {
    builder.addSection('可用脚本', '');
    builder.addTable(
      ['命令', '脚本'],
      Object.entries(ctx.scripts).map(([k, v]) => [`\`${k}\``, `\`${v}\``]),
    );
  }

  if (ctx.cliCommands.length > 0) {
    builder.addSection('CLI 命令', '').addTable(
      ['命令', '说明'],
      ctx.cliCommands.map(c => [c.name, c.description]),
    );
  }

  if (ctx.entryFiles.length > 0) {
    builder.addSection('入口文件', ctx.entryFiles.map(f => `- \`${f.path}\``).join('\n'));
  }

  if (ctx.sourceDirs.length > 0) {
    builder.addSection('项目结构', ctx.sourceDirs.map(d => `- ${d}/`).join('\n'));
  }

  if (ctx.envVars && ctx.envVars.length > 0) {
    builder.addSection('环境变量', '仅统计生产源码引用');
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
      `入口文件 ${ctx.entryFiles.length} 个、源码目录 ${ctx.sourceDirs.length} 个`,
      `可用脚本 ${ctx.scripts ? Object.keys(ctx.scripts).length : 0} 条、CLI 命令 ${ctx.cliCommands.length} 个`,
      ...(ctx.envVars ? [`生产环境变量 ${ctx.envVars.length} 个（敏感 ${ctx.envVars.filter(v => v.sensitive).length} 个）`] : []),
    ],
    [
      ...(ctx.nodeVersion ? [] : ['未指定 Node.js 版本要求（.nvmrc / engines.node 均未检出）']),
      ...(!ctx.firstRunExample ? ['未推导出首次运行最小示例（无构建脚本与 CLI 入口）'] : []),
    ],
  );

  return builder.build();
}

export function buildTroubleshooting(ctx: TroubleshootingContext): string {
  const builder = new WikiBuilder()
    .addTitle('故障排查');

  builder.addParagraph(
    unconfirmedNote('本页为规则模板生成，仅基于项目类型/技术栈/运行态探测，未采集项目真实错误日志与告警，具体条目'),
  );

  // 运行态速查（排障起点：实际命令与版本）
  const envRows: string[][] = [];
  if (ctx.packageManager) envRows.push(['包管理器', ctx.packageManager]);
  if (ctx.nodeVersion) envRows.push(['Node 版本要求', ctx.nodeVersion]);
  if (ctx.scripts && Object.keys(ctx.scripts).length > 0) {
    for (const [k, v] of Object.entries(ctx.scripts)) envRows.push([`脚本 ${k}`, `\`${v}\``]);
  }
  if (envRows.length > 0) {
    builder.addSection('运行环境速查', '');
    builder.addTable(['项', '值'], envRows);
  }

  if (ctx.entryFiles && ctx.entryFiles.length > 0) {
    builder.addSection('排障起点（入口文件）', ctx.entryFiles.map(f => `- \`${f}\``).join('\n'));
  }

  builder.addSection('构建问题', '构建失败时，优先确认依赖已完整安装（见快速上手页），再检查构建脚本的退出输出。');
  builder.addSection('运行时问题', '运行时故障先核对运行环境速查中的命令与版本，再对照下方限制常量排查越界场景。');

  if (ctx.constants && ctx.constants.length > 0) {
    builder.addSection('限制常量（超界即故障的边界）', '');
    builder.addTable(
      ['常量', '值', '源文件:行号'],
      ctx.constants.map(c => [
        `\`${c.name}\``,
        `\`${c.value}\``,
        c.line ? `${c.filePath}:${c.line}` : c.filePath,
      ]),
    );
  }

  // 意图证据：源码 TODO/FIXME 风险标记 + git 高频变更热点（作者自认的真实风险）
  if (hasIntent(ctx.intent)) {
    builder.addSection('风险信号（源码标记 + 变更热点）', '');
    builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
  }

  if (ctx.envVars && ctx.envVars.length > 0) {
    builder.addSection('环境变量', '从生产源码 process.env 引用提取');
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

  if (ctx.techStack.length > 0) {
    builder.addSection('技术栈相关问题',
      `关键技术：${ctx.techStack.join('、')}。各技术的具体排障指南以其官方文档为准。`);
  }

  renderFactsAndUnknowns(
    builder,
    [
      `排障入口文件 ${ctx.entryFiles?.length ?? 0} 个、速查表项 ${envRows.length} 条`,
      ...(ctx.constants ? [`限制常量 ${ctx.constants.length} 个（超界即故障边界）`] : []),
      ...(ctx.envVars ? [`生产环境变量 ${ctx.envVars.length} 个（敏感 ${ctx.envVars.filter(v => v.sensitive).length} 个）`] : []),
      ...(hasIntent(ctx.intent) ? [`风险信号证据 ${ctx.intent!.length} 条（TODO/FIXME 标记与高频变更文件，均带锚点）`] : []),
    ],
    [
      '未采集项目真实错误日志与告警（无数据源）',
      ...(!hasIntent(ctx.intent) ? ['未检出源码 TODO/FIXME 标记与变更热点证据'] : []),
    ],
  );

  return builder.build();
}

/**
 * README.md：导航索引（wiki 总入口）。
 * 按编号目录分组索引（project-wiki「总入口：使用方式/阅读路径/核心导航」），
 * 索引表只列本次产出的文档，链接相对 wiki 根。
 */
export function buildReadme(ctx: ReadmeContext): string {
  const builder = new WikiBuilder()
    .addTitle(ctx.projectName || '项目 Wiki');

  if (ctx.description) {
    builder.addParagraph(ctx.description);
  }

  // 项目元数据
  builder.addTable(
    ['项', '值'],
    [
      ['版本', ctx.version || '-'],
      ['许可证', ctx.license || '-'],
      ['运行时', ctx.runtime || '-'],
    ],
  );

  // 阅读路径（纯文本页名导航，不造链接，避免子集构建时死链）
  builder.addSection('阅读路径', [
    '- 新人上手：overview → tech-stack → onboarding',
    '- 理解结构：architecture → modules；调用关系查 calls',
    '- 日常开发：conventions → constraints；排障看 troubleshooting',
    '- 查证细节：calls → classes → glossary',
  ].join('\n'));

  // 按编号目录分组的文档索引
  if (ctx.docIndex.length > 0) {
    const groups = new Map<string, typeof ctx.docIndex>();
    for (const doc of ctx.docIndex) {
      const key = doc.dir || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(doc);
    }
    for (const [dir, docs] of groups) {
      builder.addSection(dir ? `${dir}/` : '根目录', '');
      builder.addTable(
        ['文档', '层级', '回答的问题'],
        docs.map(d => [`[${d.file}](${d.file})`, d.tier, d.answer]),
      );
    }
  }

  // 仓库既有文档（指向 wiki 目录外，../ 前缀）
  if (ctx.relatedDocs && ctx.relatedDocs.length > 0) {
    builder.addSection('相关文档（仓库）', 'Wiki 之外的既有文档，链接为仓库相对路径');
    builder.addTable(
      ['文档', '标题'],
      ctx.relatedDocs.map(d => [`[${d.path}](../${d.path})`, d.title]),
    );
  }

  return builder.build();
}
