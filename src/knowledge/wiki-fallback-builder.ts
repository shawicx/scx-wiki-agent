import { WikiBuilder } from './wiki-builder.js';
import type {
  OverviewContext,
  ArchitectureContext,
  DataFlowContext,
  ModulesContext,
  ApiContext,
  BusinessContext,
  DesignDecisionsContext,
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
  DecisionsContext,
} from './types.js';

function sanitizeMermaid(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

export class WikiFallbackBuilder {
  /** 按页面名派发规则生成（供 PageRegistry 调用） */
  buildByName(page: string, ctx: any): string {
    switch (page) {
      case 'overview': return this.buildOverview(ctx);
      case 'architecture': return this.buildArchitecture(ctx);
      case 'data-flow': return this.buildDataFlow(ctx);
      case 'modules': return this.buildModules(ctx);
      case 'api': return this.buildApi(ctx);
      case 'business': return this.buildBusiness(ctx);
      case 'design-decisions': return this.buildDesignDecisions(ctx);
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
      case 'cli': return this.buildCli(ctx);
      case 'tech-stack': return this.buildTechStack(ctx);
      case 'decisions': return this.buildDecisions(ctx);
      default: return '';
    }
  }

  buildOverview(ctx: OverviewContext): string {
    const builder = new WikiBuilder()
      .addTitle('Project Overview')
      .addParagraph(`A ${ctx.projectType} project with ${ctx.fileCount} files.`);

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

    return builder.build();
  }

  buildArchitecture(ctx: ArchitectureContext): string {
    const builder = new WikiBuilder()
      .addTitle('Architecture')
      .addParagraph('Module overview:');

    for (const mod of ctx.modules) {
      const topExports = mod.symbols
        .filter((s, i, a) => a.findIndex(t => t.name === s.name) === i)
        .slice(0, 5);
      const desc = topExports.length > 0
        ? `Key exports: ${topExports.map(s => `\`${s.name}\``).join(', ')}`
        : 'No top-level symbols detected';
      builder.addSection(mod.name, desc);
    }

    // 分层信息（来自 MCP get_architecture）
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
            m.filePath ? `${m.filePath}:${m.callLine}` : '-',
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
        .filter((s, i, a) => a.findIndex(t => t.name === s.name) === i)
        .slice(0, 5)
        .map(s => `\`${s.name}\``)
        .join(', ');

      const dependsOn = [...new Set(mod.outgoingRelations.map(r => r.target))].slice(0, 5);
      const usedBy = [...new Set(mod.incomingRelations.map(r => r.source))].slice(0, 5);

      const parts: string[] = [];
      if (topExports) parts.push(`Key exports: ${topExports}`);
      if (dependsOn.length > 0) parts.push(`Depends on: ${dependsOn.map(d => `\`${d}\``).join(', ')}`);
      if (usedBy.length > 0) parts.push(`Used by: ${usedBy.map(u => `\`${u}\``).join(', ')}`);

      builder.addSection(mod.name, parts.length > 0 ? parts.join('\n\n') : 'No details available.');

      if (mod.fileSymbols.length > 0) {
        builder.addSubSection('File Structure', '');
        builder.addTable(
          ['File', 'Key Symbols'],
          mod.fileSymbols.map(fs => [
            `\`${fs.file}\``,
            fs.symbols.slice(0, 5).map(s => `\`${s.name}\``).join(', '),
          ]),
        );
      }
    }

    return builder.build();
  }

  buildApi(ctx: ApiContext): string {
    const builder = new WikiBuilder()
      .addTitle('API Reference');

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

    if (commands.length === 0 && functions.length === 0) {
      builder.addParagraph('No API surface detected.');
    }

    return builder.build();
  }

  buildBusiness(ctx: BusinessContext): string {
    const builder = new WikiBuilder()
      .addTitle('Business Logic');

    if (ctx.services.length === 0) {
      builder.addParagraph('No services or repositories found.');
      return builder.build();
    }

    for (const svc of ctx.services) {
      const methods = svc.methods
        .filter((m, i, a) => a.findIndex(t => t.name === m.name) === i)
        .slice(0, 8)
        .map(m => `\`${m.name}\``)
        .join(', ');
      const deps = [...new Set(svc.dependencies.map(d => d.target))].slice(0, 5);

      const parts: string[] = [];
      if (methods) parts.push(`Methods: ${methods}`);
      if (deps.length > 0) parts.push(`Dependencies: ${deps.map(d => `\`${d}\``).join(', ')}`);

      builder.addSection(svc.name, parts.length > 0 ? parts.join('\n\n') : 'No details available.');
    }

    return builder.build();
  }

  buildDesignDecisions(ctx: DesignDecisionsContext): string {
    const builder = new WikiBuilder()
      .addTitle('Design Decisions');

    if (ctx.patterns.length > 0) {
      builder.addSection('Design Patterns', '');
      for (const pattern of ctx.patterns) {
        builder.addSubSection(pattern.pattern,
          pattern.evidence.map(e => `- ${e}`).join('\n'));
      }
    }

    if (ctx.techChoices.length > 0) {
      builder.addSection('Technology Choices', '').addTable(
        ['Technology', 'Category', 'Evidence'],
        ctx.techChoices.map(t => [t.technology, t.category, t.evidence.join('; ')]),
      );
    }

    if (ctx.patterns.length === 0 && ctx.techChoices.length === 0) {
      builder.addParagraph('No design patterns or technology choices detected.');
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
        s.filePath,
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

    return builder.build();
  }

  buildTroubleshooting(ctx: TroubleshootingContext): string {
    const builder = new WikiBuilder()
      .addTitle('Troubleshooting');

    builder.addSection('Build Issues', 'If the build fails, check that all dependencies are installed.');
    builder.addSection('Runtime Issues', 'Common runtime issues and their solutions.');

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
      .addParagraph('调用关系边表（按入口函数分组）。每条边可被 trace_path / CALLS 查询复现。');

    if (ctx.groups.length === 0 && ctx.fanIn.length === 0) {
      builder.addParagraph('No call edges traced.');
      return builder.build();
    }

    // 扇入表（被调用最多的符号）
    if (ctx.fanIn.length > 0) {
      builder.addSection('Fan-in（被调用次数）', '');
      builder.addTable(
        ['符号', '文件', '扇入'],
        ctx.fanIn.map(f => [f.symbol, f.file, String(f.inDegree)]),
      );
    }

    // 按入口分组的调用边表
    for (const group of ctx.groups) {
      builder.addSection(group.entry, `入口文件：${group.entryFile}`);
      builder.addTable(
        ['调用方', '被调用方', '源文件:行号'],
        group.edges.map(e => [
          e.caller,
          e.callee,
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
        '> **数据局限**：当前 MCP 知识图谱未提供继承关系（INHERITS 边），本页只列出类清单与成员方法，不含继承树。多态方法的子类实现需人工补充。',
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
   * 索引表覆盖全部已注册文档，含项目元数据。
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

    // 文档索引表（核心：覆盖全部文档）
    if (ctx.docIndex.length > 0) {
      builder.addSection('文档索引', '');
      builder.addTable(
        ['文档', '层级', '回答的问题'],
        ctx.docIndex.map(d => [`[${d.file}](${d.file})`, d.tier, d.answer]),
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
      builder.addSection('环境变量', '从源码 process.env 引用提取');
      builder.addTable(
        ['变量名', '敏感', '用途'],
        ctx.envVars.map(v => [v.name, v.sensitive ? '⚠️ 是' : '否', '需人工补充用途说明']),
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
      ],
    );

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
        '> **注意**：未检测到 lint 配置（eslint/biome）。命名/格式规约需人工补充。',
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
        ['常量', '值', '源文件'],
        ctx.constants.map(c => [`\`${c.name}\``, `\`${c.value}\``, c.filePath]),
      );
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
        ['依赖', '版本', '首个 import 点'],
        ctx.devDeps.map(d => [
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
   * decisions.md：ADR 架构决策记录。
   * 每条 ADR：编号+状态+背景+决策+后果+相关文件（R1 锚点、R4 结构化）。
   */
  buildDecisions(ctx: DecisionsContext): string {
    const builder = new WikiBuilder().addTitle('Architecture Decision Records');

    if (!ctx.fromMcp) {
      builder.addParagraph(
        '> **数据来源**：MCP 未提供持久化 ADR，以下决策记录基于代码结构自动推导生成。' +
        '建议人工审阅后用 `manage_adr(mode=update)` 持久化。',
      );
    }

    if (ctx.adrs.length === 0) {
      builder.addParagraph('No architecture decisions detected.');
      return builder.build();
    }

    for (const adr of ctx.adrs) {
      builder.addSection(`${adr.id}: ${adr.title}`, '');
      builder.addTable(
        ['项', '内容'],
        [
          ['状态', adr.status],
          ['背景', adr.context],
          ['决策', adr.decision],
          ['后果', adr.consequences],
          ['相关文件', adr.files.map(f => `\`${f}\``).join(', ') || '-'],
        ],
      );
    }

    return builder.build();
  }
}
