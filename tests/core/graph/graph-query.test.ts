import { describe, it, expect } from 'vitest';
import { GraphQuery } from '../../../src/core/graph/graph-query.js';
import { RelationGraph } from '../../../src/core/graph/relation-graph.js';

describe('GraphQuery', () => {
  function buildGraph(): { graph: RelationGraph; query: GraphQuery } {
    const graph = new RelationGraph();
    graph.addNode({ id: 'ctrl', name: 'UserController', type: 'api', filePath: 'src/user.controller.ts', metadata: {} });
    graph.addNode({ id: 'svc', name: 'UserService', type: 'service', filePath: 'src/user.service.ts', metadata: {} });
    graph.addNode({ id: 'repo', name: 'UserRepository', type: 'service', filePath: 'src/user.repository.ts', metadata: {} });
    graph.addEdge({ source: 'ctrl', target: 'svc', type: 'injects', filePath: 'src/user.controller.ts' });
    graph.addEdge({ source: 'svc', target: 'repo', type: 'calls', filePath: 'src/user.service.ts' });

    return { graph, query: new GraphQuery(graph) };
  }

  it('should find call chain from controller to repository', () => {
    const { query } = buildGraph();
    const chain = query.findCallChain('UserController', 'UserRepository');
    expect(chain).toBeDefined();
    expect(chain?.map((n) => n.name)).toEqual(['UserController', 'UserService', 'UserRepository']);
  });

  it('should find dependents of a service', () => {
    const { query } = buildGraph();
    const dependents = query.findDependents('UserService');
    expect(dependents.some((n) => n.name === 'UserController')).toBe(true);
  });

  it('should find dependencies of a service', () => {
    const { query } = buildGraph();
    const deps = query.findDependencies('UserService');
    expect(deps.some((n) => n.name === 'UserRepository')).toBe(true);
  });

  it('should return null for call chain when no path exists', () => {
    const graph = new RelationGraph();
    graph.addNode({ id: 'a', name: 'Alpha', type: 'service', filePath: 'a.ts', metadata: {} });
    graph.addNode({ id: 'b', name: 'Beta', type: 'service', filePath: 'b.ts', metadata: {} });
    const query = new GraphQuery(graph);

    const chain = query.findCallChain('Alpha', 'Beta');
    expect(chain).toBeNull();
  });

  it('should return empty when node name not found', () => {
    const { query } = buildGraph();

    const chain = query.findCallChain('NonExistent', 'UserService');
    expect(chain).toBeNull();

    const dependents = query.findDependents('NonExistent');
    expect(dependents).toEqual([]);

    const deps = query.findDependencies('NonExistent');
    expect(deps).toEqual([]);
  });
});
