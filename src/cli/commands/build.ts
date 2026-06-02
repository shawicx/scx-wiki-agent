import type { Command } from 'commander';
import { join } from 'path';
import { createDatabase, closeDatabase } from '../../core/database.js';
import { FileScanner } from '../../core/scanner.js';
import { WikiService } from '../../services/wiki-service.js';
import { AGENT_DIR, DB_NAME, WIKI_DIR } from '../../shared/constants.js';
import type { WikiBuildOptions } from '../../knowledge/types.js';

export function registerBuildCommand(program: Command) {
  program
    .command('build')
    .description('Generate wiki documentation')
    .option('--project-root <path>', 'Project root directory')
    .option('--model <model>', 'LLM model name (e.g. gpt-4o, qwen2.5)', 'gpt-4o-mini')
    .option('--base-url <url>', 'OpenAI-compatible API base URL (e.g. http://localhost:11434/v1 for Ollama)')
    .option('--api-key <key>', 'API key for the LLM provider (omit for Ollama)')
    .option('--no-llm', 'Generate wiki without LLM (pure rules)')
    .option('--pages <pages>', 'Comma-separated page names to generate', 'all')
    .action(async (options) => {
      const root = options.projectRoot ?? process.cwd();
      const dbPath = join(root, AGENT_DIR, DB_NAME);
      const wikiDir = join(root, WIKI_DIR);
      const db = createDatabase(dbPath);

      const pages = options.pages === 'all'
        ? undefined
        : options.pages.split(',').map((p: string) => p.trim());

      const buildOptions: WikiBuildOptions = {
        model: options.llm !== false ? options.model : undefined,
        baseURL: options.baseUrl,
        apiKey: options.apiKey,
        noLlm: options.llm === false,
        pages,
        onChunk: (filename, text) => {
          process.stdout.write(text);
        },
      };

      try {
        const scanner = new FileScanner(root);
        const scanResult = scanner.scan();

        const service = new WikiService(db, scanResult);
        const generated = await service.buildWiki(wikiDir, buildOptions);

        console.log(`\nWiki generated: ${generated.length} pages`);
        for (const page of generated) {
          console.log(`  - ${page}`);
        }
      } finally {
        closeDatabase(db);
      }
    });
}