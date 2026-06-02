import type { ProjectNode, Relation } from '../core/types.js';

export interface FrameworkResolver {
  /** Name of the framework this resolver handles */
  name: string;

  /** Detect if this resolver applies to the given file content */
  detect(content: string, filePath: string): boolean;

  /** Extract semantic project nodes from file */
  extractNodes(content: string, filePath: string): ProjectNode[];

  /** Extract framework-specific relations between nodes */
  extractRelations(content: string, filePath: string, nodes: ProjectNode[]): Relation[];
}
