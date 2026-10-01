import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileScanner } from '../../src/core/scanner.js';
import type { ContextDeps } from '../../src/knowledge/context/shared.js';
import { createDeps } from '../../src/knowledge/context/shared.js';
import {
  buildPublicApiContext,
} from '../../src/knowledge/context/public-api.js';
import { buildRoutesContext } from '../../src/knowledge/context/routes.js';
import {
  buildComponentsContext, buildStateContext, buildRoutingContext,
} from '../../src/knowledge/context/frontend.js';
import {
  buildWorkspacesContext, buildPackageBoundariesContext,
} from '../../src/knowledge/context/workspaces.js';
import { buildDbSchemaContext } from '../../src/knowledge/context/db-schema.js';
import { WikiFallbackBuilder } from '../../src/knowledge/wiki-fallback-builder.js';
import type { CodebaseMemoryClient } from '../../src/mcp/codebase-memory-client.js';
import type { ConfigDetector } from '../../src/knowledge/config-detector.js';

let dir: string;

function write(rel: string, content: string): void {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function makeDeps(scan: ReturnType<FileScanner['scan']>): ContextDeps {
  return createDeps({} as CodebaseMemoryClient, scan, {} as unknown as ConfigDetector);
}

function depsFor(rootDir = dir): ContextDeps {
  return makeDeps(new FileScanner(rootDir).scan());
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tier2-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scanner：library 项目类型判定', () => {
  it('exports 字段 + 无框架依赖 → library', () => {
    const libDir = join(dir, 'lib');
    mkdirSync(join(libDir, 'src'), { recursive: true });
    writeFileSync(join(libDir, 'package.json'), JSON.stringify({
      name: 'my-lib', version: '1.0.0',
      exports: { '.': './src/index.ts' },
      main: 'src/index.ts', types: 'src/index.ts',
    }));
    writeFileSync(join(libDir, 'src', 'index.ts'), 'export const x = 1;\n');
    expect(new FileScanner(libDir).scan().projectType).toBe('library');
  });

  it('有 bin 不判 library；框架依赖优先', () => {
    const cliDir = join(dir, 'cliish');
    mkdirSync(join(cliDir, 'src'), { recursive: true });
    writeFileSync(join(cliDir, 'package.json'), JSON.stringify({
      name: 'c', bin: 'src/main.ts', main: 'dist/index.js', types: 'dist/index.d.ts',
      dependencies: { commander: '^12.0.0' },
    }));
    writeFileSync(join(cliDir, 'src', 'main.ts'), "import { command } from 'commander';\n");
    expect(new FileScanner(cliDir).scan().projectType).toBe('cli');
  });
});

describe('tier2 context：确定性扫描', () => {
  it('public-api：exports 字段 + barrel re-export + 导出符号', () => {
    write('package.json', JSON.stringify({
      name: 'pub', version: '2.1.0',
      exports: { '.': './src/index.ts', './util': './src/util.ts' },
    }));
    write('src/index.ts', "export * from './util';\nexport function main(): void {}\n");
    write('src/util.ts', 'export const helper = 1;\n');
    const ctx = buildPublicApiContext(depsFor());
    expect(ctx).not.toBeNull();
    expect(ctx!.exportsField).toContainEqual({ key: '.', value: './src/index.ts' });
    expect(ctx!.reExports.some(r => r.target === './util' && r.kind === 'star')).toBe(true);
    expect(ctx!.symbols.some(s => s.name === 'main' && s.file === 'src/index.ts')).toBe(true);
    // fallback 渲染
    const page = new WikiFallbackBuilder().buildByName('public-api', ctx);
    expect(page).toContain('# 公共 API');
    expect(page).toContain('| `.` | `./src/index.ts` |');
    expect(page).toContain('export *');
  });

  it('routes：express + nest 路由检出', () => {
    write('server.ts', [
      "import express from 'express';",
      'const app = express();',
      "app.get('/users', listUsers);",
      "app.post('/users', [auth, limiter], createUser);",
    ].join('\n'));
    write('tasks.controller.ts', [
      "@Controller('tasks')",
      'export class TasksController {',
      "  @Get(':id')",
      '  findOne() {}',
      '}',
    ].join('\n'));
    const ctx = buildRoutesContext(depsFor());
    expect(ctx).not.toBeNull();
    const get = ctx!.routes.find(r => r.path === '/users' && r.method === 'GET');
    expect(get?.handler).toBe('listUsers');
    const post = ctx!.routes.find(r => r.path === '/users' && r.method === 'POST');
    expect(post?.middleware).toEqual(['auth', 'limiter']);
    const nest = ctx!.routes.find(r => r.framework === 'nest');
    expect(nest?.path).toBe('/tasks/:id');
    expect(nest?.handler).toContain('TasksController.');
    const page = new WikiFallbackBuilder().buildByName('routes', ctx);
    expect(page).toContain('# HTTP 路由');
    expect(page).toContain('`/users`');
  });

  it('components/state/routing：Vue SFC + pinia + vue-router', () => {
    write('src/ui/UserCard.vue', [
      '<template><div /></template>',
      '<script setup lang="ts">',
      "defineProps<{ name: string; age: number }>()",
      "const emit = defineEmits(['close', 'open'])",
      '</script>',
    ].join('\n'));
    write('src/store/auth.ts', "export const useAuthStore = defineStore('auth', {\n  state: () => ({ token: '', user: null }),\n});\n");
    write('src/router.ts', [
      "import { createRouter } from 'vue-router';",
      'const routes = [',
      "  { path: '/', component: () => import('./ui/UserCard.vue') },",
      '];',
    ].join('\n'));
    const d = depsFor();
    const comp = buildComponentsContext(d);
    expect(comp).not.toBeNull();
    const card = comp!.components.find(c => c.name === 'UserCard');
    expect(card?.framework).toBe('vue');
    expect(card!.propsCount).toBeGreaterThan(0);
    expect(card!.emitsCount).toBe(2);
    const state = buildStateContext(d);
    expect(state).not.toBeNull();
    expect(state!.stores.some(s => s.name === 'auth' && s.kind === 'pinia')).toBe(true);
    const routing = buildRoutingContext(d);
    expect(routing).not.toBeNull();
    expect(routing!.routes.some(r => r.path === '/' && r.component.includes('UserCard'))).toBe(true);
  });

  it('workspaces / package-boundaries：包清单 + 跨包 import + 违规', () => {
    const root = join(dir, 'mono');
    mkdirSync(join(root, 'packages', 'a', 'src'), { recursive: true });
    mkdirSync(join(root, 'packages', 'b', 'src'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root', private: true }));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    writeFileSync(join(root, 'packages', 'a', 'package.json'), JSON.stringify({ name: '@m/a', version: '1.0.0' }));
    writeFileSync(join(root, 'packages', 'b', 'package.json'), JSON.stringify({
      name: '@m/b', version: '0.1.0', dependencies: { '@m/a': 'workspace:*' },
    }));
    // b 声明了 @m/a；a 反向 import b（未声明）→ 违规
    writeFileSync(join(root, 'packages', 'a', 'src', 'index.ts'), "import { x } from '@m/b';\nexport const y = x;\n");
    writeFileSync(join(root, 'packages', 'b', 'src', 'index.ts'), "import { y } from '@m/a';\nexport const x = y;\n");

    const scan = new FileScanner(root).scan();
    const d = makeDeps(scan);
    const ws = buildWorkspacesContext(d);
    expect(ws?.source).toBe('pnpm-workspace.yaml');
    expect(ws!.packages.map(p => p.name).sort()).toEqual(['@m/a', '@m/b']);
    const edges = ws!.edges;
    expect(edges.some(e => e.from === '@m/b' && e.to === '@m/a' && e.declared)).toBe(true);
    expect(edges.some(e => e.from === '@m/a' && e.to === '@m/b' && !e.declared)).toBe(true);
    const bounds = buildPackageBoundariesContext(d);
    expect(bounds!.violations).toContainEqual(expect.objectContaining({ from: '@m/a', to: '@m/b' }));
    const page = new WikiFallbackBuilder().buildByName('package-boundaries', bounds);
    expect(page).toContain('# 包间边界');
    expect(page).toContain('❌ 未声明');
  });

  it('db-schema：prisma + sql 模型解析', () => {
    write('prisma/schema.prisma', [
      'model User {',
      '  id    Int    @id @default(autoincrement())',
      '  email String @unique',
      '}',
    ].join('\n'));
    write('migrations/001.sql', [
      'CREATE TABLE posts (',
      '  id INTEGER PRIMARY KEY,',
      '  title TEXT NOT NULL',
      ');',
    ].join('\n'));
    const ctx = buildDbSchemaContext(depsFor());
    expect(ctx).not.toBeNull();
    const user = ctx!.models.find(m => m.name === 'User');
    expect(user?.kind).toBe('prisma');
    expect(user!.fields.map(f => f.name)).toEqual(['id', 'email']);
    const posts = ctx!.models.find(m => m.name === 'posts');
    expect(posts?.kind).toBe('sql');
    expect(posts!.fields.length).toBe(2);
    const page = new WikiFallbackBuilder().buildByName('db-schema', ctx);
    expect(page).toContain('# 数据模型');
    expect(page).toContain('User（prisma）');
  });

  it('无证据时返回 null（页面跳过而非空壳）', () => {
    const empty = mkdtempSync(join(tmpdir(), 'tier2-empty-'));
    try {
      writeFileSync(join(empty, 'package.json'), JSON.stringify({ name: 'e' }));
      writeFileSync(join(empty, 'a.ts'), 'export const q = 1;\n');
      const scan = new FileScanner(empty).scan();
      const d = makeDeps(scan);
      expect(buildRoutesContext(d)).toBeNull();
      expect(buildComponentsContext(d)).toBeNull();
      expect(buildStateContext(d)).toBeNull();
      expect(buildRoutingContext(d)).toBeNull();
      expect(buildWorkspacesContext(d)).toBeNull();
      expect(buildDbSchemaContext(d)).toBeNull();
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
