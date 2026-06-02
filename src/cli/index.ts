import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerScanCommand } from './commands/scan.js';
import { registerIndexCommand } from './commands/index.js';
import { registerAskCommand } from './commands/ask.js';
import { registerBuildCommand } from './commands/build.js';
import { registerUpdateCommand } from './commands/update.js';

export function createProgram(): Command {
  const program = new Command();
  program
    .name('scx-wiki-agent')
    .description(
      'Project Wiki Agent — Local knowledge base for software projects.\n\n' +
      'Commands:\n' +
      '  init    Initialize wiki-agent in the project\n' +
      '  scan    Scan project structure and identify tech stack\n' +
      '  index   Build local index (AST, symbols, chunks, FTS5)\n' +
      '  ask     Ask a question about the project\n' +
      '  build   Generate wiki documentation\n' +
      '  update  Incremental update based on git changes'
    )
    .version('0.1.0');

  registerInitCommand(program);
  registerScanCommand(program);
  registerIndexCommand(program);
  registerAskCommand(program);
  registerBuildCommand(program);
  registerUpdateCommand(program);

  return program;
}
