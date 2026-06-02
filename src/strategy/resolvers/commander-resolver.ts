import type { FrameworkResolver } from '../framework-resolver.js';
import type { ProjectNode, Relation } from '../../core/types.js';
import { generateId } from '../../shared/utils.js';

const COMMANDER_IMPORT_PATTERN = /from\s+['"]commander['"]/;
const COMMAND_PATTERN = /\.command\s*\(/;
const OPTION_PATTERN = /\.option\s*\(/;

export class CommanderResolver implements FrameworkResolver {
  name = 'commander';

  detect(content: string, _filePath: string): boolean {
    if (COMMANDER_IMPORT_PATTERN.test(content)) return true;
    if (COMMAND_PATTERN.test(content)) return true;
    if (OPTION_PATTERN.test(content)) return true;
    return false;
  }

  extractNodes(content: string, filePath: string): ProjectNode[] {
    const lines = content.split('\n');
    const nodes: ProjectNode[] = [];

    // Extract .command('name <arg>') → command node
    const commandRegex = /\.command\s*\(\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = commandRegex.exec(content)) !== null) {
      const commandString = match[1];
      // First word is the command name
      const name = commandString.split(/\s+/)[0];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findStatementEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name,
        type: 'command',
        filePath,
        startLine,
        endLine,
        metadata: { commandString },
      });
    }

    // Extract .option('-f, --file <path>', ...) → command node (isOption=true)
    const optionRegex = /\.option\s*\(\s*['"]([^'"]+)['"]/g;
    while ((match = optionRegex.exec(content)) !== null) {
      const optionString = match[1];
      // Extract the long name: --file
      const longNameMatch = optionString.match(/--(\w[\w-]*)/);
      const name = longNameMatch ? longNameMatch[1] : optionString.trim();
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findStatementEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name,
        type: 'command',
        filePath,
        startLine,
        endLine,
        metadata: { isOption: true, optionString },
      });
    }

    return nodes;
  }

  extractRelations(_content: string, _filePath: string, _nodes: ProjectNode[]): Relation[] {
    return [];
  }

  private findStatementEnd(lines: string[], startLine: number): number {
    // Simple heuristic: find end of the chained statement
    let parenCount = 0;
    let foundOpen = false;
    for (let i = startLine - 1; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '(') {
          parenCount++;
          foundOpen = true;
        } else if (ch === ')') {
          parenCount--;
        }
      }
      if (foundOpen && parenCount <= 0) {
        return i + 1;
      }
    }
    return lines.length;
  }
}
