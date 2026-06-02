import type { FrameworkResolver } from './framework-resolver.js';
import type { ProjectNode, Relation } from '../core/types.js';

export class ResolverRegistry {
  private resolvers: FrameworkResolver[] = [];

  register(resolver: FrameworkResolver): void {
    this.resolvers.push(resolver);
  }

  findResolvers(content: string, filePath: string): FrameworkResolver[] {
    return this.resolvers.filter((r) => r.detect(content, filePath));
  }

  extractAll(content: string, filePath: string): { nodes: ProjectNode[]; relations: Relation[] } {
    const applicable = this.findResolvers(content, filePath);
    const nodes: ProjectNode[] = [];
    const relations: Relation[] = [];

    for (const resolver of applicable) {
      const resolverNodes = resolver.extractNodes(content, filePath);
      const resolverRelations = resolver.extractRelations(content, filePath, resolverNodes);
      nodes.push(...resolverNodes);
      relations.push(...resolverRelations);
    }

    return { nodes, relations };
  }
}
