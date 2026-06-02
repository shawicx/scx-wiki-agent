import { describe, it, expect } from 'vitest';
import { RelationGraph } from '../../../src/core/graph/relation-graph.js';
import type { GraphNode, GraphEdge } from '../../../src/core/graph/types.js';

describe('RelationGraph', () => {
  it('should add nodes and edges', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'AppController', type: 'api', filePath: 'src/app.controller.ts', metadata: {} });
    graph.addNode({ id: 'n2', name: 'AppService', type: 'service', filePath: 'src/app.service.ts', metadata: {} });
    graph.addEdge({ source: 'n1', target: 'n2', type: 'injects', filePath: 'src/app.controller.ts' });

    expect(graph.getNode('n1')).toBeDefined();
    expect(graph.getEdges()).toHaveLength(1);
  });

  it('should find all edges for a node', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'A', type: 'service', filePath: 'a.ts', metadata: {} });
    graph.addNode({ id: 'n2', name: 'B', type: 'service', filePath: 'b.ts', metadata: {} });
    graph.addNode({ id: 'n3', name: 'C', type: 'service', filePath: 'c.ts', metadata: {} });
    graph.addEdge({ source: 'n1', target: 'n2', type: 'calls', filePath: 'a.ts' });
    graph.addEdge({ source: 'n1', target: 'n3', type: 'calls', filePath: 'a.ts' });

    const outEdges = graph.getOutgoingEdges('n1');
    expect(outEdges).toHaveLength(2);
  });

  it('should find call chain between two nodes', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'A', type: 'api', filePath: 'a.ts', metadata: {} });
    graph.addNode({ id: 'n2', name: 'B', type: 'service', filePath: 'b.ts', metadata: {} });
    graph.addNode({ id: 'n3', name: 'C', type: 'service', filePath: 'c.ts', metadata: {} });
    graph.addEdge({ source: 'n1', target: 'n2', type: 'calls', filePath: 'a.ts' });
    graph.addEdge({ source: 'n2', target: 'n3', type: 'calls', filePath: 'b.ts' });

    const path = graph.findPath('n1', 'n3');
    expect(path).toBeDefined();
    expect(path?.nodes).toEqual(['n1', 'n2', 'n3']);
  });

  it('should persist to database', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'A', type: 'service', filePath: 'a.ts', metadata: {} });
    graph.addEdge({ source: 'n1', target: 'n2', type: 'calls', filePath: 'a.ts' });

    expect(graph.getNodes()).toHaveLength(1);
    expect(graph.getEdges()).toHaveLength(1);
  });

  it('should return null when no path exists', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'A', type: 'service', filePath: 'a.ts', metadata: {} });
    graph.addNode({ id: 'n2', name: 'B', type: 'service', filePath: 'b.ts', metadata: {} });

    const path = graph.findPath('n1', 'n2');
    expect(path).toBeNull();
  });

  it('should return incoming edges', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'A', type: 'service', filePath: 'a.ts', metadata: {} });
    graph.addNode({ id: 'n2', name: 'B', type: 'service', filePath: 'b.ts', metadata: {} });
    graph.addNode({ id: 'n3', name: 'C', type: 'service', filePath: 'c.ts', metadata: {} });
    graph.addEdge({ source: 'n1', target: 'n3', type: 'calls', filePath: 'a.ts' });
    graph.addEdge({ source: 'n2', target: 'n3', type: 'calls', filePath: 'b.ts' });

    const inEdges = graph.getIncomingEdges('n3');
    expect(inEdges).toHaveLength(2);
  });

  it('should find related nodes within depth', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'A', type: 'service', filePath: 'a.ts', metadata: {} });
    graph.addNode({ id: 'n2', name: 'B', type: 'service', filePath: 'b.ts', metadata: {} });
    graph.addNode({ id: 'n3', name: 'C', type: 'service', filePath: 'c.ts', metadata: {} });
    graph.addEdge({ source: 'n1', target: 'n2', type: 'calls', filePath: 'a.ts' });
    graph.addEdge({ source: 'n2', target: 'n3', type: 'calls', filePath: 'b.ts' });

    const related1 = graph.findRelated('n1', 1);
    expect(related1).toHaveLength(1);
    expect(related1[0].id).toBe('n2');

    const related2 = graph.findRelated('n1', 2);
    expect(related2).toHaveLength(2);
  });

  it('should clear the graph', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'A', type: 'service', filePath: 'a.ts', metadata: {} });
    graph.addEdge({ source: 'n1', target: 'n2', type: 'calls', filePath: 'a.ts' });

    graph.clear();
    expect(graph.getNodes()).toHaveLength(0);
    expect(graph.getEdges()).toHaveLength(0);
    expect(graph.getOutgoingEdges('n1')).toHaveLength(0);
    expect(graph.getIncomingEdges('n2')).toHaveLength(0);
  });

  it('should find path with maxDepth constraint', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'n1', name: 'A', type: 'service', filePath: 'a.ts', metadata: {} });
    graph.addNode({ id: 'n2', name: 'B', type: 'service', filePath: 'b.ts', metadata: {} });
    graph.addNode({ id: 'n3', name: 'C', type: 'service', filePath: 'c.ts', metadata: {} });
    graph.addNode({ id: 'n4', name: 'D', type: 'service', filePath: 'd.ts', metadata: {} });
    graph.addEdge({ source: 'n1', target: 'n2', type: 'calls', filePath: 'a.ts' });
    graph.addEdge({ source: 'n2', target: 'n3', type: 'calls', filePath: 'b.ts' });
    graph.addEdge({ source: 'n3', target: 'n4', type: 'calls', filePath: 'c.ts' });

    // Path exists with enough depth
    const path1 = graph.findPath('n1', 'n4', 4);
    expect(path1).toBeDefined();
    expect(path1?.nodes).toEqual(['n1', 'n2', 'n3', 'n4']);

    // Path not found with insufficient depth
    const path2 = graph.findPath('n1', 'n4', 2);
    expect(path2).toBeNull();
  });
});
