/** Tier-2 surface 页 Context 类型（按项目类型动态激活的页面）。 */

import type { IntentEvidence } from '../intent-evidence.js';

/** public-api 页（library）：exports 字段 + 入口 re-export 链 + 导出符号 */
export interface PublicApiContext {
  packageName: string;
  version: string;
  /** package.json exports 字段展开（key → value 串） */
  exportsField: Array<{ key: string; value: string }>;
  /** main/module/types/bin 入口声明 */
  entryDecls: Array<{ key: string; value: string }>;
  /** 入口 barrel 的 re-export（export * / export {..} from） */
  reExports: Array<{ barrel: string; target: string; kind: 'star' | 'named'; line: number }>;
  /** 导出符号（barrel 与入口文件源码正则提取，带锚点） */
  symbols: Array<{ name: string; kind: string; file: string; line: number }>;
  intent?: IntentEvidence[];
}

/** routes 页（backend）：HTTP 路由表 */
export interface RoutesContext {
  routes: Array<{
    method: string;
    path: string;
    handler: string;
    file: string;
    line: number;
    framework: 'express' | 'nest' | 'fastify' | 'hono';
    middleware: string[];
  }>;
  intent?: IntentEvidence[];
}

/** components 页（frontend）：组件清单 */
export interface ComponentsContext {
  components: Array<{
    name: string;
    file: string;
    framework: 'vue' | 'react';
    /** props/emits 声明数（正则计数；0 = 未检出声明） */
    propsCount: number;
    emitsCount: number;
    /** 被其他生产文件 import 的次数（词法计数） */
    usedByCount: number;
    /** 存在同 basename 的 .test/.spec 文件 */
    testPaired: boolean;
  }>;
  intent?: IntentEvidence[];
}

/** state 页（frontend）：状态管理 store 清单 */
export interface StateContext {
  stores: Array<{
    name: string;
    kind: 'pinia' | 'vuex' | 'redux-slice' | 'zustand' | 'composable';
    file: string;
    line: number;
    /** state 字段数（正则计数；0 = 未检出） */
    stateKeys: number;
    /** 引用该 store 的生产文件数 */
    consumerCount: number;
  }>;
  intent?: IntentEvidence[];
}

/** routing 页（frontend）：path → 组件 表 */
export interface RoutingContext {
  routes: Array<{
    path: string;
    component: string;
    file: string;
    line: number;
    source: 'vue-router' | 'react-router';
  }>;
  intent?: IntentEvidence[];
}

/** workspaces 页（monorepo）：workspace 包清单 */
export interface WorkspacesContext {
  /** workspace 声明来源（pnpm-workspace.yaml / turbo.json / lerna.json / package.json workspaces） */
  source: string;
  packages: Array<{ name: string; version: string; dir: string; isPrivate: boolean }>;
  /** 包间依赖边（import 聚合） */
  edges: Array<{ from: string; to: string; importCount: number; declared: boolean }>;
}

/** package-boundaries 页（monorepo）：包间依赖边界与违规 */
export interface PackageBoundariesContext {
  edges: Array<{ from: string; to: string; importCount: number; declared: boolean }>;
  packages: Array<{ name: string; dir: string }>;
  /** import 了 workspace 兄弟包但目标 package.json 未声明依赖 */
  violations: Array<{ from: string; to: string; importFiles: string[] }>;
}

/** db-schema 页（backend）：数据模型 */
export interface DbSchemaContext {
  /** ORM/schema 检出类型（多 ORM 并存时逐个列出） */
  detectedKinds: string[];
  models: Array<{
    name: string;
    kind: 'prisma' | 'typeorm' | 'drizzle' | 'sql';
    file: string;
    line: number;
    fields: Array<{ name: string; type: string; attrs: string }>;
  }>;
  intent?: IntentEvidence[];
}
