import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerScanCommand } from './commands/scan.js';
import { registerBuildCommand } from './commands/build.js';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('scx-wiki-agent')
    .description(
      'Project Wiki Agent — Generate wiki documentation from codebase knowledge graph.\n\n' +
      'Commands:\n' +
      '  init    Initialize wiki-agent in the project\n' +
      '  scan    Scan project structure and identify tech stack\n' +
      '  build   Generate wiki documentation (via codebase-memory-mcp)'
    )
    .version('0.1.0');

  registerInitCommand(program);
  registerScanCommand(program);
  registerBuildCommand(program);

  return program;
}
