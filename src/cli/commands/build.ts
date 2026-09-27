import type { Command } from 'commander';
import { join } from 'path';
import { FileScanner } from '../../core/scanner.js';
import { WikiService } from '../../services/wiki-service.js';
import { CodebaseMemoryClient } from '../../mcp/codebase-memory-client.js';
import { WIKI_DIR } from '../../shared/constants.js';
import { loadGlobalConfig, globalConfigPath } from '../../shared/config.js';
import type { WikiBuildOptions } from '../../knowledge/types.js';

export function registerBuildCommand(program: Command) {
  program
    .command('build')
    .description('Generate wiki documentation from codebase knowledge graph')
    .option('--project-root <path>', 'Project root directory')
    .option('--mcp-binary <path>', 'Path to codebase-memory-mcp binary')
    .option('--model <model>', 'LLM model name (e.g. gpt-4o, qwen2.5)')
    .option('--base-url <url>', 'OpenAI-compatible API base URL')
    .option('--api-key <key>', 'API key for the LLM provider')
    .option('--no-llm', 'Generate wiki without LLM (pure rules)')
    .option('--pages <pages>', 'Comma-separated page names to generate', 'all')
    .option('--mode <mode>', 'Build mode: full (wipe and rewrite .wiki) or update (skip unchanged pages); default full, config-overridable')
    .option('--refresh-topics', 'Re-detect adaptive topic pages and overwrite topics.json')
    .option('--refresh-outline', 'Re-plan outline chapters via LLM and overwrite outline.json')
    .action(async (options) => {
      const root = options.projectRoot ?? process.cwd();
      const wikiDir = join(root, WIKI_DIR);

      // 全局配置合并：CLI 参数 > ~/.scx/wiki-agent/config.yaml > 内置默认
      const config = loadGlobalConfig();
      const model = options.model ?? config?.provider.model ?? 'gpt-4o-mini';
      const baseURL = options.baseUrl ?? config?.provider.baseURL;
      const apiKey = options.apiKey ?? config?.provider.apiKey;
      const noLlm = options.llm === false || config?.build.noLlm === true;
      if (config) {
        console.log(`[wiki] 已加载全局配置 ${globalConfigPath()}（provider: ${config.provider.name}）`);
      }

      const pages = options.pages === 'all'
        ? undefined
        : options.pages.split(',').map((p: string) => p.trim());

      const buildOptions: WikiBuildOptions = {
        model: noLlm ? undefined : model,
        baseURL,
        apiKey,
        noLlm,
        pages,
        mode: options.mode === 'update' || options.mode === 'full'
          ? options.mode
          : (config?.build.mode ?? 'full'),
        refreshTopics: options.refreshTopics === true,
        refreshOutline: options.refreshOutline === true,
        timeoutSec: config?.provider.timeoutSec,
        maxOutputTokens: config?.build.maxOutputTokens,
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
