/**
 * P3 评估脚本：vue-sfc 通道（编译器路径）与正则回落路径的偏差抽样。
 *
 * 用法：npx tsx scripts/eval-vue-sfc.mjs <目标仓库路径> [抽样数]
 *
 * 对照设计文档 P3 验收：偏差 <2%（组件级 props/emits 名称集一致率）
 * 则无需引入编译器级校验通道（vue-tsc）；≥2% 打印明细供人工核对。
 * 退出码：0 = 通过（<2%），1 = 偏差超标，2 = 用法错误/无样本。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { extractVueSfcFacts, extractVueSfcFactsFallback } from '../src/knowledge/channels/vue-sfc.ts';

const repo = process.argv[2];
const sampleCap = Number(process.argv[3] ?? 60);
if (!repo) {
  console.error('用法：npx tsx scripts/eval-vue-sfc.mjs <目标仓库路径> [抽样数]');
  process.exit(2);
}

// 递归收集 .vue 文件（跳过 node_modules/dist）
const vueFiles = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith('.vue')) vueFiles.push(p);
  }
};
walk(repo);

if (vueFiles.length === 0) {
  console.error('目标仓库无 .vue 文件');
  process.exit(2);
}

// 均匀抽样（步进取整，覆盖各目录）
const step = Math.max(1, Math.floor(vueFiles.length / sampleCap));
const sample = vueFiles.filter((_, i) => i % step === 0).slice(0, sampleCap);

let compilerFailed = 0;
let propDiffs = 0;
let emitDiffs = 0;
let propTotal = 0;
let emitTotal = 0;
const details = [];

for (const abs of sample) {
  const rel = relative(repo, abs);
  const src = readFileSync(abs, 'utf-8');
  const exact = extractVueSfcFacts(rel, abs);
  const approx = extractVueSfcFactsFallback(rel, src);
  if (!exact || exact.confidence !== 'exact') {
    compilerFailed++;
    details.push(`[编译失败→回落] ${rel}`);
    continue;
  }
  const exactProps = new Set(exact.props.map(p => p.name));
  const approxProps = new Set(approx.props.map(p => p.name));
  const exactEmits = new Set(exact.emits.map(e => e.name));
  const approxEmits = new Set(approx.emits.map(e => e.name));
  propTotal += exactProps.size;
  emitTotal += exactEmits.size;
  const pd = [...exactProps].filter(n => !approxProps.has(n)).length
    + [...approxProps].filter(n => !exactProps.has(n)).length;
  const ed = [...exactEmits].filter(n => !approxEmits.has(n)).length
    + [...approxEmits].filter(n => !exactEmits.has(n)).length;
  if (pd > 0) {
    propDiffs += pd;
    details.push(`[props ±${pd}] ${rel}：编译器 [${[...exactProps]}] vs 正则 [${[...approxProps]}]`);
  }
  if (ed > 0) {
    emitDiffs += ed;
    details.push(`[emits ±${ed}] ${rel}：编译器 [${[...exactEmits]}] vs 正则 [${[...approxEmits]}]`);
  }
}

const devPct = (diff, total) => (total > 0 ? (diff / total) * 100 : 0);
const pPct = devPct(propDiffs, propTotal);
const ePct = devPct(emitDiffs, emitTotal);
const overall = Math.max(pPct, ePct);

console.log(`样本 ${sample.length}/${vueFiles.length} 个 .vue（编译失败回落 ${compilerFailed}）`);
console.log(`props 偏差 ${propDiffs}/${propTotal}（${pPct.toFixed(1)}%）｜emits 偏差 ${emitDiffs}/${emitTotal}（${ePct.toFixed(1)}%）`);
if (details.length > 0) {
  console.log('明细：');
  for (const d of details.slice(0, 30)) console.log(`  - ${d}`);
  if (details.length > 30) console.log(`  - …另有 ${details.length - 30} 条`);
}
console.log(overall < 2
  ? `✓ 偏差 ${overall.toFixed(1)}% < 2%：无需引入 vue-tsc 校验通道`
  : `✗ 偏差 ${overall.toFixed(1)}% ≥ 2%：建议引入编译器级校验通道并核对上方明细`);
process.exit(overall < 2 ? 0 : 1);
