import { describe, it, expect } from 'vitest';
import { NestResolver } from '../../src/strategy/resolvers/nest-resolver.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixtureDir = join(process.cwd(), 'tests/fixtures/nestjs-project');

describe('NestResolver', () => {
  const resolver = new NestResolver();

  it('should detect NestJS files', () => {
    const controller = readFileSync(join(fixtureDir, 'src/user.controller.ts'), 'utf-8');
    expect(resolver.detect(controller, 'src/user.controller.ts')).toBe(true);
    expect(resolver.detect('class Foo {}', 'src/foo.ts')).toBe(false);
  });

  it('should extract Controller nodes', () => {
    const content = readFileSync(join(fixtureDir, 'src/user.controller.ts'), 'utf-8');
    const nodes = resolver.extractNodes(content, 'src/user.controller.ts');

    const controller = nodes.find((n) => n.type === 'api');
    expect(controller).toBeDefined();
    expect(controller?.name).toBe('UserController');
    expect(controller?.metadata).toHaveProperty('route', 'users');
  });

  it('should extract Service nodes', () => {
    const content = readFileSync(join(fixtureDir, 'src/user.service.ts'), 'utf-8');
    const nodes = resolver.extractNodes(content, 'src/user.service.ts');

    const service = nodes.find((n) => n.type === 'service');
    expect(service).toBeDefined();
    expect(service?.name).toBe('UserService');
  });

  it('should extract injection relations', () => {
    const content = readFileSync(join(fixtureDir, 'src/user.controller.ts'), 'utf-8');
    const nodes = resolver.extractNodes(content, 'src/user.controller.ts');
    const relations = resolver.extractRelations(content, 'src/user.controller.ts', nodes);

    const injectRel = relations.find((r) => r.type === 'injects');
    expect(injectRel).toBeDefined();
    expect(injectRel?.target).toBe('UserService');
  });
});
