import type { FrameworkResolver } from '../framework-resolver.js';
import type { ProjectNode, Relation } from '../../core/types.js';
import { generateId } from '../../shared/utils.js';

const TAURI_IMPORT_PATTERN = /from\s+['"]@tauri-apps\/api['"]/;
const INVOKE_PATTERN = /invoke\s*\(\s*['"]/;

export class TauriResolver implements FrameworkResolver {
  name = 'tauri';

  detect(content: string, _filePath: string): boolean {
    if (TAURI_IMPORT_PATTERN.test(content)) return true;
    if (INVOKE_PATTERN.test(content)) return true;
    return false;
  }

  extractNodes(content: string, filePath: string): ProjectNode[] {
    const lines = content.split('\n');
    const nodes: ProjectNode[] = [];

    // invoke("command_name") → command node (ipc=true)
    const invokeRegex = /invoke\s*\(\s*['"](.*?)['"]/g;
    let match;
    while ((match = invokeRegex.exec(content)) !== null) {
      const commandName = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findStatementEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name: commandName,
        type: 'command',
        filePath,
        startLine,
        endLine,
        metadata: { ipc: true },
      });
    }

    return nodes;
  }

  extractRelations(_content: string, _filePath: string, _nodes: ProjectNode[]): Relation[] {
    return [];
  }

  private findStatementEnd(lines: string[], startLine: number): number {
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
