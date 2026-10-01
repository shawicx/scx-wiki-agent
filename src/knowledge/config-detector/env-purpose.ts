/** env 用途的确定性提取（R3：只采集可复核证据，不做语义推断）。 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { EnvVarEvidence } from '../../core/types.js';

/**
 * 证据源按优先级：引用点上方紧邻注释 / 同行尾注释 / `?? 缺省值` 字面量 /
 * .env.example(.env.sample) 中同名变量的注释。无证据 → purpose 缺省。
 */
export function extractEnvPurposes(
  rootDir: string,
  allFiles: string[],
  vars: EnvVarEvidence[],
): EnvVarEvidence[] {
  const byName = new Map(vars.map(v => [v.name, v]));
  if (byName.size === 0) return vars;

  // 1) 源码内注释与缺省值
  for (const file of allFiles) {
    try {
      const lines = readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isCommentLine(line)) continue;
        const envRegex = /process\.env\.([A-Z_][A-Z0-9_]*)|os\.environ\[?['"]([A-Z_][A-Z0-9_]*)['"]|os\.getenv\(\s*['"]([A-Z_][A-Z0-9_]*)['"]|os\.Getenv\(\s*"([A-Z_][A-Z0-9_]*)"|System\.getenv\(\s*"([A-Z_][A-Z0-9_]*)"/g;
        let match: RegExpExecArray | null;
        envRegex.lastIndex = 0;
        while ((match = envRegex.exec(line)) !== null) {
          const name = match.slice(1).find(g => g !== undefined);
          if (!name) continue;
          const entry = byName.get(name);
          if (!entry || entry.purpose) continue;
          // 同行尾注释：const X = process.env.Y; // 用途说明
          const trailing = line.match(/(?:\/\/|#)\s*(.{2,100})\s*$/);
          const commentText = (trailing?.[1]
            // 上方紧邻注释行（//、*、# 形态，取最近一行）
            ?? nearestCommentAbove(lines, i))?.replace(/^\s*[*#]*\s*/, '').trim();
          // 缺省值字面量：process.env.X ?? 'z' / os.getenv('X', 'z') / os.Getenv("X", "z")
          const fallback = line.match(/process\.env\.[A-Z_][A-Z0-9_]*\s*(?:\?\?|\|\|)\s*(['"`][^'"`]*['"`]|true|false|\d+)/)
            ?? line.match(/os\.getenv\(\s*['"][A-Z_][A-Z0-9_]*['"]\s*,\s*([^)]+)\)/)
            ?? line.match(/os\.Getenv\(\s*"[A-Z_][A-Z0-9_]*"\s*,\s*([^)]+)\)/);
          if (commentText && commentText.length >= 2) {
            entry.purpose = commentText.slice(0, 100);
          } else if (fallback) {
            entry.purpose = `缺省值 ${fallback[1]}`;
          }
        }
      }
    } catch { /* skip unreadable */ }
  }

  // 2) .env.example / .env.sample 注释（# comment 行紧邻 NAME= 行）
  for (const sample of ['.env.example', '.env.sample']) {
    const p = join(rootDir, sample);
    if (!existsSync(p)) continue;
    try {
      const lines = readFileSync(p, 'utf-8').split('\n');
      let pendingComment: string | null = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
          const text = trimmed.replace(/^#+\s*/, '').trim();
          if (text.length >= 2) pendingComment = text;
          continue;
        }
        const decl = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
        if (decl) {
          const entry = byName.get(decl[1]);
          if (entry && !entry.purpose && pendingComment) {
            entry.purpose = `${sample}：${pendingComment}`.slice(0, 100);
          }
          pendingComment = null;
        }
      }
    } catch { /* skip unreadable */ }
  }

  return vars;
}

/** 引用行上方最近的注释行（跳过空行，最多回看 3 行；非注释代码行阻断） */
function nearestCommentAbove(lines: string[], index: number): string | null {
  for (let i = index - 1; i >= 0 && i >= index - 3; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('//')) return trimmed.slice(2).trim() || null;
    if (trimmed.startsWith('*')) return trimmed.replace(/^\*+/, '').trim() || null;
    if (trimmed.startsWith('#')) return trimmed.slice(1).trim() || null;
    return null;
  }
  return null;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*')
    || trimmed.startsWith('/*') || trimmed.startsWith('#');
}
