import type { FrameworkResolver } from '../framework-resolver.js';
import type { ProjectNode, Relation } from '../../core/types.js';
import { generateId } from '../../shared/utils.js';

const LANGGRAPH_IMPORT_PATTERN = /from\s+['"]@langgraph\/|from\s+['"]langgraph['"]|from\s+['"]@langchain\/langgraph['"]/;
const STATE_GRAPH_PATTERN = /new\s+StateGraph\s*\(/;
const ANNOTATION_PATTERN = /Annotation\.Root/;

export class LangGraphResolver implements FrameworkResolver {
  name = 'langgraph';

  detect(content: string, _filePath: string): boolean {
    if (LANGGRAPH_IMPORT_PATTERN.test(content)) return true;
    if (STATE_GRAPH_PATTERN.test(content)) return true;
    if (ANNOTATION_PATTERN.test(content)) return true;
    return false;
  }

  extractNodes(content: string, filePath: string): ProjectNode[] {
    const lines = content.split('\n');
    const nodes: ProjectNode[] = [];

    // new StateGraph(...) → workflow node
    const stateGraphRegex = /new\s+StateGraph\s*\(/;
    const sgMatch = stateGraphRegex.exec(content);
    if (sgMatch) {
      const startLine = content.substring(0, sgMatch.index).split('\n').length;
      const endLine = this.findStatementEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name: 'StateGraph',
        type: 'workflow',
        filePath,
        startLine,
        endLine,
        metadata: {},
      });
    }

    // .addNode("name", handler) → agent node (nodeType='graph_node')
    const addNodeRegex = /\.addNode\s*\(\s*['"](\w+)['"]/g;
    let match;
    while ((match = addNodeRegex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findStatementEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name,
        type: 'agent',
        filePath,
        startLine,
        endLine,
        metadata: { nodeType: 'graph_node' },
      });
    }

    // @tool decorated functions → tool node
    const toolRegex = /@tool\s*\n\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    while ((match = toolRegex.exec(content)) !== null) {
      const name = match[1];
      const startLine = content.substring(0, match.index).split('\n').length;
      const endLine = this.findBlockEnd(lines, startLine);

      nodes.push({
        id: generateId(),
        name,
        type: 'tool',
        filePath,
        startLine,
        endLine,
        metadata: {},
      });
    }

    return nodes;
  }

  extractRelations(content: string, filePath: string, nodes: ProjectNode[]): Relation[] {
    const relations: Relation[] = [];

    // .addEdge("from", "to") → references relation
    const addEdgeRegex = /\.addEdge\s*\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\)/g;
    let match;
    while ((match = addEdgeRegex.exec(content)) !== null) {
      const fromName = match[1];
      const toName = match[2];

      const fromNode = nodes.find((n) => n.name === fromName);
      const toNode = nodes.find((n) => n.name === toName);

      relations.push({
        id: generateId(),
        source: fromName,
        target: toName,
        type: 'references',
        filePath,
      });
    }

    // .addConditionalEdges("from", ...) → references relation to all other agent nodes
    const conditionalEdgeRegex = /\.addConditionalEdges\s*\(\s*['"](\w+)['"]/g;
    while ((match = conditionalEdgeRegex.exec(content)) !== null) {
      const fromName = match[1];
      const fromNode = nodes.find((n) => n.name === fromName);

      // Connect to all other agent nodes
      for (const node of nodes) {
        if (node.type === 'agent' && node.name !== fromName) {
          relations.push({
            id: generateId(),
            source: fromNode?.id ?? fromName,
            target: node.id,
            type: 'references',
            filePath,
          });
        }
      }
    }

    return relations;
  }

  private findBlockEnd(lines: string[], startLine: number): number {
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
