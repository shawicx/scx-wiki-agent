export interface GraphNode {
  id: string;
  name: string;
  type: string;
  filePath: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  filePath: string;
}

export interface GraphPath {
  nodes: string[];
  edges: GraphEdge[];
}
