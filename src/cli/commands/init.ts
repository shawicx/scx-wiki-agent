import { Command } from 'commander';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { AGENT_DIR, WIKI_DIR, CACHE_DIR } from '../../shared/constants.js';
import { globalConfigPath, CONFIG_TEMPLATE } from '../../shared/config.js';

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

      // 全局配置示例（幂等；已存在时不覆盖用户配置）
      const configPath = globalConfigPath();
      if (!existsSync(configPath)) {
        mkdirSync(join(homedir(), '.scx', 'wiki-agent'), { recursive: true });
        writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        console.log(`Created global config ${configPath}`);
      }
      console.log('Wiki agent initialized.');
    });
}
