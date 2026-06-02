import { describe, it, expect } from 'vitest';
import { ResolverRegistry } from '../../src/strategy/resolver-registry.js';
import type { FrameworkResolver } from '../../src/strategy/framework-resolver.js';

const mockResolver: FrameworkResolver = {
  name: 'mock',
  detect: (content) => content.includes('@Mock'),
  extractNodes: (content, filePath) => [
    { id: 'n1', name: 'MockService', type: 'service', filePath, startLine: 1, endLine: 10, metadata: {} },
  ],
  extractRelations: () => [],
};

describe('ResolverRegistry', () => {
  it('should find applicable resolvers', () => {
    const registry = new ResolverRegistry();
    registry.register(mockResolver);

    const found = registry.findResolvers('@Mock class Foo {}', 'src/foo.ts');
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('mock');
  });

  it('should return empty when no resolver matches', () => {
    const registry = new ResolverRegistry();
    registry.register(mockResolver);

    const found = registry.findResolvers('class Foo {}', 'src/foo.ts');
    expect(found).toHaveLength(0);
  });

  it('should extract nodes and relations from matching resolvers', () => {
    const registry = new ResolverRegistry();
    registry.register(mockResolver);

    const result = registry.extractAll('@Mock class Foo {}', 'src/foo.ts');
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe('MockService');
  });
});
