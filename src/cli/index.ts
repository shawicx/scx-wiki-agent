import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerInitCommand } from './commands/init.js';
import { registerScanCommand } from './commands/scan.js';
import { registerBuildCommand } from './commands/build.js';

function getCliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '..', 'package.json'), join(here, '..', '..', 'package.json')];
  for (const candidate of candidates) {
    try {
      const version = JSON.parse(readFileSync(candidate, 'utf8')).version;
      if (typeof version === 'string' && version.length > 0) return version;
    } catch {
      // try the next candidate
    }
  }
  return 'unknown';
}

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
    .version(getCliVersion());

  registerInitCommand(program);
  registerScanCommand(program);
  registerBuildCommand(program);

  return program;
}
