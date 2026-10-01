/**
 * 页面职责越界检测（确定性子集）：
 * 每个注册页有「专属表头签名」（canonical schema）；他页正文出现同签名表格
 * 即视为越界（warn）。签名取自各页 fallback 模板的表头，LLM 复述同名表头也会命中。
 */

import type { CrossPageIssue, PageFingerprint } from './types.js';

/** 页面专属表头签名（页名 → 表头列名前缀序列；来自 fallback 模板的 canonical 输出） */
const EXCLUSIVE_TABLE_HEADERS: Readonly<Record<string, ReadonlyArray<readonly string[]>>> = {
  calls: [
    ['调用方', '被调方'],
    ['符号', '文件', '扇入'],
  ],
  glossary: [
    ['Name', 'Type', 'Signature'],
  ],
  classes: [
    ['方法', '可见性', '签名'],
  ],
  'tech-stack': [
    ['依赖', '版本'],
  ],
};

/** 表头前缀匹配（签名是表格表头的前缀，容忍尾部追加列） */
function headerMatches(header: string[], signature: readonly string[]): boolean {
  if (header.length < signature.length) return false;
  return signature.every((cell, i) => header[i] === cell);
}

/**
 * 越界检测主入口：owner 页之外出现 owner 的专属表头签名 → page-scope-overlap warn。
 * 同签名出现在两个非 owner 页时，归属消息指向 owner。
 */
export function detectScopeOverlap(
  fingerprints: ReadonlyMap<string, PageFingerprint>,
): CrossPageIssue[] {
  const issues: CrossPageIssue[] = [];
  for (const [owner, signatures] of Object.entries(EXCLUSIVE_TABLE_HEADERS)) {
    for (const [page, fp] of fingerprints) {
      if (page === owner) continue;
      for (const table of fp.tables) {
        if (table.rows === 0) continue;
        const hit = signatures.find(sig => headerMatches(table.header, sig));
        if (hit) {
          issues.push({
            rule: 'page-scope-overlap',
            pages: [page, owner],
            message: `${page} 页出现 ${owner} 页的专属表头「${hit.join(' | ')}」（${table.rows} 行），疑似职责越界，建议让位并链接 ${owner}.md`,
          });
          break; // 每页每 owner 只报一次
        }
      }
    }
  }
  return issues;
}
