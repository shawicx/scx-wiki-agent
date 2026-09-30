/**
 * Tauri IPC 接口面扫描（desktop 项目真正的 API）。
 *
 * 图谱的 CALLS 边不覆盖 IPC 边界（前端字符串命令 ↔ Rust 宏命令），api 页在
 * Tauri 项目只能拿到字母切片。本模块以正则对表两侧：
 * 前端 `invoke('cmd')` / `listen('evt')` / `emit('evt')`，
 * Rust `#[tauri::command] fn` / `emit('evt')`，camelCase 与 snake_case 双向归并
 * （Tauri v2 惯例：JS 侧 camelCase 自动映射 Rust 侧 snake_case）。
 *
 * 已知局限（诚实缺失，不补造）：`invoke(变量)` 动态命令名、深嵌套泛型失配。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ScanResult } from '../core/scanner.js';
import { isTestPath, languageDomainOf } from '../shared/utils.js';
import type { SourceCache } from './source-fallback.js';
import type { IpcCommand, IpcEvent, IpcRef, IpcSurface } from './types.js';

/** Tauri 项目判定：src-tauri/tauri.conf.json 存在 */
export function isTauriProject(rootDir: string): boolean {
  return existsSync(join(rootDir, 'src-tauri', 'tauri.conf.json'));
}

/** 归一化命令/事件名（camelCase → snake_case）作双侧匹配键 */
function ipcKey(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

const INVOKE_RE = /\binvoke(?:\s*<[^>(]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g;
const LISTEN_RE = /\blisten(?:\s*<[^>(]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g;
const EMIT_RE = /\bemit\s*\(\s*['"`]([^'"`]+)['"`]/g;
const EMIT_TO_RE = /\.emit_to\s*\(\s*[^,]+,\s*['"`]([^'"`]+)['"`]/g;
const RUST_CMD_ATTR_RE = /^#\[\s*tauri::command/;
const RUST_FN_RE = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/;

/** 全仓扫描 IPC 面：命令对表 + 事件对表（双侧名都展示，仅一侧存在为孤儿） */
export function scanIpcSurface(scanResult: ScanResult, cache: SourceCache): IpcSurface {
  const commands = new Map<string, IpcCommand>();
  const events = new Map<string, IpcEvent>();

  const commandOf = (name: string): IpcCommand => {
    const key = ipcKey(name);
    let cmd = commands.get(key);
    if (!cmd) {
      cmd = { name, frontendCalls: [], rustDef: null };
      commands.set(key, cmd);
    }
    return cmd;
  };
  const eventOf = (name: string): IpcEvent => {
    const key = ipcKey(name);
    let evt = events.get(key);
    if (!evt) {
      evt = { name, listeners: [], emits: [] };
      events.set(key, evt);
    }
    return evt;
  };
  const refOf = (rel: string, line: number): IpcRef => ({ file: rel, line });

  const readLines = (absolutePath: string, rel: string): string[] | null => {
    if (cache.has(absolutePath)) {
      const src = cache.get(absolutePath);
      return src === null || src === undefined ? null : src.split('\n');
    }
    let lines: string[] | null;
    try {
      lines = readFileSync(absolutePath, 'utf-8').split('\n');
    } catch {
      lines = null;
    }
    cache.set(absolutePath, lines === null ? null : lines.join('\n'));
    return lines;
  };

  for (const file of scanResult.productionFiles) {
    const domain = languageDomainOf(file.relativePath);
    if (domain === null || isTestPath(file.relativePath)) continue;
    const isRust = domain === 'rust';
    const inSrcTauri = file.relativePath.startsWith('src-tauri/');
    if (isRust !== inSrcTauri) continue; // rust 只认 src-tauri 内，前端只认 src-tauri 外

    const lines = readLines(file.absolutePath, file.relativePath);
    if (lines === null) continue;

    if (isRust) {
      // #[tauri::command] 状态机：跳过后续 attribute/# 行与 /// 文档行（≤30 行），在 fn 行收名
      let pendingAttr = -1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (pendingAttr >= 0) {
          const t = line.trim();
          const attrish = t.startsWith('#') || t.startsWith('///') || t === '';
          if (attrish && i - pendingAttr <= 30) continue;
          const m = line.match(RUST_FN_RE);
          if (m) {
            const cmd = commandOf(m[1]);
            cmd.name = m[1]; // Rust 名优先展示（含下划线的契约原文）
            cmd.rustDef = refOf(file.relativePath, i + 1);
          }
          pendingAttr = -1;
          continue;
        }
        if (RUST_CMD_ATTR_RE.test(line.trim())) {
          pendingAttr = i;
          continue;
        }
        collectMatches(line, EMIT_RE, name => eventOf(name).emits.push({ ...refOf(file.relativePath, i + 1), side: 'rust' }));
        collectMatches(line, EMIT_TO_RE, name => eventOf(name).emits.push({ ...refOf(file.relativePath, i + 1), side: 'rust' }));
      }
    } else {
      // 事件 API 噪声防护：Vue 组件的 emit('update:modelValue') 不是 Tauri 事件——
      // 仅当文件 import 了 @tauri-apps/api/event 时才采集该文件的 listen/emit
      const src = lines.join('\n');
      const hasTauriEventApi = /@tauri-apps\/api\/event/.test(src);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        collectMatches(line, INVOKE_RE, name => commandOf(name).frontendCalls.push(refOf(file.relativePath, i + 1)));
        if (!hasTauriEventApi) continue;
        collectMatches(line, LISTEN_RE, name => {
          if (!name.includes(':')) eventOf(name).listeners.push(refOf(file.relativePath, i + 1));
        });
        collectMatches(line, EMIT_RE, name => {
          if (!name.includes(':')) eventOf(name).emits.push({ ...refOf(file.relativePath, i + 1), side: 'frontend' });
        });
      }
    }
  }

  return {
    commands: [...commands.values()],
    events: [...events.values()].filter(e => e.listeners.length > 0 || e.emits.length > 0),
  };
}

/** 重置全局正则 lastIndex 后逐命中回调（全局正则在行级复用） */
function collectMatches(line: string, re: RegExp, cb: (name: string) => void): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    cb(m[1]);
  }
}
