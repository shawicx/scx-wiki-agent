import type { FrameworkResolver } from '../framework-resolver.js';
import type { ProjectNode, Relation } from '../../core/types.js';
import { generateId } from '../../shared/utils.js';

const NEST_DECORATORS = [
  '@Controller',
  '@Injectable',
  '@Module',
  '@Get',
  '@Post',
  '@Put',
  '@Delete',
  '@Patch',
];

const NEST_IMPORT_PATTERN = /from\s+['"]@nestjs\//;

export class NestResolver implements FrameworkResolver {
  name = 'nest';

  detect(content: string, _filePath: string): boolean {
    if (NEST_IMPORT_PATTERN.test(content)) return true;
    return NEST_DECORATORS.some((dec) => content.includes(dec));
  }

  extractNodes(content: string, filePath: string): ProjectNode[] {
    const lines = content.split('\n');
    const nodes: ProjectNode[] = [];

    // Extract @Controller classes
    const controllerRegex = /@Controller\(['"](.*?)['"]\)\s*\n?\s*export\s+class\s+(\w+)/;
    const controllerMatch = controllerRegex.exec(content);
    if (controllerMatch) {
      const route = controllerMatch[1];
      const className = controllerMatch[2];
      const startLine = content.substring(0, controllerMatch.index).split('\n').length;
      const endLine = this.findClassEnd(lines, startLine);
      nodes.push({
        id: generateId(),
        name: className,
        type: 'api',
        filePath,
        startLine,
        endLine,
        metadata: { route },
      });

      // Extract route methods within the controller
      const methodRegex = /@(Get|Post|Put|Delete|Patch)\((?:['"](.*?)['"])?\)\s*\n?\s*(?:async\s+)?(\w+)\s*\(/g;
      let methodMatch;
      while ((methodMatch = methodRegex.exec(content)) !== null) {
        const httpMethod = methodMatch[1].toLowerCase();
        const routePath = methodMatch[2] ?? '';
        const methodName = methodMatch[3];
        const methodStartLine = content.substring(0, methodMatch.index).split('\n').length;
        const methodEndLine = this.findMethodEnd(lines, methodStartLine);
        nodes.push({
          id: generateId(),
          name: methodName,
          type: 'api',
          filePath,
          startLine: methodStartLine,
          endLine: methodEndLine,
          metadata: {
            httpMethod,
            route: routePath,
            parentController: className,
          },
        });
      }
    }

    // Extract @Injectable classes (services)
    const serviceRegex = /@Injectable\(\)\s*\n?\s*export\s+class\s+(\w+)/;
    const serviceMatch = serviceRegex.exec(content);
    if (serviceMatch) {
      const className = serviceMatch[1];
      const startLine = content.substring(0, serviceMatch.index).split('\n').length;
      const endLine = this.findClassEnd(lines, startLine);
      nodes.push({
        id: generateId(),
        name: className,
        type: 'service',
        filePath,
        startLine,
        endLine,
        metadata: {},
      });
    }

    // Extract @Module classes
    const moduleRegex = /@Module\(\{[\s\S]*?\}\)\s*\n?\s*export\s+class\s+(\w+)/;
    const moduleMatch = moduleRegex.exec(content);
    if (moduleMatch) {
      const className = moduleMatch[1];
      const startLine = content.substring(0, moduleMatch.index).split('\n').length;
      const endLine = this.findClassEnd(lines, startLine);

      // Parse controllers and providers from module decorator
      const controllers = this.parseModuleArray(moduleMatch[0], 'controllers');
      const providers = this.parseModuleArray(moduleMatch[0], 'providers');

      nodes.push({
        id: generateId(),
        name: className,
        type: 'module',
        filePath,
        startLine,
        endLine,
        metadata: { controllers, providers },
      });
    }

    return nodes;
  }

  extractRelations(content: string, filePath: string, nodes: ProjectNode[]): Relation[] {
    const relations: Relation[] = [];

    // Extract constructor injection relations
    // Pattern: constructor(private readonly xxx: XxxService) or constructor(private xxx: XxxService)
    const injectRegex = /constructor\s*\([^)]*?(?:private|protected|public)?\s*(?:readonly\s+)?(\w+)\s*:\s*(\w+)/g;
    let injectMatch;
    while ((injectMatch = injectRegex.exec(content)) !== null) {
      const paramName = injectMatch[1];
      const serviceName = injectMatch[2];

      // Find the source node (the class containing the constructor)
      const sourceNode = nodes.find((n) => n.type === 'api' || n.type === 'service');
      if (sourceNode) {
        relations.push({
          id: generateId(),
          source: sourceNode.name,
          target: serviceName,
          type: 'injects',
          filePath,
        });
      }
    }

    // Extract module containment relations
    const moduleNode = nodes.find((n) => n.type === 'module');
    if (moduleNode) {
      const metadata = moduleNode.metadata;
      const containedNames = [
        ...((metadata.controllers as string[]) ?? []),
        ...((metadata.providers as string[]) ?? []),
      ];
      for (const name of containedNames) {
        const targetNode = nodes.find((n) => n.name === name);
        relations.push({
          id: generateId(),
          source: moduleNode.name,
          target: name,
          type: 'contains',
          filePath,
        });
      }
    }

    return relations;
  }

  private findClassEnd(lines: string[], startLine: number): number {
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
        return i + 1; // 1-based line number
      }
    }
    return lines.length;
  }

  private findMethodEnd(lines: string[], startLine: number): number {
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

  private parseModuleArray(moduleDecl: string, key: string): string[] {
    const regex = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`);
    const match = regex.exec(moduleDecl);
    if (!match) return [];
    return match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
