/** 本批确定性修复的针对性单测：state 计数口径、Cargo 内联表、表格行修复、填充降级。 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileScanner } from '../../src/core/scanner.js';
import { createDeps } from '../../src/knowledge/context/shared.js';
import { buildStateContext } from '../../src/knowledge/context/frontend.js';
import { collectRustDeps } from '../../src/knowledge/context/tech-stack.js';
import { repairBrokenTableRows, stripFillerCells } from '../../src/knowledge/wiki-output-sanitizer.js';
import type { CodebaseMemoryClient } from '../../src/mcp/codebase-memory-client.js';
import type { ConfigDetector } from '../../src/knowledge/config-detector.js';
import type { ContextDeps } from '../../src/knowledge/context/shared.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'detfix-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function makeDeps(rootDir: string): ContextDeps {
  return createDeps(
    {} as CodebaseMemoryClient,
    new FileScanner(rootDir).scan(),
    {} as unknown as ConfigDetector,
  );
}

describe('state 计数口径（fix 6）', () => {
  it('pinia：stateKeys 只数 state 工厂对象顶层键（actions/getters/嵌套键不计入）', () => {
    const root = join(dir, 'state');
    mkdirSync(join(root, 'src', 'stores'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.0' }));
    writeFileSync(join(root, 'src', 'stores', 'tabs.ts'), `import { defineStore } from 'pinia';
export const useTabsStore = defineStore('tabs', {
    state: () => ({
        tabs: [] as Tab[],
        activeId: null as string | null,
        recentIds: [] as string[],
        alerts: {} as Record<string, { nested: true }>,
    }),
    getters: {
        activeTab(state) { return state.tabs.find(t => t.id === state.activeId) },
    },
    actions: {
        close(id: string) { this.tabs = this.tabs.filter(t => t.id !== id) },
    },
});
`);
    // 两个真实消费文件 + 一个只含裸词 'tabs' 的文件（不该计入）
    writeFileSync(join(root, 'src', 'a.ts'), "import { useTabsStore } from './stores/tabs';\nconst s = useTabsStore();\n");
    writeFileSync(join(root, 'src', 'b.vue'), "<script setup>\nconst store = useTabsStore()\n</script>\n");
    writeFileSync(join(root, 'src', 'c.ts'), "export const label = 'tabs 及其它 UI 文本';\n");

    const state = buildStateContext(makeDeps(root));
    const tabs = state?.stores.find(s => s.name === 'tabs');
    expect(tabs).toBeDefined();
    expect(tabs!.stateKeys).toBe(4);
    expect(tabs!.consumerCount).toBe(2);
  });

  it('pinia setup 式：stateKeys 数 ref/reactive/computed 声明', () => {
    const root = join(dir, 'setup');
    mkdirSync(join(root, 'src', 'stores'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '0.0.0' }));
    writeFileSync(join(root, 'src', 'stores', 'theme.ts'), `import { defineStore } from 'pinia';
import { ref } from 'vue';
export const useThemeStore = defineStore('theme', () => {
    const isDark = ref(true);
    const epoch = ref(0);
    function apply(): void { epoch.value++; }
    const notState = document.title;
    return { isDark, epoch, apply };
});
`);
    const state = buildStateContext(makeDeps(root));
    const theme = state?.stores.find(s => s.name === 'theme');
    expect(theme).toBeDefined();
    expect(theme!.stateKeys).toBe(2);
  });
});

describe('Cargo.toml 内联表依赖（fix 7）', () => {
  it('`name = { version = "…" }` 形态不再漏（tauri/serde 等）', () => {
    const root = join(dir, 'rust');
    mkdirSync(join(root, 'src-tauri', 'src'), { recursive: true });
    writeFileSync(join(root, 'src-tauri', 'Cargo.toml'), `[dependencies]
tauri = { version = "2", features = ["devtools"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["rt"] }
`);
    writeFileSync(join(root, 'src-tauri', 'src', 'main.rs'), 'use tauri::Manager;\nfn main() { serde_json::json!({}); }\n');

    const deps = makeDeps(root);
    const got = new Map(collectRustDeps(deps).map(d => [d.name, d]));
    expect([...got.keys()].sort()).toEqual(['serde', 'serde_json', 'tauri', 'tokio']);
    expect(got.get('tauri')).toMatchObject({ version: '2', used: true });
    expect(got.get('serde')).toMatchObject({ version: '1', used: false });
    expect(got.get('serde_json')).toMatchObject({ version: '1', used: true });
  });
});

describe('LLM 输出确定性修复（fix 4b / fix 8）', () => {
  it('断裂表格行：残行 + 延续段合并为完整行', () => {
    const broken = `| 命令 | 前端调用点 | Rust 定义 | 状态 |
|---|---|---|---|
| \`sftp_open\` |

\`src/services/sftp.ts:50\` | \`src-tauri/src/sftp.rs:108\` | 双向匹配 |
| \`sftp_read_dir\` | a | b | ok |
`;
    const fixed = repairBrokenTableRows(broken);
    expect(fixed).toContain('| `sftp_open` | `src/services/sftp.ts:50` | `src-tauri/src/sftp.rs:108` | 双向匹配 |');
    expect(fixed).toContain('| `sftp_read_dir` | a | b | ok |');
  });

  it('普通段落不合并：残行后是非表格文本时保持原样', () => {
    const text = '| only |\n\n普通段落，没有竖线。\n';
    expect(repairBrokenTableRows(text)).toBe(text);
  });

  it('「数据未提供（…）」填充单元格确定性降级为 —', () => {
    expect(stripFillerCells('| components | 72 | 数据未提供（0） |')).toBe('| components | 72 | — |');
    expect(stripFillerCells('正文里的数据未提供（略）同样降级')).toBe('正文里的—同样降级');
    expect(stripFillerCells('未检出 / 无证据措辞不受影响')).toBe('未检出 / 无证据措辞不受影响');
  });
});

describe('vue-sfc props 编译器口径（fix 5）', () => {
  it('跨行/嵌套类型块的 props 不漏键（旧正则口径实测 7→2）', async () => {
    const { extractVueSfcFacts } = await import('../../src/knowledge/channels/vue-sfc.js');
    const root = join(dir, 'vue');
    mkdirSync(join(root, 'src'), { recursive: true });
    const rel = 'src/Pane.vue';
    const abs = join(root, rel);
    writeFileSync(abs, `<script setup lang="ts">
const props = defineProps<{
    side: 'local' | 'remote'
    homePath: () => string
    ops: {
        mkdir: (path: string) => Promise<void>
        lister: (dir: string) => Promise<FileInfo[]>
    }
    disabled?: boolean
}>()
</script>
<template><div /></template>
`);
    const facts = extractVueSfcFacts(rel, abs);
    expect(facts?.confidence).toBe('exact');
    expect(facts?.props.map(p => p.name)).toEqual(['side', 'homePath', 'ops', 'disabled']);
  });
});
