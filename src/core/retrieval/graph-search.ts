import type { RelationGraph } from '../graph/relation-graph.js';
import type { DatabaseConnection } from '../database.js';
import type { RetrievalResult } from './types.js';

export class GraphSearch {
  private graph: RelationGraph;
  private db: DatabaseConnection;

  constructor(graph: RelationGraph, db: DatabaseConnection) {
    this.graph = graph;
    this.db = db;
  }

  search(query: string, depth: number = 2, limit: number = 10): RetrievalResult[] {
    const results: RetrievalResult[] = [];
    const allNodes = this.graph.getNodes();

    // Find matching nodes
    const matched = allNodes.filter(
      (n) =>
        n.name.toLowerCase().includes(query.toLowerCase()) ||
        n.filePath.toLowerCase().includes(query.toLowerCase())
    );

    for (const node of matched) {
      // Get the node's own file
      results.push({
        chunkId: `graph-${node.id}`,
        filePath: node.filePath,
        content: `${node.name} (${node.type})`,
        startLine: 0,
        endLine: 0,
        score: 0.9,
        source: 'graph',
        metadata: { graphNodeType: node.type, graphNodeName: node.name },
      });

      // Get related nodes
      const related = this.graph.findRelated(node.id, depth);
      for (const rel of related.slice(0, limit)) {
        if (!results.some((r) => r.filePath === rel.filePath)) {
          results.push({
            chunkId: `graph-${rel.id}`,
            filePath: rel.filePath,
            content: `${rel.name} (${rel.type})`,
            startLine: 0,
            endLine: 0,
            score: 0.6,
            source: 'graph',
            metadata: { graphNodeType: rel.type, graphNodeName: rel.name, relatedTo: node.name },
          });
        }
      }
    }

    return results.slice(0, limit);
  }
}
