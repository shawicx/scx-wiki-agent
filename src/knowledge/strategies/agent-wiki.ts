import { WikiBuilder } from '../wiki-builder.js';
import { BaseWikiStrategy } from './base-wiki-strategy.js';
import type { WikiPage } from './base-wiki-strategy.js';

/**
 * AgentWikiStrategy generates wiki pages for AI agent projects.
 *
 * Pages:
 * - agents.md: Symbols matching '%Agent%'
 * - tools.md: Symbols matching '%tool%' or '%Tool%'
 * - workflows.md: Relations WHERE type='references'
 * - memory.md: Static placeholder content about agent memory management
 */
export class AgentWikiStrategy extends BaseWikiStrategy {
  generatePages(): WikiPage[] {
    return [
      this.generateAgentsPage(),
      this.generateToolsPage(),
      this.generateWorkflowsPage(),
      this.generateMemoryPage(),
    ];
  }

  private generateAgentsPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('Agents');

    const agents = this.db
      .prepare(
        "SELECT name, type, file_path, start_line FROM symbols WHERE name LIKE '%Agent%'",
      )
      .all() as Array<{ name: string; type: string; file_path: string; start_line: number }>;

    if (agents.length === 0) {
      builder.addParagraph('No agent symbols found.');
      return { filename: 'agents.md', content: builder.build() };
    }

    builder.addTable(
      ['Agent', 'Type', 'File', 'Line'],
      agents.map((a) => [a.name, a.type, a.file_path, String(a.start_line)]),
    );

    return { filename: 'agents.md', content: builder.build() };
  }

  private generateToolsPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('Tools');

    const tools = this.db
      .prepare(
        "SELECT name, type, file_path, start_line FROM symbols WHERE name LIKE '%tool%' OR name LIKE '%Tool%'",
      )
      .all() as Array<{ name: string; type: string; file_path: string; start_line: number }>;

    if (tools.length === 0) {
      builder.addParagraph('No tool symbols found.');
      return { filename: 'tools.md', content: builder.build() };
    }

    builder.addTable(
      ['Tool', 'Type', 'File', 'Line'],
      tools.map((t) => [t.name, t.type, t.file_path, String(t.start_line)]),
    );

    return { filename: 'tools.md', content: builder.build() };
  }

  private generateWorkflowsPage(): WikiPage {
    const builder = new WikiBuilder().addTitle('Workflows');

    const references = this.db
      .prepare(
        "SELECT source, target, file_path FROM relations WHERE type = 'references'",
      )
      .all() as Array<{ source: string; target: string; file_path: string }>;

    if (references.length === 0) {
      builder.addParagraph('No reference relations found.');
      return { filename: 'workflows.md', content: builder.build() };
    }

    builder.addSection('Reference Graph', '').addTable(
      ['Source', 'Target', 'File'],
      references.map((r) => [r.source, r.target, r.file_path]),
    );

    return { filename: 'workflows.md', content: builder.build() };
  }

  private generateMemoryPage(): WikiPage {
    const builder = new WikiBuilder()
      .addTitle('Memory Management')
      .addSection(
        'Overview',
        'Agents use memory to maintain context across conversations and tasks. Memory can be short-term (within a single session) or long-term (persisted across sessions).',
      )
      .addSection(
        'Short-term Memory',
        'Short-term memory stores the current conversation history and intermediate reasoning steps. It is reset when the agent session ends.',
      )
      .addSection(
        'Long-term Memory',
        'Long-term memory persists key facts, learned preferences, and task outcomes. It enables agents to improve over time and recall relevant context from past interactions.',
      )
      .addSection(
        'Best Practices',
        '- Keep memory entries concise and focused.\n- Periodically summarize old memories to prevent unbounded growth.\n- Use structured storage (key-value pairs, embeddings) for efficient retrieval.',
      );

    return { filename: 'memory.md', content: builder.build() };
  }
}
