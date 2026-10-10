// --- 持久化（仅 claim：机械移除标记可证安全，跨构建自动免标） ---
// v2 条目带指纹（文件 + 内容哈希 + repo HEAD + 时间）：代码演进后同名可能
// 指向另一符号，指纹失配的确认自动过期重新裁决（绝不静默沿用）。
// 歧义名（符号解析到 0/多文件，如依赖名、跨文件同名）无稳定指纹，退化为
// HEAD-scoped：任何提交后过期重问。

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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

/** 单条 v2 条目的结构完备性校验（缺字段/类型错的畸形条目直接丢弃，fail-open） */
function isWellFormedEntry(e: unknown): e is ConfirmedEntry {
  if (e === null || typeof e !== 'object') return false;
  const c = e as Record<string, unknown>;
  return typeof c.raw === 'string' && c.raw.length > 0
    && Array.isArray(c.files) && c.files.every(f => typeof f === 'string')
    && Array.isArray(c.hashes) && c.hashes.every(h => typeof h === 'string')
    && typeof c.head === 'string'
    && typeof c.confirmedAt === 'string';
}

/** 读取确认条目；文件缺失/损坏返回空集（fail-open，不阻断构建）。v1 旧格式
 *  （纯 raw 列表）迁移为无指纹条目（head=''）：git 仓库内下次构建过期重问一次。
 *  畸形条目（手改/写盘截断导致缺字段）逐条丢弃，绝不因单条坏数据抛错阻断构建。 */
export function loadConfirmedEntries(agentDir: string): ConfirmedEntry[] {
  try {
    const raw = JSON.parse(readFileSync(join(agentDir, CONFIRMATIONS_FILE), 'utf-8')) as unknown;
    if (raw && typeof raw === 'object') {
      const store = raw as { version?: number; entries?: unknown; confirmed?: unknown };
      if (store.version === 2 && Array.isArray(store.entries)) {
        return store.entries.filter(isWellFormedEntry);
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

/** 全量写入条目（按 raw 去重由调用方保证）；临时文件 + rename 原子写，
 *  并发 build / 中断不留截断 JSON（截断文件会被读取侧 fail-open 清空）；写失败不阻断构建 */
export function saveConfirmedEntries(agentDir: string, entries: ConfirmedEntry[]): void {
  try {
    mkdirSync(agentDir, { recursive: true });
    const store: ConfirmationStoreV2 = {
      version: 2,
      entries: [...entries].sort((a, b) => a.raw.localeCompare(b.raw)),
    };
    const target = join(agentDir, CONFIRMATIONS_FILE);
    const tmp = `${target}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
    renameSync(tmp, target);
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
 * - 有指纹条目（files 非空）：逐文件内容哈希为权威判定（与 HEAD 无关）——
 *   新提交后指纹文件未动 → 仍有效；同 HEAD 下工作区未提交变更（dirty tree）
 *   同样过期，不再 HEAD 短路跳过哈希比对；
 * - HEAD-scoped 条目（files 为空，歧义名）：HEAD 一致即有效，HEAD 变化后过期；
 * - 任一文件变更/删除/不可读 → 过期。
 */
export function evaluateConfirmedEntries(
  entries: ReadonlyArray<ConfirmedEntry>,
  head: string,
  hashOf: (file: string) => string | null,
): EntryEvaluation {
  const validRaws = new Set<string>();
  const stale: ConfirmedEntry[] = [];
  for (const entry of entries) {
    let valid: boolean;
    if (entry.files.length > 0) {
      // 有指纹条目：逐文件内容哈希为权威（与 HEAD 无关）——
      // 新提交后指纹文件未动 → 仍有效；同 HEAD 下工作区未提交变更 → 过期
      valid = entry.hashes.length === entry.files.length
        && entry.files.every((f, i) => hashOf(f) === entry.hashes[i]);
    } else {
      // HEAD-scoped（歧义名无稳定指纹）：HEAD 一致即有效
      valid = entry.head === head;
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
