import { Command } from 'commander';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { AGENT_DIR, WIKI_DIR, CACHE_DIR } from '../../shared/constants.js';

export function registerInitCommand(program: Command) {
  program
    .command('init')
    .description('Initialize wiki-agent in the project')
    .option('--project-root <path>', 'Project root directory')
    .action(async (options) => {
      const root = options.projectRoot ?? process.cwd();
      const agentDir = join(root, AGENT_DIR);
      const wikiDir = join(root, WIKI_DIR);

      if (!existsSync(agentDir)) {
        mkdirSync(join(agentDir, CACHE_DIR), { recursive: true });
        console.log(`Created ${AGENT_DIR}/`);
      }
      if (!existsSync(wikiDir)) {
        mkdirSync(wikiDir, { recursive: true });
        console.log(`Created ${WIKI_DIR}/`);
      }
      console.log('Wiki agent initialized.');
    });
}
