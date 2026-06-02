import { describe, it, expect } from 'vitest';
import { VueResolver } from '../../src/strategy/resolvers/vue-resolver.js';

describe('VueResolver', () => {
  const resolver = new VueResolver();

  it('should detect Vue SFC', () => {
    expect(resolver.detect('<template><div>Hello</div></template>\n<script setup lang="ts">', 'src/App.vue')).toBe(true);
    expect(resolver.detect('class Foo {}', 'src/foo.ts')).toBe(false);
  });

  it('should extract component nodes from SFC', () => {
    const content = '<template><div>Hello</div></template>\n<script setup lang="ts">\nimport { ref } from "vue";\n</script>';
    const nodes = resolver.extractNodes(content, 'src/App.vue');
    expect(nodes.some((n) => n.name === 'App' && n.type === 'component')).toBe(true);
  });

  it('should detect composables', () => {
    const content = `import { ref } from 'vue';\nexport function useCounter() {\n  const count = ref(0);\n  return { count };\n}`;
    const nodes = resolver.extractNodes(content, 'src/useCounter.ts');
    expect(nodes.some((n) => n.name === 'useCounter' && n.metadata.isComposable)).toBe(true);
  });
});
