import { WikiBuilder } from '../wiki-builder.js';
import { BaseWikiStrategy } from './base-wiki-strategy.js';
import type { WikiPage } from './base-wiki-strategy.js';

/**
 * BackendWikiStrategy generates wiki pages for backend projects.
 *
 * Pages:
 * - api.md: REST/HTTP controllers and their endpoints
 * - business.md: Services and repositories with their methods
 */
export class BackendWikiStrategy extends BaseWikiStrategy {
  generatePages(): WikiPage[] {
    return [this.generateApiPage(), this.generateBusinessPage()];
  }

  private generateApiPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('API Reference');

    const controllers = this.db
      .prepare(
        "SELECT * FROM symbols WHERE type = 'class' AND name LIKE '%Controller%'",
      )
      .all() as Array<{ id: string; name: string; file_path: string }>;

    if (controllers.length === 0) {
      builder.addParagraph('No controllers found.');
      return { filename: 'api.md', content: builder.build() };
    }

    for (const ctrl of controllers) {
      const methods = this.db
        .prepare(
          "SELECT name, visibility FROM symbols WHERE type = 'method' AND scope = ?",
        )
        .all(ctrl.name) as Array<{ name: string; visibility: string | null }>;

      const dependencies = this.db
        .prepare('SELECT target FROM relations WHERE source = ?')
        .all(ctrl.name) as Array<{ target: string }>;

      const rows = methods.map((m) => [
        m.name,
        m.visibility ?? 'public',
        dependencies.map((d) => d.target).join(', ') || '-',
      ]);

      builder.addSection(ctrl.name, '').addTable(
        ['Method', 'Visibility', 'Dependencies'],
        rows,
      );
    }

    return { filename: 'api.md', content: builder.build() };
  }

  private generateBusinessPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('Business Logic');

    const services = this.db
      .prepare(
        "SELECT * FROM symbols WHERE type = 'class' AND (name LIKE '%Service%' OR name LIKE '%Repository%')",
      )
      .all() as Array<{ id: string; name: string; file_path: string }>;

    if (services.length === 0) {
      builder.addParagraph('No services or repositories found.');
      return { filename: 'business.md', content: builder.build() };
    }

    for (const svc of services) {
      const methods = this.db
        .prepare(
          "SELECT name FROM symbols WHERE type = 'method' AND scope = ?",
        )
        .all(svc.name) as Array<{ name: string }>;

      const methodList =
        methods.length > 0
          ? methods.map((m) => `\`${m.name}\``).join(', ')
          : 'No public methods';

      builder.addSubSection(svc.name, methodList);
    }

    return { filename: 'business.md', content: builder.build() };
  }
}
