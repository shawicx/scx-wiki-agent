import { WikiBuilder } from '../wiki-builder.js';
import { BaseWikiStrategy } from './base-wiki-strategy.js';
import type { WikiPage } from './base-wiki-strategy.js';

/**
 * FrontendWikiStrategy generates wiki pages for frontend projects.
 *
 * Pages:
 * - routes.md: Page/route-related functions and components
 * - state-flow.md: Custom hooks (name LIKE 'use%')
 */
export class FrontendWikiStrategy extends BaseWikiStrategy {
  generatePages(): WikiPage[] {
    return [this.generateRoutesPage(), this.generateStateFlowPage()];
  }

  private generateRoutesPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('Routes');

    const routeSymbols = this.db
      .prepare(
        "SELECT name, type, file_path, start_line FROM symbols WHERE type IN ('function', 'method') AND (name LIKE '%page%' OR name LIKE '%Page%' OR name LIKE '%route%' OR name LIKE '%Route%')",
      )
      .all() as Array<{ name: string; type: string; file_path: string; start_line: number }>;

    const routeComponents = this.db
      .prepare(
        "SELECT name, type, file_path, start_line FROM symbols WHERE type = 'function' AND (name LIKE '%Page%' OR name LIKE '%Layout%' OR name LIKE '%Route%')",
      )
      .all() as Array<{ name: string; type: string; file_path: string; start_line: number }>;

    const allSymbols = [...routeSymbols, ...routeComponents];
    const seen = new Set<string>();
    const unique = allSymbols.filter((s) => {
      const key = `${s.name}:${s.file_path}:${s.start_line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 0) {
      builder.addParagraph('No route-related symbols found.');
      return { filename: 'routes.md', content: builder.build() };
    }

    builder.addTable(
      ['Name', 'Type', 'File', 'Line'],
      unique.map((s) => [s.name, s.type, s.file_path, String(s.start_line)]),
    );

    return { filename: 'routes.md', content: builder.build() };
  }

  private generateStateFlowPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('State Flow');

    const hooks = this.db
      .prepare(
        "SELECT name, file_path, start_line FROM symbols WHERE type = 'function' AND name LIKE 'use%'",
      )
      .all() as Array<{ name: string; file_path: string; start_line: number }>;

    if (hooks.length === 0) {
      builder.addParagraph('No custom hooks found.');
      return { filename: 'state-flow.md', content: builder.build() };
    }

    builder.addSection('Custom Hooks', '').addTable(
      ['Hook', 'File', 'Line'],
      hooks.map((h) => [h.name, h.file_path, String(h.start_line)]),
    );

    return { filename: 'state-flow.md', content: builder.build() };
  }
}
