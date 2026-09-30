#!/usr/bin/env node
/**
 * 防回潮检查：src/ 与 tests/ 下所有 .ts 文件不得超过 360 行。
 * 挂在 pnpm lint 之后执行；超限文件以非零码失败并列出行数排名。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT = 360;
const ROOTS = ['src', 'tests'];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((root) => walk(root));
const over = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
  if (lines > LIMIT) over.push({ file, lines });
}

if (over.length > 0) {
  over.sort((a, b) => b.lines - a.lines);
  console.error(`✗ ${over.length} 个文件超过 ${LIMIT} 行上限：`);
  for (const { file, lines } of over) {
    console.error(`  ${String(lines).padStart(5)}  ${file}`);
  }
  process.exit(1);
}
console.log(`✓ 行数检查通过：${files.length} 个 .ts 文件均 ≤${LIMIT} 行`);
