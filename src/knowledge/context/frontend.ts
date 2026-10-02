/**
 * frontend 三页 context（components / state / routing）：Vue/React 组件清单、
 * 状态 store、路由表。正则级确定性提取（SFC + tsx），词法统计被引用度；
 * 各页证据为空 → 返回 null（页面跳过，不产出空壳页）。
 */

import { basename, join } from 'path';
import type { ComponentsContext, StateContext, RoutingContext } from '../types.js';
import { extractVueSfcFacts } from '../channels/vue-sfc.js';
import type { ContextDeps } from './shared.js';
import { readSourceCached } from './shared.js';

const SCAN_FILE_CAP = 500;
const RESULT_CAP = 80;

function isTestFile(rel: string): boolean {
  return /\.test\.|\.spec\.|\/__tests__\//.test(rel);
}

/** 生产源码正文缓存（组件被引用度词法统计用；跳过测试） */
function productionSources(deps: ContextDeps): Array<{ rel: string; src: string }> {
  const out: Array<{ rel: string; src: string }> = [];
  for (const f of deps.scanResult.productionFiles) {
    if (out.length >= SCAN_FILE_CAP) break;
    if (isTestFile(f.relativePath)) continue;
    if (!/\.(?:vue|ts|tsx|js|jsx)$/.test(f.relativePath)) continue;
    const src = readSourceCached(deps, f.relativePath);
    if (src !== null) out.push({ rel: f.relativePath, src });
  }
  return out;
}

function lexicalUseCount(sources: Array<{ rel: string; src: string }>, name: string): number {
  const re = new RegExp(`[/'"]${name}(?:\\.vue)?['"/\`]|\\b${name}\\b`, 'g');
  let count = 0;
  for (const { src } of sources) {
    re.lastIndex = 0;
    if (re.test(src)) count++;
  }
  return count;
}

function hasTestPaired(deps: ContextDeps, base: string): boolean {
  return deps.scanResult.files.some(f =>
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(f.relativePath)
    && basename(f.relativePath).replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/, '') === base);
}

/** defineProps/defineEmits 的声明计数（仅统计顶层声明，payload 字段不计入） */
function declCount(source: string, api: 'defineProps' | 'defineEmits'): number {
  // 类型参数形态：defineProps<{ name: string; age: number }> → 计顶层 key 数
  const typed = source.match(new RegExp(`${api}\\s*<\\s*\\{([\\s\\S]*?)\\}\\s*>`));
  if (typed) {
    const block = typed[1];
    // 调用签名形态（emits 常用）：(e: 'resize', payload: { a: string }) => void
    // → 只数括号内的事件名字符串，payload 类型字段不计入
    if (/^\s*\(/.test(block)) {
      const names = new Set<string>();
      const evRe = /['"`]([^'"`\n]+)['"`]/g;
      let m: RegExpExecArray | null;
      while ((m = evRe.exec(block)) !== null) names.add(m[1]);
      return names.size;
    }
    // 对象形态：只数顶层（括号深度 0）的 key，嵌套 payload 类型字段不计入
    return countTopLevelKeys(block);
  }
  const m = source.match(new RegExp(`${api}(?:<[^>]*>)?\\s*\\(`));
  if (!m) return 0;
  const arg = source.slice(m.index! + m[0].length, m.index! + m[0].length + 2000);
  const arr = arg.match(/^\s*\[([^\]]*)\]/);
  if (arr) return arr[1].split(',').map(s => s.trim().replace(/['"`]/g, '')).filter(Boolean).length;
  const typeBlock = arg.match(/^\s*\{/);
  if (typeBlock) {
    // 对象/接口字段：只数顶层 key（近似，标注于页面说明）
    const body = arg.slice(0, arg.indexOf('}') > 0 ? arg.indexOf('}') : 1500);
    return countTopLevelKeys(body);
  }
  return 0;
}

/** 数块内「顶层」的 `key:` 声明数：进入嵌套 {}/[]/() 括号后的字段不计入 */
function countTopLevelKeys(block: string): number {
  let depth = 0;
  let count = 0;
  let atKeyStart = true;
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === '{' || ch === '[' || ch === '(') { depth++; atKeyStart = depth === 0; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; continue; }
    if (depth !== 0) continue;
    if (ch === '\n') { atKeyStart = true; continue; }
    if (atKeyStart && /[A-Za-z_$]/.test(ch)) {
      // 行首标识符后跟 `:`（可带 `?`）才算 key
      const rest = block.slice(i);
      const km = rest.match(/^[A-Za-z_$][\w$]*\s*\??\s*:/);
      if (km) { count++; i += km[0].length - 1; }
      atKeyStart = false;
    } else if (/\S/.test(ch)) {
      atKeyStart = false;
    }
  }
  return count;
}

export function buildComponentsContext(deps: ContextDeps): ComponentsContext | null {
  const sources = productionSources(deps);
  const components: ComponentsContext['components'] = [];

  for (const { rel, src } of sources) {
    if (components.length >= RESULT_CAP) break;
    const base = basename(rel);
    const name = base.replace(/\.(?:vue|tsx|jsx|ts|js)$/, '');
    if (base.endsWith('.vue')) {
      if (/(?:<template|<script)/.test(src) === false) continue;
      // Vue 走 SFC 权威通道（W1）：@vue/compiler-sfc 结构化提取，事件名级清单；
      // 通道内建正则回落，此处不再需要 declCount 近似
      const facts = extractVueSfcFacts(rel, join(deps.scanResult.rootDir, rel));
      // 内部声明并入 symbol universe（图谱对 .vue 零符号，防真实符号被标待确认）
      if (facts) for (const i of facts.internals) deps.fallbackSymbolNames.add(i.name);
      components.push({
        name, file: rel, framework: 'vue',
        propsCount: facts?.props.length ?? declCount(src, 'defineProps'),
        emitsCount: facts?.emits.length ?? declCount(src, 'defineEmits'),
        usedByCount: 0, testPaired: hasTestPaired(deps, name),
      });
    } else if (/\.(?:tsx|jsx)$/.test(base) && /^[A-Z]/.test(name)) {
      // React 组件：PascalCase 文件（保守，无导出组件签名的工具文件不收）
      const hasComp = /(?:function|const)\s+[A-Z][\w$]*\s*(?:=|\()|export\s+default\s+function\s+[A-Z]/.test(src);
      if (!hasComp) continue;
      components.push({
        name, file: rel, framework: 'react',
        propsCount: src.match(/interface\s+\w*Props\s*\{/) ? declCount(src.replace(/interface\s+\w*Props\s*\{/, 'defineProps({'), 'defineProps') : 0,
        emitsCount: 0,
        usedByCount: 0, testPaired: hasTestPaired(deps, name),
      });
    }
  }

  if (components.length === 0) return null;
  for (const c of components) c.usedByCount = lexicalUseCount(sources, c.name);
  return { components };
}

export function buildStateContext(deps: ContextDeps): StateContext | null {
  const sources = productionSources(deps);
  const stores: StateContext['stores'] = [];

  for (const { rel, src } of sources) {
    if (stores.length >= RESULT_CAP) break;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let hit: { name: string; kind: StateContext['stores'][number]['kind'] } | null = null;
      const pinia = line.match(/defineStore\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (pinia) hit = { name: pinia[1], kind: 'pinia' };
      if (!hit) {
        const slice = line.match(/createSlice\s*\(\s*\{[\s\S]{0,120}?name\s*:\s*['"`]([^'"`]+)['"`]/);
        if (slice) hit = { name: slice[1], kind: 'redux-slice' };
      }
      if (!hit) {
        const zustand = line.match(/export\s+const\s+(use[A-Z]\w*)\s*=\s*create\s*[<(]/);
        if (zustand && /(zustand|create\s*<)/.test(src)) hit = { name: zustand[1], kind: 'zustand' };
      }
      if (!hit) {
        const vuex = line.match(/new\s+(?:Vuex\.)?Store\s*\(/);
        if (vuex) hit = { name: `${basename(rel)}（Vuex root）`, kind: 'vuex' };
      }
      if (!hit) {
        const composable = line.match(/export\s+(?:const|function)\s+(use[A-Z]\w*(?:Store|State))\b/);
        if (composable) hit = { name: composable[1], kind: 'composable' };
      }
      if (hit) {
        const stateRegion = src.slice(Math.max(0, src.indexOf(line)), src.indexOf(line) + 3000);
        const stateKeys = (stateRegion.match(/^\s{2,}[A-Za-z_$][\w$]*\s*[:,]/gm) ?? []).length;
        stores.push({
          name: hit.name, kind: hit.kind, file: rel, line: i + 1,
          stateKeys, consumerCount: 0,
        });
      }
    }
  }

  if (stores.length === 0) return null;
  for (const s of stores) s.consumerCount = lexicalUseCount(sources, s.name);
  return { stores };
}

export function buildRoutingContext(deps: ContextDeps): RoutingContext | null {
  const sources = productionSources(deps);
  const routes: RoutingContext['routes'] = [];

  for (const { rel, src } of sources) {
    if (routes.length >= RESULT_CAP) break;
    const isVueRouter = /['"]vue-router['"]/.test(src);
    const isReactRouter = /['"]react-router(?:-dom)?['"]/.test(src);
    if (!isVueRouter && !isReactRouter) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (routes.length >= RESULT_CAP) break;
      const line = lines[i];
      if (isVueRouter) {
        const path = line.match(/\bpath\s*:\s*['"`]([^'"`]+)['"`]/);
        if (path) {
          const window = lines.slice(i, i + 4).join('\n');
          const comp = window.match(/component\s*:\s*(?:\(\s*\)\s*=>\s*)?(?:import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|([A-Za-z_$][\w$]*))/);
          routes.push({
            path: path[1],
            component: comp ? (comp[1] ?? comp[2]) : '（组件未检出）',
            file: rel, line: i + 1, source: 'vue-router',
          });
        }
      } else {
        const path = line.match(/<Route[^>]*\bpath\s*=\s*['"`]([^'"`]+)['"`]/);
        if (path) {
          const window = lines.slice(i, i + 2).join('\n');
          const comp = window.match(/(?:element\s*=\s*\{<\s*([A-Za-z_$][\w$]*)|component\s*=\s*\{?\s*([A-Za-z_$][\w$]*))/);
          routes.push({
            path: path[1],
            component: comp ? (comp[1] ?? comp[2]) : '（组件未检出）',
            file: rel, line: i + 1, source: 'react-router',
          });
        }
      }
    }
  }

  if (routes.length === 0) return null;
  return { routes };
}
