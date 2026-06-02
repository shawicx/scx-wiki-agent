import { describe, it, expect } from 'vitest';
import { ReactResolver } from '../../src/strategy/resolvers/react-resolver.js';

describe('ReactResolver', () => {
  const resolver = new ReactResolver();

  it('should detect React components', () => {
    const component = `
import { useState } from 'react';

export function UserCard({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  return <div>{name}</div>;
}
`;
    expect(resolver.detect(component, 'src/UserCard.tsx')).toBe(true);
    expect(resolver.detect('class Foo {}', 'src/foo.ts')).toBe(false);
  });

  it('should extract component nodes', () => {
    const content = `
import { useState, useEffect } from 'react';

export function UserCard({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  return <div>{name}</div>;
}
`;
    const nodes = resolver.extractNodes(content, 'src/UserCard.tsx');
    const comp = nodes.find((n) => n.type === 'component');
    expect(comp).toBeDefined();
    expect(comp?.name).toBe('UserCard');
  });

  it('should identify hooks usage', () => {
    const content = `
import { useState, useEffect } from 'react';

export function UserCard() {
  const [name, setName] = useState('');
  useEffect(() => { console.log(name); }, [name]);
  return <div>{name}</div>;
}
`;
    const nodes = resolver.extractNodes(content, 'src/UserCard.tsx');
    const comp = nodes.find((n) => n.type === 'component');
    expect(comp?.metadata.hooks).toContain('useState');
    expect(comp?.metadata.hooks).toContain('useEffect');
  });

  it('should detect custom hooks', () => {
    const content = `
export function useUser(id: string) {
  const [user, setUser] = useState(null);
  return { user };
}
`;
    const nodes = resolver.extractNodes(content, 'src/useUser.ts');
    const hook = nodes.find((n) => n.metadata.isHook);
    expect(hook).toBeDefined();
    expect(hook?.name).toBe('useUser');
  });
});
