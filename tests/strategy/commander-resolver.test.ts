import { describe, it, expect } from 'vitest';
import { CommanderResolver } from '../../src/strategy/resolvers/commander-resolver.js';

describe('CommanderResolver', () => {
  const resolver = new CommanderResolver();

  it('should detect Commander usage', () => {
    expect(resolver.detect("program.command('init').option('--force')", 'src/cli.ts')).toBe(true);
    expect(resolver.detect('class Foo {}', 'src/foo.ts')).toBe(false);
  });

  it('should extract commands', () => {
    const content = `program.command('init <name>').option('--force', 'Force init')`;
    const nodes = resolver.extractNodes(content, 'src/cli.ts');
    expect(nodes.some((n) => n.name === 'init' && n.type === 'command')).toBe(true);
  });
});
