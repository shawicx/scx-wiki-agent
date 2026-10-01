import { describe, it, expect } from 'vitest';
import { WikiFallbackBuilder } from '../../src/knowledge/wiki-fallback-builder.js';
import type { DataFlowContext } from '../../src/knowledge/types.js';

function makeContext(overrides: Partial<DataFlowContext> = {}): DataFlowContext {
  return {
    sequences: [
      {
        name: 'main',
        entrySymbol: 'main',
        participants: [{ name: 'main', type: 'function', filePath: 'src/index.ts' }],
        messages: [
          {
            from: 'main', to: 'readConfig', label: 'readConfig',
            callFile: 'src/index.ts', callLine: 10,
            calleeFile: 'src/config.ts', calleeLine: 3,
            args: [{ expression: 'configPath', evidence: 'call-argument', anchor: 'src/index.ts:10' }],
            confidence: 0.95, strategy: 'lsp_ts_import',
          },
        ],
      },
    ],
    stages: [
      {
        id: 'readConfig@src/config.ts',
        name: 'readConfig',
        role: 'io-boundary',
        symbol: 'readConfig',
        file: 'src/config.ts',
        line: 3,
        inputs: [{ expression: 'configPath', type: 'string', evidence: 'call-argument', anchor: 'src/index.ts:10' }],
        outputs: [{ type: 'Config', evidence: 'graph-signature', anchor: 'src/config.ts:3' }],
        evidenceKinds: ['signature', 'call-argument', 'io'],
        dataShapeKnown: true,
      },
      {
        id: 'writeOutput@src/out.ts',
        name: 'writeOutput',
        role: 'output',
        symbol: 'writeOutput',
        file: 'src/out.ts',
        line: 20,
        // 只有表达式、未检出类型：不得被伪造成具体结构
        inputs: [{ expression: 'result', evidence: 'call-argument', anchor: 'src/index.ts:14' }],
        outputs: [{ type: 'void', evidence: 'graph-signature', anchor: 'src/out.ts:20' }],
        evidenceKinds: ['signature'],
        dataShapeKnown: false,
      },
    ],
    transitions: [
      {
        from: 'main', to: 'readConfig',
        fromFile: 'src/index.ts', toFile: 'src/config.ts',
        callFile: 'src/index.ts', callLine: 10,
        args: [{ expression: 'configPath', evidence: 'call-argument' }],
        calleeDefinition: 'src/config.ts:3',
        confidence: 0.6, strategy: 'suffix_match',
      },
    ],
    ioEvents: [
      {
        kind: 'fs-read', symbol: 'readConfig', file: 'src/config.ts', line: 4,
        expression: "readFileSync(configPath, 'utf-8')", medium: 'configPath', direction: 'input',
      },
      {
        kind: 'fs-write', symbol: 'writeOutput', file: 'src/out.ts', line: 21,
        expression: "writeFileSync(outPath, body)", medium: 'outPath', direction: 'output',
      },
    ],
    typeDefinitions: [
      {
        name: 'Config', kind: 'interface', file: 'src/config.ts', line: 1,
        text: 'export interface Config {\n  name: string;\n}',
      },
    ],
    shapeCoverage: {
      symbolsConsidered: 4,
      stages: 2,
      transitions: 1,
      dataBearingTransitions: 1,
      controlOnlyTransitions: 3,
      ioEvents: 2,
      typedStages: 1,
      unknownStages: 1,
      typeDefinitions: 1,
      approximatedBodies: 0,
    },
    ...overrides,
  };
}

describe('WikiFallbackBuilder.buildDataFlow（数据形态证据渲染）', () => {
  it('输出数据阶段表/转换表/I-O 边界表/类型定义，而不是纯调用边表', () => {
    const page = new WikiFallbackBuilder().buildDataFlow(makeContext());

    // 数据阶段表
    expect(page).toContain('## 数据阶段');
    expect(page).toContain('| 阶段 | 角色 | 输入形态 | 输出形态 | 证据 |');
    expect(page).toContain('readConfig（src/config.ts:3）');
    expect(page).toContain('I/O 边界');
    expect(page).toContain('`configPath`：string');
    expect(page).toContain('Config');

    // 阶段转换表：调用点（r.line）与 To 定义（callee start_line）分列
    expect(page).toContain('## 阶段转换');
    expect(page).toContain('| 从 | 到 | 调用实参 | 调用点 | 定义处 |');
    expect(page).toContain('src/index.ts:10');
    expect(page).toContain('src/config.ts:3');

    // I/O 边界表
    expect(page).toContain('## 输入与输出边界');
    expect(page).toContain('| 类型 | 方向 | 数据介质 | 所属阶段 | 表达式 | 位置 |');
    expect(page).toContain('读文件');
    expect(page).toContain('写文件');
    expect(page).toContain('configPath');
    expect(page).toContain('src/config.ts:4');

    // 关键数据结构
    expect(page).toContain('## 关键数据结构');
    expect(page).toContain('export interface Config');

    // 不再是纯调用边表
    expect(page).not.toContain('调用边表');
    expect(page).toContain('完整控制流与调用可达性见');
    expect(page).toContain('[calls.md](../07-reference/calls.md)');
  });

  it('未检出类型时诚实降级，不伪造成具体结构', () => {
    const page = new WikiFallbackBuilder().buildDataFlow(makeContext());
    expect(page).toContain('`result`（未检出类型）');
    expect(page).not.toContain('result：object');
  });

  it('void/Promise<void> 输出由确定性规则解释', () => {
    const page = new WikiFallbackBuilder().buildDataFlow(makeContext());
    expect(page).toContain('void（异步完成信号，无业务返回值）');
  });

  it('证据局限如实转述覆盖率与低置信度边', () => {
    const page = new WikiFallbackBuilder().buildDataFlow(makeContext());
    expect(page).toContain('## 未知项');
    expect(page).toContain('1 个阶段未检出完整类型形态');
    expect(page).toContain('另有 3 条纯控制流边');
    expect(page).toContain('低置信度图谱边');
  });

  it('无阶段/无转换时输出诚实空态并链接 calls.md', () => {
    const page = new WikiFallbackBuilder().buildDataFlow(makeContext({
      sequences: [],
      stages: [],
      transitions: [],
      ioEvents: [],
      typeDefinitions: [],
    }));
    expect(page).toContain('未采集到带数据形态证据的阶段');
    expect(page).toContain('见 [calls.md]');
    // 不允许出现 ⚠️ 待确认 填满表格（空态是一句说明，不是占位符满页）
    expect(page).not.toContain('⚠️ 待确认');
  });
});
