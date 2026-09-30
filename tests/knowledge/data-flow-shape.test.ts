import { describe, it, expect } from 'vitest';
import {
  collectDataFlowShapes,
  detectIoEvents,
  explainReturnType,
  extractReferencedTypeNames,
  inferLiteralShape,
  parseEdgeArgs,
  parseSignatureText,
  type DataFlowShapeInput,
  type GraphSymbolFacts,
  type GraphTypeFacts,
  type TransitionFacts,
} from '../../src/knowledge/data-flow-shape.js';

/** 虚拟文件系统：readSource 从内存取，测试不落盘 */
function collector(
  files: Record<string, string>,
  transitions: TransitionFacts[],
  symbols: GraphSymbolFacts[] = [],
  typeNodes: GraphTypeFacts[] = [],
) {
  const input: DataFlowShapeInput = {
    transitions,
    symbols,
    typeNodes,
    readSource: file => files[file] ?? null,
    isProduction: file => !file.startsWith('tests/'),
  };
  return collectDataFlowShapes(input);
}

function edge(over: Partial<TransitionFacts> = {}): TransitionFacts {
  return {
    caller: 'main',
    callerFile: 'src/index.ts',
    callee: 'readConfig',
    calleeFile: 'src/config.ts',
    calleeLine: 1,
    callLine: 10,
    args: [],
    sequenceIndex: 0,
    depth: 0,
    isEntry: true,
    ...over,
  };
}

function symbol(over: Partial<GraphSymbolFacts> = {}): GraphSymbolFacts {
  return {
    name: 'readConfig',
    file: 'src/config.ts',
    label: 'Function',
    startLine: 1,
    ...over,
  };
}

const CONFIG_SOURCE = [
  'import { readFileSync } from "fs";',
  '',
  'export interface Config { name: string; count: number }',
  '',
  'export function readConfig(path: string): Config {',
  '  const raw = readFileSync(path, "utf-8");',
  '  return JSON.parse(raw);',
  '}',
  '',
  'export function writeWiki(target: string, content: string): void {',
  '  writeFileSync(target, content, "utf-8");',
  '  console.log("done");',
  '}',
  '',
  'export function main(): void {',
  '  const cfg = readConfig("config.json");',
  '  writeWiki("out.md", "x");',
  '}',
].join('\n');

describe('data-flow-shape / 签名与实参', () => {
  it('图谱签名 + CALLS 实参合并：表达式与类型同时保留', () => {
    const result = collector(
      { 'src/index.ts': 'export function main() { buildWiki(scanResult); }', 'src/wiki.ts': 'export function buildWiki(r: ScanResult): string[] { return [r]; }' },
      [edge({ caller: 'main', callee: 'buildWiki', calleeFile: 'src/wiki.ts', callLine: 12, args: [{ expression: 'scanResult' }] })],
      [symbol({ name: 'buildWiki', file: 'src/wiki.ts', startLine: 1, endLine: 1, signature: '(r: ScanResult)', returnType: ': string[]', paramTypes: '["ScanResult"]', paramNames: '["r"]' })],
    );

    const stage = result.stages.find(s => s.symbol === 'buildWiki');
    expect(stage).toBeDefined();
    const input = stage!.inputs.find(i => i.expression === 'scanResult');
    expect(input?.type).toBe('ScanResult');
    expect(input?.evidence).toBe('call-argument');
    expect(input?.anchor).toBe('src/index.ts:12');
    expect(stage!.outputs.map(o => o.type)).toContain('string[]');
    expect(stage!.evidenceKinds).toContain('signature');
    expect(stage!.evidenceKinds).toContain('call-argument');
    expect(result.shapeCoverage.dataBearingTransitions).toBe(1);
  });

  it('图谱签名缺失时回落源码签名（source-signature）', () => {
    const result = collector(
      { 'src/wiki.ts': 'export function buildWiki(options: GeneratorSettings): Promise<void> {\n  return Promise.resolve();\n}' },
      [edge({ callee: 'buildWiki', calleeFile: 'src/wiki.ts', args: [{ expression: 'opts' }] })],
      [symbol({ name: 'buildWiki', file: 'src/wiki.ts', startLine: 1, signature: null })],
    );
    const stage = result.stages.find(s => s.symbol === 'buildWiki')!;
    expect(stage.inputs[0].type).toBe('GeneratorSettings');
    expect(stage.inputs[0].expression).toBe('opts');
    // Promise<void> 不是业务返回值，但仍作为显式返回形态保留
    expect(stage.outputs[0].type).toBe('Promise<void>');
  });

  it('字面量实参只做保守推断，非字面量一律不写类型', () => {
    const result = collector(
      { 'src/a.ts': 'export function main() { f("x", 3, true, foo.bar()); }', 'src/b.ts': 'export function f(a, b, c, d) {}' },
      [edge({
        callee: 'f', calleeFile: 'src/b.ts',
        args: [{ expression: '"x"' }, { expression: '3' }, { expression: 'true' }, { expression: 'foo.bar()' }],
      })],
      [symbol({ name: 'f', file: 'src/b.ts', startLine: 1 })],
    );
    const stage = result.stages.find(s => s.symbol === 'f')!;
    expect(stage.inputs.find(i => i.expression === '"x"')?.type).toBe('string');
    expect(stage.inputs.find(i => i.expression === '3')?.type).toBe('number');
    expect(stage.inputs.find(i => i.expression === 'true')?.type).toBe('boolean');
    const unknown = stage.inputs.find(i => i.expression === 'foo.bar()');
    expect(unknown?.type).toBeUndefined();
    expect(unknown?.evidence).toBe('call-argument');
  });

  it('void / Promise<void> 由确定性规则解释，不虚构 payload', () => {
    expect(explainReturnType('void')).toBe('void（异步完成信号，无业务返回值）');
    expect(explainReturnType('Promise<void>')).toBe('Promise<void>（异步完成信号，无业务返回值）');
    expect(explainReturnType('Promise<string>')).toBe('Promise<string>');
  });
});

describe('data-flow-shape / I-O 归属', () => {
  it('同文件多函数的 I/O 分别归属各自函数体，不串归属', () => {
    const result = collector(
      { 'src/config.ts': CONFIG_SOURCE },
      [
        edge({ callee: 'readConfig', calleeFile: 'src/config.ts' }),
        edge({ callee: 'writeWiki', calleeFile: 'src/config.ts', callLine: 17 }),
      ],
      [
        symbol({ name: 'main', file: 'src/index.ts', startLine: 15, endLine: 18, signature: '()' }),
        symbol({ name: 'readConfig', file: 'src/config.ts', startLine: 5, endLine: 8 }),
        symbol({ name: 'writeWiki', file: 'src/config.ts', startLine: 10, endLine: 13 }),
      ],
    );

    const bySymbol = (name: string) => result.ioEvents.filter(e => e.symbol === name);
    expect(bySymbol('readConfig').map(e => [e.kind, e.line])).toEqual([['fs-read', 6]]);
    expect(bySymbol('readConfig')[0].medium).toBe('path');
    expect(bySymbol('writeWiki').map(e => [e.kind, e.line])).toEqual([['fs-write', 11], ['stdout', 12]]);
    expect(bySymbol('writeWiki')[0].medium).toBe('target');
    // main 函数体里只有项目内调用，没有任何 fs/stdio 表达式 → 0 事件（全文件扫描会误归属）
    expect(bySymbol('main')).toEqual([]);
  });

  it('无 end_line 时用括号匹配确定函数体范围；匹配失败标注近似', () => {
    const source = [
      'export function a(): void {',
      '  writeFileSync("a.txt", "x");',
      '}',
      'export function b(): void {',
      '  writeFileSync("b.txt", "x");',
      '',
    ].join('\n');
    const result = collector(
      { 'src/x.ts': source },
      [edge({ callee: 'a', calleeFile: 'src/x.ts' }), edge({ callee: 'b', calleeFile: 'src/x.ts', callLine: 11 })],
      [symbol({ name: 'a', file: 'src/x.ts', startLine: 1 }), symbol({ name: 'b', file: 'src/x.ts', startLine: 4 })],
    );
    expect(result.ioEvents.filter(e => e.symbol === 'a').map(e => e.line)).toEqual([2]);
    const bEvents = result.ioEvents.filter(e => e.symbol === 'b');
    expect(bEvents.map(e => e.line)).toEqual([5]);
    expect(bEvents[0].approximated).toBe(true);
    expect(result.shapeCoverage.approximatedBodies).toBeGreaterThan(0);
  });

  it('识别子进程 / env / 配置 / Rust I-O 规则', () => {
    const ts = [
      'export function run(): void {',
      '  const key = process.env.WIKI_KEY;',
      '  execFileSync("git", ["log"]);',
      '  const cfg = JSON.parse(readFileSync("config.json", "utf-8"));',
      '}',
    ].join('\n');
    const rust = [
      'fn main() {',
      '  let s = std::fs::read_to_string("a.txt").unwrap();',
      '  println!("{}", s);',
      '  Command::new("git").arg("log").status();',
      '}',
    ].join('\n');
    const result = collector(
      { 'src/run.ts': ts, 'src/main.rs': rust },
      [
        edge({ callee: 'run', calleeFile: 'src/run.ts', isEntry: false }),
        edge({ callee: 'main', calleeFile: 'src/main.rs', callLine: 20, isEntry: false }),
      ],
      [
        symbol({ name: 'run', file: 'src/run.ts', startLine: 1, endLine: 5 }),
        symbol({ name: 'main', file: 'src/main.rs', startLine: 1, endLine: 5 }),
      ],
    );
    const kinds = (name: string) => result.ioEvents.filter(e => e.symbol === name).map(e => e.kind);
    expect(kinds('run')).toEqual(['env', 'process', 'config']);
    expect(result.ioEvents.find(e => e.kind === 'env')?.medium).toBe('process.env.WIKI_KEY');
    expect(kinds('main')).toEqual(['fs-read', 'stdout', 'process']);
    // 配置读取是输入边界 → io-boundary；子进程优先于纯输出
    expect(result.stages.find(s => s.symbol === 'run')?.role).toBe('io-boundary');
    expect(result.stages.find(s => s.symbol === 'main')?.role).toBe('io-boundary');
  });
});

describe('data-flow-shape / 类型定义与阶段资格', () => {
  it('签名引用的本地类型定义被摘录（含锚点与截断保护）', () => {
    const result = collector(
      {
        'src/wiki.ts': [
          'export interface WikiBuildOptions {',
          '  target: string;',
          '  content: string;',
          '}',
          '',
          'export function writeWiki(options: WikiBuildOptions): void {}',
        ].join('\n'),
      },
      [edge({ callee: 'writeWiki', calleeFile: 'src/wiki.ts', args: [{ expression: 'options' }] })],
      [symbol({ name: 'writeWiki', file: 'src/wiki.ts', startLine: 6, endLine: 6, signature: '(options: WikiBuildOptions)' })],
      [{ name: 'WikiBuildOptions', label: 'Interface', file: 'src/wiki.ts', startLine: 1, endLine: 4 }],
    );
    expect(result.typeDefinitions.map(d => d.name)).toEqual(['WikiBuildOptions']);
    expect(result.typeDefinitions[0].kind).toBe('interface');
    expect(result.typeDefinitions[0].line).toBe(1);
    expect(result.typeDefinitions[0].text).toContain('interface WikiBuildOptions');
    expect(result.shapeCoverage.typeDefinitions).toBe(1);
  });

  it('关键数据结构只补 interface/type/enum，类实现体仅在签名显式引用时摘录', () => {
    const result = collector(
      { 'src/a.ts': 'export function f(o: Options): void {}\n\nexport class BigImpl {\n  run(): void {}\n}\n\nexport interface Options { a: string }' },
      [edge({ callee: 'f', calleeFile: 'src/a.ts', args: [{ expression: 'o' }] })],
      [symbol({ name: 'f', file: 'src/a.ts', startLine: 1, endLine: 1, signature: '(o: Options)' })],
      [
        { name: 'Options', label: 'Interface', file: 'src/a.ts', startLine: 7, endLine: 7 },
        { name: 'BigImpl', label: 'Class', file: 'src/a.ts', startLine: 3, endLine: 5 },
      ],
    );
    expect(result.typeDefinitions.map(d => d.name)).toEqual(['Options']);
  });

  it('纯控制流中间符号不成阶段，转换边不计入数据证据', () => {
    const result = collector(
      { 'src/a.ts': 'export function A() { B(); }', 'src/b.ts': 'export function B() { C("x"); }', 'src/c.ts': 'export function C(x: string): number { return 1; }' },
      [
        edge({ caller: 'A', callerFile: 'src/a.ts', callee: 'B', calleeFile: 'src/b.ts', callLine: 1, isEntry: true }),
        edge({ caller: 'B', callerFile: 'src/b.ts', callee: 'C', calleeFile: 'src/c.ts', callLine: 1, depth: 1, isEntry: false, args: [{ expression: '"x"' }] }),
      ],
      [
        symbol({ name: 'A', file: 'src/a.ts', startLine: 1, signature: '()' }),
        symbol({ name: 'B', file: 'src/b.ts', startLine: 1, signature: '()' }),
        symbol({ name: 'C', file: 'src/c.ts', startLine: 1, signature: '(x: string)', returnType: ': number' }),
      ],
    );
    // B 无签名参数类型、无实参、无 I/O、非入口非终点 → 不成阶段（只保留在路径中）
    expect(result.stages.map(s => s.symbol)).not.toContain('B');
    // A→B 无数据证据（B 无参数类型/返回/实参）→ 纯控制流
    expect(result.transitions.map(t => `${t.from}->${t.to}`)).toEqual(['B->C']);
    expect(result.shapeCoverage.controlOnlyTransitions).toBe(1);
    expect(result.shapeCoverage.dataBearingTransitions).toBe(1);
  });

  it('多个 sequence 共享中游边时转换去重、阶段合并', () => {
    const shared = edge({ caller: 'mid', callerFile: 'src/mid.ts', callee: 'tail', calleeFile: 'src/tail.ts', callLine: 5, args: [{ expression: 'payload' }] });
    const result = collector(
      { 'src/mid.ts': 'export function mid(payload: Payload) { tail(payload); }', 'src/tail.ts': 'export function tail(p: Payload): void {}' },
      [
        edge({ caller: 'entryA', callerFile: 'src/a.ts', callee: 'mid', calleeFile: 'src/mid.ts', callLine: 3, sequenceIndex: 0, args: [{ expression: 'p' }] }),
        { ...shared, sequenceIndex: 0 },
        edge({ caller: 'entryB', callerFile: 'src/b.ts', callee: 'mid', calleeFile: 'src/mid.ts', callLine: 4, sequenceIndex: 1, args: [{ expression: 'q' }] }),
        { ...shared, sequenceIndex: 1 },
      ],
      [
        symbol({ name: 'mid', file: 'src/mid.ts', startLine: 1, endLine: 1, signature: '(payload: Payload)' }),
        symbol({ name: 'tail', file: 'src/tail.ts', startLine: 1, signature: '(p: Payload)', returnType: ': void' }),
      ],
    );
    expect(result.transitions.filter(t => t.from === 'mid' && t.to === 'tail').length).toBe(1);
    expect(result.stages.filter(s => s.symbol === 'mid').length).toBe(1);
    // 合并后的阶段同时保留两条入口路径的实参证据
    const mid = result.stages.find(s => s.symbol === 'mid')!;
    expect(mid.inputs.map(i => i.expression).sort()).toEqual(['p', 'q']);
  });

  it('测试 / fixture 文件不进入 data-flow 形态证据', () => {
    const result = collector(
      { 'tests/fixtures/x.ts': 'export function fixtureFn(a: string): string { return a; }' },
      [edge({ callee: 'fixtureFn', calleeFile: 'tests/fixtures/x.test.ts', args: [{ expression: 'a' }] })],
      [symbol({ name: 'fixtureFn', file: 'tests/fixtures/x.ts', startLine: 1, signature: '(a: string)', returnType: ': string' })],
      [{ name: 'FixtureType', label: 'Interface', file: 'tests/fixtures/x.ts', startLine: 1, endLine: 2 }],
    );
    expect(result.stages).toEqual([]);
    expect(result.transitions).toEqual([]);
    expect(result.ioEvents).toEqual([]);
    expect(result.typeDefinitions).toEqual([]);
    expect(result.shapeCoverage.symbolsConsidered).toBe(0);
  });

  it('entry 阶段无任何形态证据时诚实标注 dataShapeKnown=false', () => {
    const result = collector(
      { 'src/a.ts': 'export function A() { B(); }' },
      [edge({ caller: 'A', callerFile: 'src/a.ts', callee: 'B', calleeFile: 'src/b.ts', isEntry: true })],
    );
    const entry = result.stages.find(s => s.symbol === 'A');
    expect(entry?.role).toBe('entry');
    expect(entry?.dataShapeKnown).toBe(false);
    expect(entry?.inputs).toEqual([]);
    expect(entry?.outputs).toEqual([]);
  });
});

describe('data-flow-shape / 解析工具', () => {
  it('parseEdgeArgs 兼容数组/JSON 字符串/空值/非法值', () => {
    expect(parseEdgeArgs([{ i: 0, e: 'options' }])).toEqual([{ expression: 'options' }]);
    expect(parseEdgeArgs('[{"i":0,"e":"a"},{"i":1,"e":"b","v":"1"}]')).toEqual([
      { expression: 'a' },
      { expression: 'b', value: '1' },
    ]);
    expect(parseEdgeArgs('')).toEqual([]);
    expect(parseEdgeArgs('not-json')).toEqual([]);
    expect(parseEdgeArgs(null)).toEqual([]);
  });

  it('parseSignatureText 处理多行/默认值/解构/泛型/箭头返回类型', () => {
    const parsed = parseSignatureText('(\n  items: T[],\n  size = 10,\n  { a, b }: Opts,\n  cb: (x: string) => void,\n): Promise<Map<string, number>>');
    expect(parsed?.params.map(p => p.name)).toEqual(['items', 'size', '{ a, b }', 'cb']);
    expect(parsed?.params[0].type).toBe('T[]');
    expect(parsed?.params[2].type).toBe('Opts');
    expect(parsed?.params[3].type).toBe('(x: string) => void');
    expect(parsed?.returnType).toBe('Promise<Map<string, number>>');
  });

  it('inferLiteralShape 只认字面量', () => {
    expect(inferLiteralShape("'x'")).toBe('string');
    expect(inferLiteralShape('123')).toBe('number');
    expect(inferLiteralShape('true')).toBe('boolean');
    expect(inferLiteralShape('arr[i]')).toBeUndefined();
    expect(inferLiteralShape('[...]')).toBe('array literal');
    expect(inferLiteralShape('[1, 2]')).toBe('array literal');
    expect(inferLiteralShape('{ a: 1 }')).toBe('object literal');
    expect(inferLiteralShape('scanResult')).toBeUndefined();
    expect(inferLiteralShape('await load()')).toBeUndefined();
  });

  it('extractReferencedTypeNames 递归展开容器且排除内建名', () => {
    expect(extractReferencedTypeNames('Promise<Array<WikiBuildOptions>>')).toEqual(['WikiBuildOptions']);
    expect(extractReferencedTypeNames('Record<string, GeneratorSettings>')).toEqual(['GeneratorSettings']);
    expect(extractReferencedTypeNames('string[]')).toEqual([]);
  });

  it('detectIoEvents 不把 execFileSync 误判为 exec', () => {
    const kinds = detectIoEvents('const r = execFileSync("git", ["log"]);', 'ts').map(h => h.kind);
    expect(kinds).toEqual(['process']);
  });
});

describe('data-flow-shape / 表达式边界', () => {
  it('多调用规则（JSON.parse(readFileSync(...))）取最外层完整表达式', () => {
    const hits = detectIoEvents("const v = JSON.parse(readFileSync(candidate, 'utf8')).version;", 'ts');
    expect(hits.map(h => h.kind)).toEqual(['config']);
    expect(hits[0].expression).toBe("JSON.parse(readFileSync(candidate, 'utf8'))");
    expect(hits[0].medium).toBe('candidate');
  });

  it('表达式在平衡闭括号处截断，不带行尾残留语法', () => {
    const hits = detectIoEvents('if (existsSync(agentDir)) {', 'ts');
    expect(hits[0].expression).toBe('existsSync(agentDir)');
    expect(hits[0].medium).toBe('agentDir');
  });

  it('图谱签名中的字面 \\n 被归一，不污染参数名', () => {
    const result = collector(
      { 'src/a.ts': 'export function f() {}' },
      [edge({ callee: 'f', calleeFile: 'src/a.ts' })],
      [symbol({ name: 'f', file: 'src/a.ts', startLine: 1, signature: '(\\n  items: PendingConfirmation[],\\n)', returnType: ': Promise<void>' })],
    );
    const stage = result.stages.find(s => s.symbol === 'f')!;
    expect(stage.inputs[0].expression).toBe('items');
    expect(stage.inputs[0].type).toBe('PendingConfirmation[]');
  });
});
