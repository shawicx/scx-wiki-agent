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
} from '../../../src/knowledge/data-flow-shape.js';

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
