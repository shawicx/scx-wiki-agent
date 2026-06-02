import type { GraphNode } from './types.js';
import type { RelationGraph } from './relation-graph.js';

export class GraphQuery {
  constructor(private graph: RelationGraph) {}

  /**
   * Find a path between two nodes by name.
   * Returns the chain of GraphNodes, or null if no path is found.
   */
  findCallChain(fromName: string, toName: string): GraphNode[] | null {
    const fromNode = this.findNodeByName(fromName);
    const toNode = this.findNodeByName(toName);

    if (!fromNode || !toNode) {
      return null;
    }

    const path = this.graph.findPath(fromNode.id, toNode.id);
    if (!path) {
      return null;
    }

    return path.nodes
      .map((id) => this.graph.getNode(id))
      .filter((n): n is GraphNode => n !== undefined);
  }

  /**
   * Find nodes that depend on (have edges pointing to) the named node.
   * These are the "consumers" of the named node.
   */
  findDependents(name: string): GraphNode[] {
    const node = this.findNodeByName(name);
    if (!node) {
      return [];
    }

    const incomingEdges = this.graph.getIncomingEdges(node.id);
    const seen = new Set<string>();
    const result: GraphNode[] = [];

    for (const edge of incomingEdges) {
      if (!seen.has(edge.source)) {
        seen.add(edge.source);
        const sourceNode = this.graph.getNode(edge.source);
        if (sourceNode) {
          result.push(sourceNode);
        }
      }
    }

    return result;
  }

  /**
   * Find nodes that the named node depends on (edges pointing from it).
   * These are the "dependencies" of the named node.
   */
  findDependencies(name: string): GraphNode[] {
    const node = this.findNodeByName(name);
    if (!node) {
      return [];
    }

    const outgoingEdges = this.graph.getOutgoingEdges(node.id);
    const seen = new Set<string>();
    const result: GraphNode[] = [];

    for (const edge of outgoingEdges) {
      if (!seen.has(edge.target)) {
        seen.add(edge.target);
        const targetNode = this.graph.getNode(edge.target);
        if (targetNode) {
          result.push(targetNode);
        }
      }
    }

    return result;
  }

  private findNodeByName(name: string): GraphNode | undefined {
    return this.graph.getNodes().find((n) => n.name === name);
  }
}
