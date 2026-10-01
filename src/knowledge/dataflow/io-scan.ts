/**
 * I/O 与外部边界扫描（自 data-flow-shape.ts 拆出；纯搬移，零逻辑变化）。
 *
 * 承载：TS+JS+Vue / Rust / Python / Go / JVM 的单行 I/O 规则
 * （fs / process / config / env / stdout），严格限定在符号函数体内调用（由 index.ts 编排）。
 */

import type { DataIoEvent } from '../types.js';
import { skipString, splitTopLevel, truncate, DATA_FLOW_MAX_EXPRESSION } from './shapes.js';

interface IoRule {
  re: RegExp;
  kind: DataIoEvent['kind'];
  direction: DataIoEvent['direction'];
  /** 介质取自第 N 个实参（0 基） */
  mediumArg?: number;
  /** 介质为 env 变量名 */
  envName?: boolean;
}

const TS_IO_RULES: IoRule[] = [
  // 配置：包住 fs 读取的 JSON.parse 优先于普通 fs-read
  { re: /\bJSON\.parse\s*\(\s*(?:readFileSync|readFile)\s*\(/, kind: 'config', direction: 'input', mediumArg: 0 },
  { re: /\b(?:readFileSync|readFile|createReadStream|readJsonSync)\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:statSync|existsSync|accessSync|lstatSync)\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:readdirSync|opendirSync)\s*\(/, kind: 'directory-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:writeFileSync|appendFileSync|createWriteStream|copyFileSync|renameSync)\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\bmkdirSync\s*\(/, kind: 'directory-write', direction: 'output', mediumArg: 0 },
  { re: /\b(?:rmSync|rmdirSync|unlinkSync)\s*\(/, kind: 'remove', direction: 'output', mediumArg: 0 },
  { re: /\b(?:execFileSync|spawnSync)\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /(?<![\w.])exec\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /(?<![\w.])spawn\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /\bprocess\.stdout\.write\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\bconsole\.(?:log|warn|error|info|debug)\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\bprocess\.env\.([A-Za-z_][\w]*)/, kind: 'env', direction: 'input', envName: true },
  { re: /\bloadGlobalConfig\s*\(/, kind: 'config', direction: 'input' },
];

const PY_IO_RULES: IoRule[] = [
  { re: /\bjson\.load\s*\(\s*[\w.]*open\s*\(/, kind: 'config', direction: 'input', mediumArg: 0 },
  { re: /(?<!\w)open\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\bos\.path\.(?:exists|isfile|isdir|getsize)\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\bos\.(?:listdir|scandir|walk)\s*\(/, kind: 'directory-read', direction: 'input', mediumArg: 0 },
  { re: /\bos\.(?:makedirs|mkdir)\s*\(/, kind: 'directory-write', direction: 'output', mediumArg: 0 },
  { re: /\bos\.(?:remove|rmtree)\s*\(/, kind: 'remove', direction: 'output', mediumArg: 0 },
  { re: /\b(?:shutil\.copy|shutil\.move|pathlib\.[\w.]*write_text)\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\bsubprocess\.(?:run|call|check_output|Popen)\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /\b(?:print|logging\.[\w.]*|logger\.[\w.]*)\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\bos\.environ(?:\.get)?\[?\(?\s*['"]([A-Za-z_][\w]*)/, kind: 'env', direction: 'input', envName: true },
  { re: /\bos\.getenv\s*\(\s*['"]([A-Za-z_][\w]*)/, kind: 'env', direction: 'input', envName: true },
];

const GO_IO_RULES: IoRule[] = [
  { re: /\bos\.(?:ReadFile|Open|Stat)\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\bos\.(?:ReadDir|WalkDir)\s*\(/, kind: 'directory-read', direction: 'input', mediumArg: 0 },
  { re: /\bos\.(?:WriteFile|Create|Rename)\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\bos\.(?:MkdirAll|Mkdir)\s*\(/, kind: 'directory-write', direction: 'output', mediumArg: 0 },
  { re: /\bos\.(?:Remove|RemoveAll)\s*\(/, kind: 'remove', direction: 'output', mediumArg: 0 },
  { re: /\bexec\.Command(?:Context)?\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /\bfmt\.(?:Print|Println|Printf|Fprint)\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\bos\.Getenv\s*\(\s*"([A-Za-z_][\w]*)/, kind: 'env', direction: 'input', envName: true },
];

const JVM_IO_RULES: IoRule[] = [
  { re: /\bFiles\.(?:readString|readAllLines|newBufferedReader)\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:File|FileReader|FileInputStream)\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\bFiles\.(?:write|newBufferedWriter|copy)\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\bFiles\.(?:createDirectories|createDirectory)\s*\(/, kind: 'directory-write', direction: 'output', mediumArg: 0 },
  { re: /\bFiles\.(?:delete|deleteIfExists)\s*\(/, kind: 'remove', direction: 'output', mediumArg: 0 },
  { re: /\b(?:ProcessBuilder|Runtime\.getRuntime\(\)\.exec)\s*[.(]/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /\bSystem\.(?:out|err)\.(?:print|println|printf)\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\bprintln\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\bSystem\.(?:getenv|getProperty)\s*\(\s*"([A-Za-z_][\w]*)/, kind: 'env', direction: 'input', envName: true },
];

const NATIVE_IO_RULES: Record<string, IoRule[]> = {
  python: PY_IO_RULES,
  go: GO_IO_RULES,
  jvm: JVM_IO_RULES,
};

const RUST_IO_RULES: IoRule[] = [
  { re: /\b(?:fs|std::fs)::read_to_string\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\bFile::open\s*\(/, kind: 'fs-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:fs|std::fs)::read_dir\s*\(/, kind: 'directory-read', direction: 'input', mediumArg: 0 },
  { re: /\b(?:fs|std::fs)::write\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\bFile::create\s*\(/, kind: 'fs-write', direction: 'output', mediumArg: 0 },
  { re: /\b(?:fs|std::fs)::(?:create_dir_all|create_dir)\s*\(/, kind: 'directory-write', direction: 'output', mediumArg: 0 },
  { re: /\b(?:fs|std::fs)::remove_(?:file|dir_all|dir)\s*\(/, kind: 'remove', direction: 'output', mediumArg: 0 },
  { re: /\bCommand::new\s*\(/, kind: 'process', direction: 'bidirectional', mediumArg: 0 },
  { re: /\b(?:println|print|eprintln|eprint)!\s*\(/, kind: 'stdout', direction: 'output' },
  { re: /\b(?:env|std::env)::var\s*\(/, kind: 'env', direction: 'input', mediumArg: 0 },
];

/** 单行 I/O 规则扫描结果 */
export interface IoHit {
  kind: DataIoEvent['kind'];
  direction: DataIoEvent['direction'];
  expression: string;
  medium?: string;
}

/** 读取调用点实参文本并定位闭括号（end = -1 表示同行未闭合，调用跨行） */
function readCallArgs(line: string, afterParen: number): { args: string[]; end: number } {
  let depth = 1;
  let end = -1;
  for (let i = afterParen; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" || ch === '"' || ch === '`') { i = skipString(line, i) - 1; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  return { args: splitTopLevel(line.slice(afterParen, end < 0 ? line.length : end)), end };
}

/** 单行内检测 I/O 事件（可能多个；config 命中时抑制同一位置的 fs-read） */
export function detectIoEvents(line: string, domain: string): IoHit[] {
  const rules = NATIVE_IO_RULES[domain] ?? (domain === 'rust' ? RUST_IO_RULES : TS_IO_RULES);
  const hits: IoHit[] = [];
  const consumed = new Set<number>();
  for (const rule of rules) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    for (const m of line.matchAll(re)) {
      const at = m.index ?? 0;
      if (consumed.has(at)) continue;
      const matchEnd = at + m[0].length;
      // env：medium 为变量名（正则第 1 组）
      if (rule.envName) {
        hits.push({
          kind: rule.kind,
          direction: rule.direction,
          expression: truncate(m[0], DATA_FLOW_MAX_EXPRESSION),
          medium: m[1] ? `process.env.${m[1]}` : undefined,
        });
        consumed.add(at);
        continue;
      }
      // 表达式截到平衡闭括号为止（同行未闭合的跨行调用才退回行尾窗口）。
      // 多调用规则（如 JSON.parse(readFileSync(...)) ）取最外层调用的括号范围。
      const call = m[0].endsWith('(') ? readCallArgs(line, matchEnd) : null;
      const firstParen = m[0].indexOf('(');
      const outer = firstParen >= 0 && firstParen < m[0].length - 1
        ? readCallArgs(line, at + firstParen + 1)
        : call;
      const expression = (outer && outer.end >= 0
        ? line.slice(at, outer.end + 1)
        : line.slice(at, Math.min(line.length, matchEnd + 80))).trim();
      const args = call?.args ?? [];
      const medium = rule.mediumArg !== undefined ? args[rule.mediumArg] : undefined;
      hits.push({
        kind: rule.kind,
        direction: rule.direction,
        expression: truncate(expression, DATA_FLOW_MAX_EXPRESSION),
        ...(medium ? { medium: truncate(medium, DATA_FLOW_MAX_EXPRESSION) } : {}),
      });
      consumed.add(at);
      // 同位置的普通 fs-read 被 config 规则取代
      if (rule.kind === 'config') {
        for (const other of rules) {
          const otherRe = new RegExp(other.re.source, 'g');
          for (const om of line.matchAll(otherRe)) {
            if ((om.index ?? 0) >= at && (om.index ?? 0) < matchEnd) consumed.add(om.index ?? 0);
          }
        }
      }
      break;
    }
  }
  return hits;
}
