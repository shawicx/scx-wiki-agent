import type { Command } from 'commander';
import { join } from 'path';
import { FileScanner } from '../../core/scanner.js';
import { WikiService } from '../../services/wiki-service.js';
import { CodebaseMemoryClient } from '../../mcp/codebase-memory-client.js';
import { WIKI_DIR } from '../../shared/constants.js';
import type { WikiBuildOptions } from '../../knowledge/types.js';

export function registerBuildCommand(program: Command) {
  program
    .command('build')
    .description('Generate wiki documentation from codebase knowledge graph')
    .option('--project-root <path>', 'Project root directory')
    .option('--mcp-binary <path>', 'Path to codebase-memory-mcp binary')
    .option('--model <model>', 'LLM model name (e.g. gpt-4o, qwen2.5)', 'gpt-4o-mini')
    .option('--base-url <url>', 'OpenAI-compatible API base URL')
    .option('--api-key <key>', 'API key for the LLM provider')
    .option('--no-llm', 'Generate wiki without LLM (pure rules)')
    .option('--pages <pages>', 'Comma-separated page names to generate', 'all')
    .action(async (options) => {
      const root = options.projectRoot ?? process.cwd();
      const wikiDir = join(root, WIKI_DIR);

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

        const client = new CodebaseMemoryClient(root, options.mcpBinary);
        const service = new WikiService(client, scanResult);
        const generated = await service.buildWiki(wikiDir, buildOptions);

        console.log(`\nWiki generated: ${generated.length} pages`);
        for (const page of generated) {
          console.log(`  - ${page}`);
        }
      } catch (err) {
        console.error(`Build failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
