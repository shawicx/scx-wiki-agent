import { WikiBuilder } from '../wiki-builder.js';
import { BaseWikiStrategy } from './base-wiki-strategy.js';
import type { WikiPage } from './base-wiki-strategy.js';

/**
 * CliWikiStrategy generates wiki pages for CLI projects.
 *
 * Pages:
 * - commands.md: Symbols matching '%command%' or '%Command%'
 * - features.md: Modules with their symbols
 */
export class CliWikiStrategy extends BaseWikiStrategy {
  generatePages(): WikiPage[] {
    return [this.generateCommandsPage(), this.generateFeaturesPage()];
  }

  private generateCommandsPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('Commands');

    const commands = this.db
      .prepare(
        "SELECT name, type, file_path, start_line FROM symbols WHERE name LIKE '%command%' OR name LIKE '%Command%'",
      )
      .all() as Array<{ name: string; type: string; file_path: string; start_line: number }>;

    if (commands.length === 0) {
      builder.addParagraph('No command symbols found.');
      return { filename: 'commands.md', content: builder.build() };
    }

    builder.addTable(
      ['Command', 'Type', 'File', 'Line'],
      commands.map((c) => [c.name, c.type, c.file_path, String(c.start_line)]),
    );

    return { filename: 'commands.md', content: builder.build() };
  }

  private generateFeaturesPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('Features');

    const modules = this.db
      .prepare('SELECT name, description, symbols FROM modules')
      .all() as Array<{ name: string; description: string | null; symbols: string }>;

    if (modules.length === 0) {
      builder.addParagraph('No modules found.');
      return { filename: 'features.md', content: builder.build() };
    }

    for (const mod of modules) {
      const symbolNames = JSON.parse(mod.symbols) as string[];
      const desc = mod.description ?? 'No description';
      builder.addSubSection(
        mod.name,
        `${desc}\n\nSymbols: ${symbolNames.length > 0 ? symbolNames.map((s) => `\`${s}\``).join(', ') : 'none'}`,
      );
    }

    return { filename: 'features.md', content: builder.build() };
  }
}
