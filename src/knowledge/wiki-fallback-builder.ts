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
} from './types.js';

function sanitizeMermaid(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

export class WikiFallbackBuilder {
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

    for (const seq of ctx.sequences) {
      // Build Mermaid sequenceDiagram
      const lines: string[] = ['sequenceDiagram'];
      for (const p of seq.participants) {
        lines.push(`    participant ${sanitizeMermaid(p.name)}`);
      }
      for (const msg of seq.messages) {
        lines.push(`    ${sanitizeMermaid(msg.from)}->>${sanitizeMermaid(msg.to)}: ${sanitizeMermaid(msg.label)}`);
      }

      builder.addSection(seq.name, '');
      builder.addCodeBlock('mermaid', lines.join('\n'));

      // Call-step table for reference
      if (seq.messages.length > 0) {
        builder.addTable(
          ['From', 'To', 'Call', 'Location'],
          seq.messages.map(m => [
            m.from,
            m.to,
            m.label,
            `${m.filePath}:${m.callLine}`,
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
        ['Function', 'File', 'Line'],
        functions.map(f => [f.name, f.filePath, String(f.startLine)]),
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
      ['Name', 'Type', 'File'],
      ctx.symbols.map(s => [s.name, s.type, s.filePath]),
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

    if (ctx.cliCommands.length > 0) {
      builder.addSection('Project Initialization',
        `\`\`\`bash\n# Initialize the project\n${ctx.packageManager} run ${ctx.cliCommands.find(c => c.name === 'init')?.name ?? 'init'}\n\`\`\``,
      );
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
}
