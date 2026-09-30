import { WikiBuilder } from './wiki-builder.js';
import { UNCONFIRMED_CELL, unconfirmedNote } from './wiki-markers.js';
import { isTopicPage, isChapterPage } from './page-registry.js';
import type { IntentEvidence } from './intent-evidence.js';
import type {
  OverviewContext,
  ArchitectureContext,
  DataFlowContext,
  ModulesContext,
  ApiContext,
  GlossaryContext,
  OnboardingContext,
  TroubleshootingContext,
  CallsContext,
  ClassesContext,
  ReadmeContext,
  EnvironmentContext,
  TestingContext,
  ConventionsContext,
  ConstraintsContext,
  CliContext,
  TechStackContext,
  TopicContext,
  ChapterPageContext,
  DecisionsContext,
} from './types.js';

function sanitizeMermaid(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

const INTENT_KIND_LABELS: Record<string, string> = {
  'file-header': '文件头自述',
  'symbol-comment': '符号注释',
  'why-marker': '风险标记',
  'const-comment': '常量注释',
  'git-commit': '提交记录',
  'git-theme': '高频主题',
  'doc-section': '文档小节',
  'test-spec': '行为承诺',
  'git-churn': '变更热点',
};

/** 意图证据表（证据 | 类型 | 目标 | 锚点）：纯规则路径的「为什么」主载体 */
function intentTable(items: IntentEvidence[] | undefined): string[][] {
  return (items ?? []).map(e => [
    e.text,
    INTENT_KIND_LABELS[e.kind] ?? e.kind,
    e.target.symbol ?? e.target.module ?? e.target.file ?? '-',
    e.anchor,
  ]);
}

function hasIntent(items: IntentEvidence[] | undefined): boolean {
  return (items ?? []).length > 0;
}

function symbolAnchorText(symbol: { name: string; file?: string; startLine?: number }): string {
  const anchor = symbol.file && symbol.startLine && symbol.startLine > 0
    ? `${symbol.file}:${symbol.startLine}`
    : symbol.file;
  return anchor ? `\`${symbol.name}\`（${anchor}）` : `\`${symbol.name}\``;
}

function languageSummary(languages: Array<{ language: string; fileCount: number }> | undefined): string {
  return (languages ?? []).map(l => `${l.language} × ${l.fileCount}`).join(' / ');
}

export class WikiFallbackBuilder {
  /** 按页面名派发规则生成（供 PageRegistry 调用） */
  buildByName(page: string, ctx: any): string {
    if (isTopicPage(page)) return this.buildTopic(ctx);
    if (isChapterPage(page)) return this.buildChapterPage(ctx);
    switch (page) {
      case 'overview': return this.buildOverview(ctx);
      case 'architecture': return this.buildArchitecture(ctx);
      case 'data-flow': return this.buildDataFlow(ctx);
      case 'modules': return this.buildModules(ctx);
      case 'api': return this.buildApi(ctx);
      case 'onboarding': return this.buildOnboarding(ctx);
      case 'troubleshooting': return this.buildTroubleshooting(ctx);
      case 'glossary': return this.buildGlossary(ctx);
      case 'calls': return this.buildCalls(ctx);
      case 'classes': return this.buildClasses(ctx);
      case 'readme': return this.buildReadme(ctx);
      case 'environment': return this.buildEnvironment(ctx);
      case 'testing': return this.buildTesting(ctx);
      case 'conventions': return this.buildConventions(ctx);
      case 'constraints': return this.buildConstraints(ctx);
      case 'decisions': return this.buildDecisions(ctx);
      case 'cli': return this.buildCli(ctx);
      case 'tech-stack': return this.buildTechStack(ctx);
      default: return '';
    }
  }

  buildOverview(ctx: OverviewContext): string {
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

  buildArchitecture(ctx: ArchitectureContext): string {
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

  buildDataFlow(ctx: DataFlowContext): string {
    const builder = new WikiBuilder()
      .addTitle('Data Flow');

    if (ctx.sequences.length === 0) {
      builder.addParagraph('No execution sequences traced.');
      return builder.build();
    }

    builder.addParagraph('数据处理阶段表（调用关系详见 calls.md，此处描述数据形态转换）：');

    // 阶段表：将每个序列视为一个处理阶段，列出关键转换（R2 边表优于时序图）
    for (const seq of ctx.sequences) {
      builder.addSection(seq.name, `入口符号：${seq.entrySymbol}`);

      // 调用边表（替代 sequenceDiagram）
      if (seq.messages.length > 0) {
        builder.addParagraph('调用边表：');
        builder.addTable(
          ['调用方', '被调用方', '源文件:行号'],
          seq.messages.map(m => [
            m.from,
            m.to,
            m.filePath
              ? (m.callLine > 0 ? `${m.filePath}:${m.callLine}` : m.filePath)
              : '-',
          ]),
        );
      }
    }

    return builder.build();
  }

  buildModules(ctx: ModulesContext): string {
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

  buildApi(ctx: ApiContext): string {
    const builder = new WikiBuilder()
      .addTitle('API Reference');

    // Tauri IPC 面（desktop 项目 API 的主体，置前）
    if (ctx.ipc && (ctx.ipc.commands.length > 0 || ctx.ipc.events.length > 0)) {
      if (ctx.ipc.commands.length > 0) {
        builder.addSection('Tauri IPC 命令', '前端 invoke ↔ Rust #[tauri::command] 对表（正则扫描，invoke(变量) 动态命令名不在内）').addTable(
          ['命令', '前端调用点', 'Rust 定义', '状态'],
          ctx.ipc.commands.map(c => [
            `\`${c.name}\``,
            c.frontendCalls.slice(0, 3).map(r => `${r.file}:${r.line}`).join('<br>') || '-',
            c.rustDef ? `${c.rustDef.file}:${c.rustDef.line}` : '-',
            c.rustDef === null ? '仅前端调用' : c.frontendCalls.length === 0 ? '未被前端调用' : '双侧',
          ]),
        );
      }
      if (ctx.ipc.events.length > 0) {
        builder.addSection('Tauri IPC 事件', '').addTable(
          ['事件', '前端监听点', '发射点'],
          ctx.ipc.events.map(e => [
            `\`${e.name}\``,
            e.listeners.slice(0, 3).map(r => `${r.file}:${r.line}`).join('<br>') || '-',
            e.emits.slice(0, 3).map(r => `${r.side} ${r.file}:${r.line}`).join('<br>') || '-',
          ]),
        );
      }
    }

    const commands = ctx.commands.filter((c, i, a) => a.findIndex(t => t.name === c.name) === i);
    if (commands.length > 0) {
      builder.addSection('CLI Commands', '').addTable(
        ['Command', 'File', 'Line'],
        commands.map(c => [c.name, c.filePath, String(c.startLine)]),
      );
    }

    const functions = ctx.exportedFunctions
      .filter((f, i, a) => a.findIndex(t => t.name === f.name) === i)
      .slice(0, 20);
    if (functions.length > 0) {
      builder.addSection('Exported Functions', '').addTable(
        ['Function', 'Signature', 'File'],
        functions.map(f => [f.name, f.signature ?? '', f.filePath]),
      );
    }

    const hasIpc = !!ctx.ipc && (ctx.ipc.commands.length > 0 || ctx.ipc.events.length > 0);
    if (!hasIpc && commands.length === 0 && functions.length === 0) {
      builder.addParagraph('No API surface detected.');
    }

    return builder.build();
  }

  buildGlossary(ctx: GlossaryContext): string {
    const builder = new WikiBuilder().addTitle('Key Concepts');

    if (ctx.symbols.length === 0) {
      builder.addParagraph('No symbols found.');
      return builder.build();
    }

    builder.addTable(
      ['Name', 'Type', 'Signature', 'Docstring', 'File'],
      ctx.symbols.map(s => [
        s.name,
        s.type,
        s.signature ?? '',
        s.docstring ?? '',
        s.startLine && s.startLine > 0 ? `${s.filePath}:${s.startLine}` : s.filePath,
      ]),
    );

    return builder.build();
  }

  buildOnboarding(ctx: OnboardingContext): string {
    const builder = new WikiBuilder()
      .addTitle('Getting Started');

    const prereqs: string[] = [];
    if (ctx.nodeVersion) prereqs.push(`- Node.js ${ctx.nodeVersion}`);
    if (ctx.hasTypeScript) prereqs.push(`- TypeScript`);
    if (ctx.packageManager !== 'npm') prereqs.push(`- ${ctx.packageManager}`);
    if (prereqs.length > 0) {
      builder.addSection('Prerequisites', prereqs.join('\n'));
    }

    builder.addSection('Installation', `\`\`\`bash\n# Install dependencies\n${ctx.packageManager} install\n\`\`\``);

    // 首次运行最小示例（可复制执行）
    if (ctx.firstRunExample) {
      builder.addSection('First Run (最小示例)', '复制执行以下命令验证环境是否就绪');
      builder.addCodeBlock('bash', ctx.firstRunExample);
    }

    // 可用脚本命令
    if (ctx.scripts && Object.keys(ctx.scripts).length > 0) {
      builder.addSection('Available Scripts', '');
      builder.addTable(
        ['命令', '脚本'],
        Object.entries(ctx.scripts).map(([k, v]) => [`\`${k}\``, `\`${v}\``]),
      );
    }

    if (ctx.cliCommands.length > 0) {
      builder.addSection('CLI Commands', '').addTable(
        ['Command', 'Description'],
        ctx.cliCommands.map(c => [c.name, c.description]),
      );
    }

    if (ctx.entryFiles.length > 0) {
      builder.addSection('Entry Points', ctx.entryFiles.map(f => `- \`${f.path}\``).join('\n'));
    }

    if (ctx.sourceDirs.length > 0) {
      builder.addSection('Project Structure', ctx.sourceDirs.map(d => `- ${d}/`).join('\n'));
    }

    if (ctx.envVars && ctx.envVars.length > 0) {
      builder.addSection('Environment Variables', 'Production source references only');
      builder.addTable(
        ['Variable', 'Sensitive', 'Production references'],
        ctx.envVars.map(v => [
          v.name,
          v.sensitive ? '⚠️ Yes' : 'No',
          v.filePaths.join('<br>') || '-',
        ]),
      );
    }

    return builder.build();
  }

  buildTroubleshooting(ctx: TroubleshootingContext): string {
    const builder = new WikiBuilder()
      .addTitle('Troubleshooting');

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

    builder.addSection('Build Issues', 'If the build fails, check that all dependencies are installed.');
    builder.addSection('Runtime Issues', 'Common runtime issues and their solutions.');

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
        ['变量名', '敏感', '生产引用'],
        ctx.envVars.map(v => [
          v.name,
          v.sensitive ? '⚠️ 是' : '否',
          v.filePaths.join('<br>') || '-',
        ]),
      );
    }

    if (ctx.techStack.length > 0) {
      builder.addSection('Technology-Specific Issues',
        `Key technologies: ${ctx.techStack.join(', ')}\n\nRefer to the official documentation for each technology for specific troubleshooting guides.`);
    }

    return builder.build();
  }

  /**
   * calls.md：调用边表（R2 边表优于时序图）。
   * 纯规则生成，不使用 sequenceDiagram。
   */
  buildCalls(ctx: CallsContext): string {
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
  buildClasses(ctx: ClassesContext): string {
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

  /**
   * README.md：导航索引（wiki 总入口）。
   * 按编号目录分组索引（project-wiki「总入口：使用方式/阅读路径/核心导航」），
   * 索引表只列本次产出的文档，链接相对 wiki 根。
   */
  buildReadme(ctx: ReadmeContext): string {
    const builder = new WikiBuilder()
      .addTitle(ctx.projectName || 'Project Wiki');

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

  /**
   * environment.md：运行态信息（包名/版本/运行时/脚本/env 变量）。
   * 纯规则生成，数据来自 ConfigDetector 探测的实际配置文件。
   */
  buildEnvironment(ctx: EnvironmentContext): string {
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
  buildTesting(ctx: TestingContext): string {
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
  buildConventions(ctx: ConventionsContext): string {
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
  buildConstraints(ctx: ConstraintsContext): string {
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
   * cli.md：CLI 命令参考。
   * 命令表（含 file:line）+ 每命令参数表（commander .option 解析）+ 退出码表。
   */
  buildCli(ctx: CliContext): string {
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
  buildTechStack(ctx: TechStackContext): string {
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

  /**
   * 主题页：仓库专属跨模块协作面（图谱推导）。
   * 规则模板：文件清单 + 符号表 + CALLS 边表 + 跨包边界。
   */
  buildTopic(ctx: TopicContext): string {
    const builder = new WikiBuilder()
      .addTitle(ctx.title)
      .addParagraph('仓库专属主题（知识图谱聚类推导，横跨多个模块的协作面）。');

    builder.addSection('覆盖文件', '');
    builder.addBulletList(ctx.files.map(f => `\`${f}\``));

    if (ctx.symbols.length > 0) {
      builder.addSection('关键符号', '');
      builder.addTable(
        ['符号', '类型', '签名', '说明', '源文件:行号'],
        ctx.symbols.map(s => [
          `\`${s.name}\``,
          s.type,
          s.signature ? `\`${s.signature}\`` : '-',
          s.docstring ?? UNCONFIRMED_CELL,
          s.startLine && s.startLine > 0 ? `${s.file}:${s.startLine}` : s.file,
        ]),
      );
    }

    if (ctx.edges.length > 0) {
      builder.addSection('协作边表（文件间调用）', '');
      builder.addTable(
        ['调用方', '被调用方', '源文件:行号'],
        ctx.edges.map(e => [e.caller, e.callee, e.line > 0 ? `${e.file}:${e.line}` : e.file]),
      );
    }

    if (ctx.boundaries.length > 0) {
      builder.addSection('跨模块边界', '');
      builder.addTable(
        ['From', 'To', '调用次数'],
        ctx.boundaries.map(b => [b.from, b.to, String(b.callCount)]),
      );
    }

    if (hasIntent(ctx.intent)) {
      builder.addSection('设计动机（意图证据）', '');
      builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
    }

    return builder.build();
  }

  /** 章节页规则模板：简报 + 覆盖文件 + 关键符号 + 协作边表 + 跨模块边界 */
  buildChapterPage(ctx: ChapterPageContext): string {
    const builder = new WikiBuilder()
      .addTitle(ctx.title)
      .addParagraph(`章节「${ctx.chapterTitle}」下的仓库专属页面（outline.json 锁定）。${ctx.brief}`);

    builder.addSection('覆盖文件', '');
    builder.addBulletList(ctx.files.map(f => `\`${f}\``));

    if (ctx.symbols.length > 0) {
      builder.addSection('关键符号', '');
      builder.addTable(
        ['符号', '类型', '签名', '说明', '源文件:行号'],
        ctx.symbols.map(s => [
          `\`${s.name}\``,
          s.type,
          s.signature ? `\`${s.signature}\`` : '-',
          s.docstring ?? UNCONFIRMED_CELL,
          s.startLine && s.startLine > 0 ? `${s.file}:${s.startLine}` : s.file,
        ]),
      );
    }

    if (ctx.edges.length > 0) {
      builder.addSection('协作边表（文件间调用）', '');
      builder.addTable(
        ['调用方', '被调用方', '源文件:行号'],
        ctx.edges.map(e => [e.caller, e.callee, e.line > 0 ? `${e.file}:${e.line}` : e.file]),
      );
    }

    if (ctx.boundaries.length > 0) {
      builder.addSection('跨模块边界', '');
      builder.addTable(
        ['From', 'To', '调用次数'],
        ctx.boundaries.map(b => [b.from, b.to, String(b.callCount)]),
      );
    }

    if (hasIntent(ctx.intent)) {
      builder.addSection('设计动机（意图证据）', '');
      builder.addTable(['证据', '类型', '目标', '锚点'], intentTable(ctx.intent));
    }

    return builder.build();
  }

  /**
   * decisions.md：设计决策与演进（git 提交 + 文档证据锚定）。
   * 纯规则生成：只渲染真实证据（提交对表/文档摘录/变更热点），
   * 每条带 commit 哈希+日期 或 文档路径锚点，规避「推导伪装成决策」。
   */
  buildDecisions(ctx: DecisionsContext): string {
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
}
