import { describe, it, expect } from 'vitest';
import { LangGraphResolver } from '../../src/strategy/resolvers/langgraph-resolver.js';

describe('LangGraphResolver', () => {
  const resolver = new LangGraphResolver();

  it('should detect LangGraph usage', () => {
    expect(resolver.detect('import { StateGraph } from "@langchain/langgraph"', 'src/graph.ts')).toBe(true);
    expect(resolver.detect('class Foo {}', 'src/foo.ts')).toBe(false);
  });

  it('should extract graph nodes', () => {
    const content = `
const graph = new StateGraph({ channels: state })
  .addNode("researcher", researcherNode)
  .addNode("writer", writerNode)
  .addEdge("researcher", "writer");
`;
    const nodes = resolver.extractNodes(content, 'src/graph.ts');
    expect(nodes.some((n) => n.name === 'researcher')).toBe(true);
    expect(nodes.some((n) => n.name === 'writer')).toBe(true);
  });

  it('should extract edge relations', () => {
    const content = `
const graph = new StateGraph({ channels: state })
  .addNode("researcher", researcherNode)
  .addNode("writer", writerNode)
  .addEdge("researcher", "writer");
`;
    const nodes = resolver.extractNodes(content, 'src/graph.ts');
    const relations = resolver.extractRelations(content, 'src/graph.ts', nodes);
    expect(relations.some((r) => r.source === 'researcher' && r.target === 'writer')).toBe(true);
  });
});
