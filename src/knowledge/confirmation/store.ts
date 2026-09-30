// --- 持久化（仅 claim：机械移除标记可证安全，跨构建自动免标） ---
// v2 条目带指纹（文件 + 内容哈希 + repo HEAD + 时间）：代码演进后同名可能
// 指向另一符号，指纹失配的确认自动过期重新裁决（绝不静默沿用）。
// 歧义名（符号解析到 0/多文件，如依赖名、跨文件同名）无稳定指纹，退化为
// HEAD-scoped：任何提交后过期重问。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const CONFIRMATIONS_FILE = 'confirmations.json';

/** 单条已确认 claim 的指纹条目 */
export interface ConfirmedEntry {
  /** claim 原文（会话键与白名单键，与 marker identity 一致） */
  raw: string;
  /** 确认时符号所在文件（symbolFiles 唯一命中时；否则 [] = HEAD-scoped） */
  files: string[];
  /** 对应文件内容 sha256（与 files 一一对应） */
  hashes: string[];
  /** 确认时 repo HEAD 短哈希（非 git 环境为 ''） */
  head: string;
  /** 确认时间（ISO 8601） */
  confirmedAt: string;
}

interface ConfirmationStoreV2 {
  version: 2;
  entries: ConfirmedEntry[];
}

/** 读取确认条目；文件缺失/损坏返回空集（fail-open，不阻断构建）。v1 旧格式
 *  （纯 raw 列表）迁移为无指纹条目（head=''）：git 仓库内下次构建过期重问一次。 */
export function loadConfirmedEntries(agentDir: string): ConfirmedEntry[] {
  try {
    const raw = JSON.parse(readFileSync(join(agentDir, CONFIRMATIONS_FILE), 'utf-8')) as unknown;
    if (raw && typeof raw === 'object') {
      const store = raw as { version?: number; entries?: unknown; confirmed?: unknown };
      if (store.version === 2 && Array.isArray(store.entries)) {
        return store.entries.filter((e): e is ConfirmedEntry =>
          e !== null && typeof e === 'object'
          && typeof (e as ConfirmedEntry).raw === 'string' && (e as ConfirmedEntry).raw.length > 0,
        );
      }
      if (store.version === 1 && Array.isArray(store.confirmed)) {
        return store.confirmed
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .map(raw => ({ raw, files: [], hashes: [], head: '', confirmedAt: '' }));
      }
    }
  } catch {
    // 无文件/坏 JSON：按空集继续
  }
  return [];
}

/** 全量写入条目（按 raw 去重由调用方保证）；写失败不阻断构建 */
export function saveConfirmedEntries(agentDir: string, entries: ConfirmedEntry[]): void {
  try {
    mkdirSync(agentDir, { recursive: true });
    const store: ConfirmationStoreV2 = {
      version: 2,
      entries: [...entries].sort((a, b) => a.raw.localeCompare(b.raw)),
    };
    writeFileSync(join(agentDir, CONFIRMATIONS_FILE), JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // 写失败不阻断构建
  }
}

export interface EntryEvaluation {
  /** 指纹仍有效、本次免标的 claim 原文集合 */
  validRaws: Set<string>;
  /** 指纹失配（过期）的条目：不再免标，重新进入待确认队列 */
  stale: ConfirmedEntry[];
}

/**
 * 指纹重校验（纯函数，hashOf 注入便于单测）：
 * - entry.head === 当前 HEAD → 有效（确认后未提交过变更）；
 * - 否则逐文件比对内容哈希，全部一致才有效（任一文件变更/删除/不可读 → 过期）；
 * - files 为空的 HEAD-scoped 条目在 HEAD 变化后即过期（歧义名不长期沿用）。
 */
export function evaluateConfirmedEntries(
  entries: ReadonlyArray<ConfirmedEntry>,
  head: string,
  hashOf: (file: string) => string | null,
): EntryEvaluation {
  const validRaws = new Set<string>();
  const stale: ConfirmedEntry[] = [];
  for (const entry of entries) {
    let valid = entry.head === head;
    if (!valid && entry.files.length > 0 && entry.hashes.length === entry.files.length) {
      valid = entry.files.every((f, i) => hashOf(f) === entry.hashes[i]);
    }
    if (valid) {
      validRaws.add(entry.raw);
    } else {
      stale.push(entry);
    }
  }
  return { validRaws, stale };
}

/** 当前 repo HEAD 短哈希（非 git 仓库/失败返回 ''，条目退化为 HEAD-scoped） */
export function currentHead(rootDir: string): string {
  try {
    return execFileSync('git', ['-C', rootDir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

/** 文件内容 sha256（hex）；读失败返回 null（视为指纹失配） */
export function hashFileContent(rootDir: string): (file: string) => string | null {
  return (file: string) => {
    try {
      const content = readFileSync(join(rootDir, file), 'utf-8');
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return null;
    }
  };
}
