import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { isTauriProject, scanIpcSurface } from '../../src/knowledge/tauri-ipc.js';
import type { ScanResult } from '../../src/core/scanner.js';
import { isTestPath } from '../../src/shared/utils.js';

describe('tauri-ipc', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tauri-ipc-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function makeScanResult(rels: string[]): ScanResult {
    const files = rels.map(rel => ({
      absolutePath: join(tmp, rel),
      relativePath: rel,
      language: 'typescript' as const,
      extension: rel.endsWith('.rs') ? '.rs' : rel.endsWith('.vue') ? '.vue' : '.ts',
      size: 100,
      scope: isTestPath(rel) ? 'test' as const : 'production' as const,
    }));
    const productionFiles = files.filter(f => f.scope === 'production');
    const testFiles = files.filter(f => f.scope === 'test');
    return {
      rootDir: tmp,
      files,
      techStack: [],
      testTechStack: [],
      projectType: 'unknown',
      hasTypeScript: true,
      sourceDirs: [],
      productionFiles,
      testFiles,
      fileCounts: {
        total: files.length,
        production: productionFiles.length,
        test: testFiles.length,
      },
    };
  }

  it('isTauriProject 按 src-tauri/tauri.conf.json 判定', () => {
    expect(isTauriProject(tmp)).toBe(false);
    mkdirSync(join(tmp, 'src-tauri'), { recursive: true });
    writeFileSync(join(tmp, 'src-tauri', 'tauri.conf.json'), '{}');
    expect(isTauriProject(tmp)).toBe(true);
  });

  it('提取 ts/vue 的 invoke/listen/emit 与 Rust 命令，camelCase↔snake_case 归并，孤儿标注', () => {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    mkdirSync(join(tmp, 'src-tauri', 'src'), { recursive: true });

    // 前端：camelCase 命令 + 泛型 invoke + 事件
    writeFileSync(join(tmp, 'src', 'store.ts'), [
      "import { invoke } from '@tauri-apps/api/core'",
      "import { listen, emit } from '@tauri-apps/api/event'",
      '',
      'export async function reload() {',
      "  await invoke('list_ssh_hosts')",
      "  const h = await invoke<Host[]>('getActiveSession')",
      "  await emit('session-closed', h)",
      '}',
      "listen('pty-exit', () => {})",
    ].join('\n'));
    // Vue SFC 内的调用
    writeFileSync(join(tmp, 'src', 'Pane.vue'), [
      '<script setup lang="ts">',
      "const save = () => invoke('saveTabLayout')",
      '</script>',
    ].join('\n'));
    // Rust：命令（含 attribute 参数与文档行）+ 事件发射
    writeFileSync(join(tmp, 'src-tauri', 'src', 'cmd.rs'), [
      '#[tauri::command]',
      'pub fn list_ssh_hosts() -> Vec<Host> { vec![] }',
      '',
      '/// 文档行应被跳过',
      '#[tauri::command(rename_all = "snake_case")]',
      'pub async fn get_active_session() -> Result<Host, Error> { todo!() }',
      '',
      '#[tauri::command]',
      'pub fn orphan_rust_cmd() {}',
      '',
      'app.emit("pty-exit", payload)?;',
    ].join('\n'));

    const surface = scanIpcSurface(makeScanResult([
      'src/store.ts', 'src/Pane.vue', 'src-tauri/src/cmd.rs',
    ]), new Map());

    const byName = new Map(surface.commands.map(c => [c.name, c]));
    // camelCase 前端名归并到 snake_case Rust 名（Rust 名优先展示）
    expect(byName.get('list_ssh_hosts')).toMatchObject({
      rustDef: { file: 'src-tauri/src/cmd.rs', line: 2 },
    });
    expect(byName.get('list_ssh_hosts')?.frontendCalls[0]).toMatchObject({ file: 'src/store.ts', line: 5 });
    expect(byName.get('get_active_session')).toBeTruthy(); // getActiveSession 归并成功
    expect(byName.get('get_active_session')?.frontendCalls[0]?.line).toBe(6);
    expect(byName.get('saveTabLayout')).toMatchObject({ rustDef: null }); // 仅前端 → 孤儿
    expect(byName.get('orphan_rust_cmd')).toMatchObject({ rustDef: { line: 9 } }); // 仅 Rust → 孤儿
    expect(byName.get('orphan_rust_cmd')?.frontendCalls).toHaveLength(0);

    const evtByName = new Map(surface.events.map(e => [e.name, e]));
    expect(evtByName.get('pty-exit')?.listeners[0]?.file).toBe('src/store.ts');
    expect(evtByName.get('pty-exit')?.emits.some(e => e.side === 'rust')).toBe(true);
    expect(evtByName.get('session-closed')?.emits[0]).toMatchObject({ side: 'frontend' });
  });

  it('src-tauri 内的 ts 文件不算前端侧，src-tauri 外的 rs 不算 Rust 侧', () => {
    mkdirSync(join(tmp, 'src-tauri', 'ui'), { recursive: true });
    writeFileSync(join(tmp, 'src-tauri', 'ui', 'embed.ts'), "invoke('embedded')\n");
    writeFileSync(join(tmp, 'standalone.rs'), '#[tauri::command]\nfn not_app() {}\n');

    const surface = scanIpcSurface(makeScanResult(['src-tauri/ui/embed.ts', 'standalone.rs']), new Map());
    expect(surface.commands).toHaveLength(0);
  });

  it('未 import tauri event API 的文件，其 Vue 组件 emit/listen 不算 IPC 事件', () => {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    // 无 @tauri-apps/api/event import：纯 Vue 组件事件，应被过滤
    writeFileSync(join(tmp, 'src', 'Widget.vue'), [
      '<script setup lang="ts">',
      "const emit = defineEmits(['update:modelValue'])",
      "emit('update:modelValue', v)",
      '</script>',
    ].join('\n'));

    let surface = scanIpcSurface(makeScanResult(['src/Widget.vue']), new Map());
    expect(surface.events).toHaveLength(0);

    // 有 tauri event import：真实 IPC 事件被采集
    writeFileSync(join(tmp, 'src', 'bus.ts'), [
      "import { listen } from '@tauri-apps/api/event'",
      "listen('pty-exit', () => {})",
    ].join('\n'));
    surface = scanIpcSurface(makeScanResult(['src/Widget.vue', 'src/bus.ts']), new Map());
    expect(surface.events.map(e => e.name)).toEqual(['pty-exit']);
  });

  it('多行 app.emit 调用（Rust 惯用形态）能命中发射点，行号指向事件名所在行', () => {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    mkdirSync(join(tmp, 'src-tauri', 'src'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'bus.ts'), "import { listen } from '@tauri-apps/api/event'\nlisten('monitor-fatal', () => {})\n");
    writeFileSync(join(tmp, 'src-tauri', 'src', 'monitor.rs'), [
      'let _ = app.emit(',
      '    "monitor-fatal",',
      '    MonitorEvent { message: "x".into() },',
      ');',
    ].join('\n'));

    const surface = scanIpcSurface(makeScanResult(['src/bus.ts', 'src-tauri/src/monitor.rs']), new Map());
    const evt = surface.events.find(e => e.name === 'monitor-fatal');
    expect(evt).toBeTruthy();
    expect(evt?.emits).toHaveLength(1);
    expect(evt?.emits[0]).toMatchObject({ file: 'src-tauri/src/monitor.rs', line: 2, side: 'rust' });
    expect(evt?.emitMissSuspect).toBeUndefined(); // 已命中，无需二次检索
  });

  it('嵌套泛型 invoke（invoke<Array<{…}>>）能命中命令名，行号精确', () => {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'history.ts'), [
      "import { invoke } from '@tauri-apps/api/core'",
      'export async function load() {',
      "  const entries = await invoke<Array<{ source: string, runAt: number }>>('history_list', { limit: 10 })",
      '  return entries',
      '}',
    ].join('\n'));

    const surface = scanIpcSurface(makeScanResult(['src/history.ts']), new Map());
    const cmd = surface.commands.find(c => c.name === 'history_list');
    expect(cmd).toBeTruthy();
    expect(cmd?.frontendCalls[0]).toMatchObject({ file: 'src/history.ts', line: 3 });
    // 已命中调用，不产生口径局限嫌疑
    expect(cmd?.frontendMissSuspect).toBeUndefined();
  });

  it('负面断言二次验证：空侧裸检索命中时标记 missSuspect，不再断言不存在', () => {
    mkdirSync(join(tmp, 'src'), { recursive: true });
    mkdirSync(join(tmp, 'src-tauri', 'src'), { recursive: true });
    // 动态命令名（扫描盲区）：invoke(变量) 形态，正则抓不到字面量
    writeFileSync(join(tmp, 'src', 'dyn.ts'), [
      "import { invoke } from '@tauri-apps/api/core'",
      "import { listen } from '@tauri-apps/api/event'",
      "const cmd = 'history_list'",
      'await invoke(cmd)',
      "listen('monitor-sample', () => {})",
    ].join('\n'));
    writeFileSync(join(tmp, 'src-tauri', 'src', 'cmd.rs'), [
      '#[tauri::command]',
      'pub fn history_list() -> Vec<()> { vec![] }',
    ].join('\n'));

    const surface = scanIpcSurface(makeScanResult(['src/dyn.ts', 'src-tauri/src/cmd.rs']), new Map());
    const cmd = surface.commands.find(c => c.name === 'history_list');
    expect(cmd?.frontendCalls).toHaveLength(0); // 正则未命中
    expect(cmd?.frontendMissSuspect?.[0]).toMatchObject({ file: 'src/dyn.ts' }); // 裸检索兜底命中
    const evt = surface.events.find(e => e.name === 'monitor-sample');
    expect(evt?.emits).toHaveLength(0);
    expect(evt?.emitMissSuspect).toBeUndefined(); // 全仓确无发射，可如实断言
  });
});
