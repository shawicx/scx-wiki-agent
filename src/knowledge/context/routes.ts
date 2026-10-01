/**
 * routes 页 context（backend）：HTTP 路由表正则扫描（Express/Nest/Fastify/Hono）。
 * 沿用 tauri-ipc.ts 的确定性扫描模式：只认字面量路径与具名 handler，
 * 动态注册（变量路径）不编造；0 条 → null（页面跳过）。
 */

import type { RoutesContext } from '../types.js';
import type { ContextDeps } from './shared.js';
import { readSourceCached } from './shared.js';

type RouteRow = RoutesContext['routes'][number];

const HTTP_METHODS = 'get|post|put|patch|delete|all|head|options';
/** Express/Fastify/Hono 风格：app.get('/path', [mw], handler) */
const RE_METHOD_CALL = new RegExp(
  `\\b(?:app|router|server|fastify|api)\\s*\\.\\s*(${HTTP_METHODS})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`],?([^)]*)`,
  'g',
);
/** Fastify route 对象：{ method: 'GET', url: '/x', handler } */
const RE_FASTIFY_URL = /url\s*:\s*['"`]([^'"`]+)['"`]/;
const RE_FASTIFY_METHOD = /method\s*:\s*['"`]([A-Za-z]+)['"`]/;
/** Nest 装饰器：@Controller('base') / @Get('sub') */
const RE_NEST_CONTROLLER = /@Controller\s*\(\s*['"`]?([^'"`)]*)['"`]?\s*\)/;
const RE_NEST_HANDLER = new RegExp(`@(${HTTP_METHODS})\\s*\\(\\s*['"\`]?([^'"\`)]*)['"\`]?\\s*\\)`, 'i');

function parseMethodCall(rel: string, framework: RouteRow['framework'], line: string, lineNo: number, out: RouteRow[]): void {
  for (const m of line.matchAll(RE_METHOD_CALL)) {
    const method = m[1].toUpperCase();
    const path = m[2];
    const rest = m[3] ?? '';
    // 中间件括号数组：[auth, rateLimit]，最后一个标识符才是 handler
    const mwMatch = rest.match(/^\s*\[([^\]]*)\]/);
    const middleware = mwMatch
      ? mwMatch[1].split(',').map(s => s.trim()).filter(s => /^[A-Za-z_$][\w$.]*$/.test(s))
      : [];
    const afterMw = mwMatch ? rest.slice(mwMatch[0].length) : rest;
    const handlerMatch = afterMw.match(/^\s*,?\s*([A-Za-z_$][\w$]*)/);
    const handler = handlerMatch ? handlerMatch[1] : '（内联 handler）';
    if (out.length < 200) {
      out.push({ method, path, handler, file: rel, line: lineNo, framework, middleware });
    }
  }
}

function scanExpressLike(rel: string, source: string, out: RouteRow[]): void {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    parseMethodCall(rel, /fastify|\.route\s*\(/.test(source) ? 'fastify' : 'express', lines[i], i + 1, out);
  }
  // fastify.route({ method, url }) / app.route 对象形态
  if (/\.route\s*\(\s*\{/.test(source)) {
    const lines2 = source.split('\n');
    for (let i = 0; i + 1 < lines2.length; i++) {
      const window = lines2.slice(i, i + 6).join('\n');
      const url = window.match(RE_FASTIFY_URL);
      const method = window.match(RE_FASTIFY_METHOD);
      if (url && method && out.length < 200) {
        out.push({
          method: method[1].toUpperCase(), path: url[1], handler: '（对象 handler）',
          file: rel, line: i + 1, framework: 'fastify', middleware: [],
        });
        i += 5;
      }
    }
  }
}

function scanNest(rel: string, source: string, out: RouteRow[]): void {
  const lines = source.split('\n');
  let controllerBase = '';
  let controllerName = '';
  for (let i = 0; i < lines.length; i++) {
    const ctl = lines[i].match(RE_NEST_CONTROLLER);
    if (ctl) {
      controllerBase = ctl[1] ? `/${ctl[1].replace(/^\//, '')}` : '';
      const cls = lines.slice(i + 1, i + 4).join('\n').match(/class\s+([A-Za-z_$][\w$]*)/);
      controllerName = cls ? cls[1] : '';
      continue;
    }
    const h = lines[i].match(RE_NEST_HANDLER);
    if (h && controllerName) {
      const sub = h[2] ? `/${h[2].replace(/^\//, '')}` : '';
      const fn = lines.slice(i + 1, i + 4).join('\n').match(/(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/);
      if (out.length < 200) {
        out.push({
          method: h[1] === 'all' ? 'ALL' : h[1].toUpperCase(),
          path: `${controllerBase}${sub}` || '/',
          handler: fn ? `${controllerName}.${fn[1]}` : `${controllerName}.（方法名未检出）`,
          file: rel, line: i + 1, framework: 'nest', middleware: [],
        });
      }
    }
  }
}

/** Python decorator 注册：FastAPI/Flask 风格 @app.get('/x') / @router.post('/x') */
function scanPythonDecorators(rel: string, source: string, out: RouteRow[]): void {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const d = lines[i].match(/@(?:[\w.]*)(?:app|router|api|blueprint|bp)[\w.]*\.(get|post|put|patch|delete|head|options)\(\s*['"\`]([^'"\`]+)['"\`]/i);
    if (!d) continue;
    const fn = lines.slice(i + 1, i + 4).join('\n').match(/def\s+([A-Za-z_]\w*)/);
    if (out.length < 200) {
      out.push({
        method: d[1].toUpperCase(), path: d[2],
        handler: fn ? fn[1] : '（handler 未检出）',
        file: rel, line: i + 1, framework: 'fastapi',
        middleware: [],
      });
    }
  }
}

/** Go HTTP 注册：gin/echo 风格 r.GET("/path", handler) / router.POST(...) */
function scanGoHttp(rel: string, source: string, out: RouteRow[]): void {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\b\w+\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Any)\s*\(\s*"([^"]+)"\s*,?\s*([A-Za-z_]\w*)?/g)) {
      if (out.length >= 200) return;
      out.push({
        method: m[1] === 'Any' ? 'ALL' : m[1].toUpperCase(),
        path: m[2],
        handler: m[3] ?? '（内联 handler）',
        file: rel, line: i + 1, framework: 'go-http',
        middleware: [],
      });
    }
  }
}

function scanHono(rel: string, source: string, out: RouteRow[]): void {
  // app.on('GET', '/x', handler) 形态
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\.on\s*\(\s*['"`]([A-Za-z]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*,?\s*([A-Za-z_$][\w$]*)?/g)) {
      if (out.length < 200) {
        out.push({
          method: m[1].toUpperCase(), path: m[2],
          handler: m[3] ?? '（内联 handler）', file: rel, line: i + 1, framework: 'hono', middleware: [],
        });
      }
    }
  }
}

export function buildRoutesContext(deps: ContextDeps): RoutesContext | null {
  const routes: RouteRow[] = [];
  const files = deps.scanResult.productionFiles
    .filter(f => /\.(?:ts|js|mjs|cjs|tsx|py|go)$/.test(f.relativePath))
    .filter(f => !/\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$/.test(f.relativePath));

  for (const f of files) {
    const src = readSourceCached(deps, f.relativePath);
    if (src === null) continue;
    const rel = f.relativePath;
    if (/@Controller\s*\(/.test(src)) scanNest(rel, src, routes);
    if (/\.(?:py)$/.test(rel) && /@(?:app|router|api|blueprint|bp)[\w.]*\.(?:get|post|put|patch|delete)\(/i.test(src)) {
      scanPythonDecorators(rel, src, routes);
    }
    if (/\.go$/.test(rel) && /\b\w+\.(?:GET|POST|PUT|PATCH|DELETE)\s*\(/.test(src)) {
      scanGoHttp(rel, src, routes);
    }
    if (/\bexpress\b|from\s+['"]express['"]/.test(src)) scanExpressLike(rel, src, routes);
    if (/fastify/.test(src) && !/from\s+['"]express['"]/.test(src)) scanExpressLike(rel, src, routes);
    if (/from\s+['"]hono/.test(src)) scanHono(rel, src, routes);
    if (/\.route\s*\(\s*\{/.test(src)) scanExpressLike(rel, src, routes);
  }

  if (routes.length === 0) return null;
  return { routes };
}
