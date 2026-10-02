/**
 * Tauri IPC 接口面扫描（desktop 项目真正的 API）。
 *
 * 图谱的 CALLS 边不覆盖 IPC 边界（前端字符串命令 ↔ Rust 宏命令），api 页在
 * Tauri 项目只能拿到字母切片。本模块以正则对表两侧：
 * 前端 `invoke('cmd')` / `listen('evt')` / `emit('evt')`，
 * Rust `#[tauri::command] fn` / `emit('evt')` / `emit_to` / `emit_all`，
 * camelCase 与 snake_case 双向归并（Tauri v2 惯例：JS 侧 camelCase 自动映射
 * Rust 侧 snake_case）。
 *
 * 扫描采用**全文正则 + 行号反查**（而非逐行）：多行调用形态
 * `app.emit(\n  "monitor-fatal", …)` 的字符串字面量在换行之后，逐行正则
 * 永远匹配不到；invoke 的嵌套泛型 `invoke<Array<{…}>>('cmd')` 由
 * 平衡尖括号预剥离（空白占位保持行号）兼容。
 *
 * 负面断言二次验证：命令「未被前端调用」/ 事件「发射点为空」在落定前，
 * 先对源码做裸字符串检索（含 camelCase↔snake_case 双形、跳过注释行）；
 * 检索命中即说明是扫描口径问题（深嵌套形态/动态名残余），标记 missSuspect，
 * 页面须呈现「扫描口径局限」而非断言不存在。已知残余局限（诚实缺失，
 * 不补造）：`invoke(变量)` 完全动态命令名。
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ScanResult } from '../core/scanner.js';
import { isTestPath, languageDomainOf } from '../shared/utils.js';
import type { SourceCache } from './source-fallback.js';
import { buildSourceCorpus, verifyAbsence, type AbsenceVerdict } from './negative-claim.js';
import type { IpcCommand, IpcEvent, IpcRef, IpcSurface } from './types.js';

/** Tauri 项目判定：src-tauri/tauri.conf.json 存在 */
export function isTauriProject(rootDir: string): boolean {
  return existsSync(join(rootDir, 'src-tauri', 'tauri.conf.json'));
}

/** 归一化命令/事件名（camelCase → snake_case）作双侧匹配键 */
function ipcKey(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

const INVOKE_RE = /\binvoke\s*\(\s*['"`]([^'"`\n]+)['"`]/g;
const LISTEN_RE = /\blisten\s*\(\s*['"`]([^'"`\n]+)['"`]/g;
const EMIT_RE = /\bemit\s*\(\s*['"`]([^'"`\n]+)['"`]/g;
const EMIT_TO_RE = /\.emit_to\s*\(\s*[^,()]+,\s*['"`]([^'"`\n]+)['"`]/g;
const EMIT_ALL_RE = /\.emit_all\s*\(\s*[^,()]+,\s*['"`]([^'"`\n]+)['"`]/g;
const RUST_CMD_ATTR_RE = /^#\[\s*tauri::command/;
const RUST_FN_RE = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/;

/**
 * 平衡（≤2 层）尖括号泛型实参段空白化：`invoke<Array<{…}>>('cmd')` /
 * `listen<Payload>('evt')` 的泛型段替换为等长空白（保留换行），使行号反查仍然精确。
 */
function blankCallGenerics(src: string): string {
  return src.replace(
    /\b(invoke|listen|emit)((?:\s*<(?:[^<>]*|<[^<>]*>)*>)+)\s*\(/g,
    (match, fn: string) =>
      fn + '(' + [...match.slice(fn.length + 1)].map(ch => (ch === '\n' ? '\n' : ' ')).join(''),
  );
}

/** 全文命中 → 回调（name, line）；行号取**事件名/命令名字面量**所在行（非调用起始行） */
function scanFullText(src: string, re: RegExp, cb: (name: string, line: number) => void): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const nameOffset = m[0].indexOf(m[1]);
    const nameIndex = m.index + (nameOffset >= 0 ? nameOffset : 0);
    let line = 1;
    for (let i = 0; i < nameIndex; i++) if (src.charCodeAt(i) === 10) line++;
    cb(m[1], line);
  }
}

/**
 * 负面断言二次验证（W5 框架的 IPC 应用）：只在主扫描某侧为空时调用——
 * verifyAbsence 命中即 suspect（主扫描的假阴性嫌疑，missSuspect 透出引用点，
 * 页面标注扫描口径局限），未命中才允许断言不存在。
 */
function verify(verdict: AbsenceVerdict): IpcRef[] | null {
  return verdict.verdict === 'suspect' ? verdict.refs : null;
}

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

  const texts = buildSourceCorpus(scanResult, cache);

  for (const { rel, src, isRust } of texts) {
    if (isRust) {
      // #[tauri::command] 状态机：跳过后续 attribute/# 行与 /// 文档行（≤30 行），在 fn 行收名
      const lines = src.split('\n');
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
            cmd.rustDef = { file: rel, line: i + 1 };
          }
          pendingAttr = -1;
          continue;
        }
        if (RUST_CMD_ATTR_RE.test(line.trim())) {
          pendingAttr = i;
          continue;
        }
      }
      // 全文扫描（含跨行形态）：emit / emit_to / emit_all
      scanFullText(src, EMIT_RE, (name, line) => eventOf(name).emits.push({ file: rel, line, side: 'rust' }));
      scanFullText(src, EMIT_TO_RE, (name, line) => eventOf(name).emits.push({ file: rel, line, side: 'rust' }));
      scanFullText(src, EMIT_ALL_RE, (name, line) => eventOf(name).emits.push({ file: rel, line, side: 'rust' }));
    } else {
      // 事件 API 噪声防护：Vue 组件的 emit('update:modelValue') 不是 Tauri 事件——
      // 仅当文件 import 了 @tauri-apps/api/event 时才采集该文件的 listen/emit
      const invokeSrc = blankCallGenerics(src);
      scanFullText(invokeSrc, INVOKE_RE, (name, line) =>
        commandOf(name).frontendCalls.push({ file: rel, line }));
      if (/@tauri-apps\/api\/event/.test(src)) {
        scanFullText(invokeSrc, LISTEN_RE, (name, line) => {
          if (!name.includes(':')) eventOf(name).listeners.push({ file: rel, line });
        });
        scanFullText(invokeSrc, EMIT_RE, (name, line) => {
          if (!name.includes(':')) eventOf(name).emits.push({ file: rel, line, side: 'frontend' });
        });
      }
    }
  }

  // 负面断言二次验证：仅对「空侧」做裸检索，命中即标记扫描口径局限
  for (const cmd of commands.values()) {
    if (cmd.frontendCalls.length === 0) {
      const refs = verify(verifyAbsence(texts, cmd.name, 'frontend'));
      if (refs) cmd.frontendMissSuspect = refs;
    }
    if (cmd.rustDef === null) {
      const refs = verify(verifyAbsence(texts, cmd.name, 'rust'));
      if (refs) cmd.rustMissSuspect = refs;
    }
  }
  for (const evt of events.values()) {
    if (evt.emits.length === 0) {
      // 发射嫌疑排除监听点本身（listen('x') 命中的是监听证据，不是发射证据）
      const refs = verify(verifyAbsence(texts, evt.name, 'any', evt.listeners));
      if (refs) evt.emitMissSuspect = refs;
    }
    if (evt.listeners.length === 0) {
      const refs = verify(verifyAbsence(texts, evt.name, 'frontend'));
      if (refs) evt.listenMissSuspect = refs;
    }
  }

  return {
    commands: [...commands.values()],
    events: [...events.values()].filter(e => e.listeners.length > 0 || e.emits.length > 0),
  };
}
