import type { GraphNode, GraphEdge, GraphPath } from './types.js';
import type { DatabaseConnection } from '../database.js';

export class RelationGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private outgoingEdges = new Map<string, GraphEdge[]>();
  private incomingEdges = new Map<string, GraphEdge[]>();

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);

    const outList = this.outgoingEdges.get(edge.source) ?? [];
    outList.push(edge);
    this.outgoingEdges.set(edge.source, outList);

    const inList = this.incomingEdges.get(edge.target) ?? [];
    inList.push(edge);
    this.incomingEdges.set(edge.target, inList);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  getEdges(): GraphEdge[] {
    return [...this.edges];
  }

  getOutgoingEdges(nodeId: string): GraphEdge[] {
    return this.outgoingEdges.get(nodeId) ?? [];
  }

  getIncomingEdges(nodeId: string): GraphEdge[] {
    return this.incomingEdges.get(nodeId) ?? [];
  }

  /**
   * BFS shortest path from fromId to toId.
   * Returns a GraphPath with node IDs and the edges traversed, or null if no path exists.
   */
  findPath(fromId: string, toId: string, maxDepth: number = 10): GraphPath | null {
    if (fromId === toId) {
      return { nodes: [fromId], edges: [] };
    }

    // BFS queue entries: current node ID, path of node IDs, path of edges
    type QueueEntry = { nodeId: string; nodePath: string[]; edgePath: GraphEdge[] };
    const queue: QueueEntry[] = [{ nodeId: fromId, nodePath: [fromId], edgePath: [] }];
    const visited = new Set<string>([fromId]);

    while (queue.length > 0) {
      const { nodeId, nodePath, edgePath } = queue.shift()!;

      if (nodePath.length > maxDepth) {
        continue;
      }

      const neighbors = this.outgoingEdges.get(nodeId) ?? [];
      for (const edge of neighbors) {
        if (visited.has(edge.target)) {
          continue;
        }
        visited.add(edge.target);

        const newNodePath = [...nodePath, edge.target];
        const newEdgePath = [...edgePath, edge];

        if (edge.target === toId) {
          return { nodes: newNodePath, edges: newEdgePath };
        }

        queue.push({ nodeId: edge.target, nodePath: newNodePath, edgePath: newEdgePath });
      }
    }

    return null;
  }

  /**
   * BFS to collect all neighbor nodes within the given depth.
   */
  findRelated(nodeId: string, depth: number = 1): GraphNode[] {
    const visited = new Set<string>([nodeId]);
    const result: GraphNode[] = [];
    let frontier = new Set<string>([nodeId]);

    for (let d = 0; d < depth; d++) {
      const nextFrontier = new Set<string>();

      for (const currentId of frontier) {
        const outgoing = this.outgoingEdges.get(currentId) ?? [];
        const incoming = this.incomingEdges.get(currentId) ?? [];

        for (const edge of [...outgoing, ...incoming]) {
          const neighborId = edge.source === currentId ? edge.target : edge.source;
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            nextFrontier.add(neighborId);
            const node = this.nodes.get(neighborId);
            if (node) {
              result.push(node);
            }
          }
        }
      }

      frontier = nextFrontier;
    }

    return result;
  }

  clear(): void {
    this.nodes.clear();
    this.edges = [];
    this.outgoingEdges.clear();
    this.incomingEdges.clear();
  }

  static fromDatabase(db: DatabaseConnection): RelationGraph {
    const graph = new RelationGraph();

    const relations = db.prepare('SELECT source, target, type, file_path FROM relations').all() as Array<{
      source: string;
      target: string;
      type: string;
      file_path: string;
    }>;

    const nodeIds = new Set<string>();
    for (const rel of relations) {
      nodeIds.add(rel.source);
      nodeIds.add(rel.target);
    }

    for (const nodeId of nodeIds) {
      const symbol = db.prepare(
        'SELECT name, type, file_path FROM symbols WHERE id = ? OR name = ? LIMIT 1'
      ).get(nodeId, nodeId) as { name: string; type: string; file_path: string } | undefined;

      if (symbol) {
        graph.addNode({
          id: nodeId,
          name: symbol.name,
          type: symbol.type,
          filePath: symbol.file_path,
          metadata: {},
        });
      } else {
        graph.addNode({
          id: nodeId,
          name: nodeId,
          type: 'unknown',
          filePath: '',
          metadata: {},
        });
      }
    }

    for (const rel of relations) {
      graph.addEdge({
        source: rel.source,
        target: rel.target,
        type: rel.type,
        filePath: rel.file_path,
      });
    }

    return graph;
  }
}
