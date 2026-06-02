import type { FrameworkResolver } from '../framework-resolver.js';
import type { ProjectNode, Relation } from '../../core/types.js';
import { generateId } from '../../shared/utils.js';

const MASTRA_IMPORT_PATTERN = /from\s+['"]@mastra\/core['"]/;
const MASTRA_INSTANCE_PATTERN = /new\s+Mastra\s*\(/;
const AGENT_PATTERN = /new\s+Agent\s*\(/;

export class MastraResolver implements FrameworkResolver {
  name = 'mastra';

  detect(content: string, _filePath: string): boolean {
    if (MASTRA_IMPORT_PATTERN.test(content)) return true;
    if (MASTRA_INSTANCE_PATTERN.test(content)) return true;
    if (AGENT_PATTERN.test(content)) return true;
    return false;
  }

  extractNodes(content: string, filePath: string): ProjectNode[] {
    const lines = content.split('\n');
    const nodes: ProjectNode[] = [];

    // new Agent({ name: "..." }) → agent node
    const agentRegex = /new\s+Agent\s*\(\s*\{[^}]*?name\s*:\s*['"](.*?)['"]/gs;
    let match;
    while ((match = agentRegex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findObjectEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name,
        type: 'agent',
        filePath,
        startLine,
        endLine,
        metadata: {},
      });
    }

    // createTool({ id: "..." }) → tool node
    const toolRegex = /createTool\s*\(\s*\{[^}]*?id\s*:\s*['"](.*?)['"]/gs;
    while ((match = toolRegex.exec(content)) !== null) {
      const id = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findObjectEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name: id,
        type: 'tool',
        filePath,
        startLine,
        endLine,
        metadata: {},
      });
    }

    return nodes;
  }

  extractRelations(_content: string, _filePath: string, _nodes: ProjectNode[]): Relation[] {
    return [];
  }

  private findObjectEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundOpen = false;
    for (let i = startLine - 1; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          braceCount++;
          foundOpen = true;
        } else if (ch === '}') {
          braceCount--;
        }
      }
      if (foundOpen && braceCount === 0) {
        return i + 1;
      }
    }
    return lines.length;
  }
}
