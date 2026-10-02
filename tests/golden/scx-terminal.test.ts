/**
 * Golden 基准测试：scx-terminal 人工核对过的 ground truth（见同目录 scx-terminal.md）。
 * 仓库不存在时自动 skip（同 integration 测试惯例）。
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanIpcSurface } from '../../src/knowledge/tauri-ipc.js';
import { extractVueSfcFacts } from '../../src/knowledge/channels/vue-sfc.js';
import { FileScanner } from '../../src/core/scanner.js';

const REPO = '/Users/scx/Documents/code/scx-terminal';
const repoReady = existsSync(join(REPO, 'src-tauri', 'tauri.conf.json'));

describe.skipIf(!repoReady)('golden：scx-terminal', () => {
  it('monitor 事件双侧锚点 + history_list 前端调用（tauri-ipc 通道）', () => {
    const scan = new FileScanner(REPO).scan();
    const surface = scanIpcSurface(scan, new Map());

    const expected: Array<[string, number]> = [
      ['monitor-fatal', 127],
      ['monitor-sample', 147],
      ['monitor-unsupported', 156],
      ['monitor-sample-error', 171],
    ];
    for (const [name, line] of expected) {
      const evt = surface.events.find(e => e.name === name);
      expect(evt, `事件 ${name} 缺失`).toBeTruthy();
      expect(evt!.emits[0], `${name} 发射锚点`).toMatchObject({
        file: 'src-tauri/src/monitor/mod.rs',
        line,
        side: 'rust',
      });
      expect(evt!.listeners.length, `${name} 前端监听`).toBeGreaterThan(0);
      expect(evt!.emitMissSuspect, `${name} 不应有口径局限嫌疑`).toBeUndefined();
    }

    const cmd = surface.commands.find(c => c.name === 'history_list');
    expect(cmd?.frontendCalls[0]).toMatchObject({ file: 'src/services/history.ts', line: 33 });
    expect(cmd?.frontendMissSuspect).toBeUndefined();
  });

  it('三组件 emits 事件名级清单（vue-sfc 通道）', () => {
    const cases: Array<[string, string[], string[]]> = [
      ['split/SplitContainer.vue',
        ['leafActivated', 'leafTitle', 'paneClosed', 'leafSplit', 'leafBell', 'treeUpdated'],
        ['node']],
      ['settings/TabGroupFormDialog.vue', ['update:open', 'submit'], []],
      ['sftp/SftpBrowserPane.vue', ['transfer', 'pathChange', 'rowDragstart'], ['side', 'path']],
    ];
    for (const [rel, emits, props] of cases) {
      const facts = extractVueSfcFacts(`src/components/${rel}`, join(REPO, 'src/components', rel));
      expect(facts?.confidence, `${rel} 应走编译器路径`).toBe('exact');
      expect(facts?.emits.map(e => e.name), `${rel} emits`).toEqual(emits);
      expect(facts?.props.map(p => p.name), `${rel} props`).toEqual(props);
    }
  });
});
