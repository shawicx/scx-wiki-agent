import { describe, it, expect } from 'vitest';
import { buildSourceCorpus, verifyAbsence } from '../../src/knowledge/negative-claim.js';
import { mergeGraphSignature } from '../../src/knowledge/signature.js';
import { sanitizeEdge } from '../../src/knowledge/channels/sanitizer.js';
import { resetChannelStats, getChannelStats } from '../../src/knowledge/channels/stats.js';
import type { ContextDeps } from '../../src/knowledge/context/shared.js';
import type { CorpusFile } from '../../src/knowledge/negative-claim.js';

describe('negative-claim（负面断言第二意见）', () => {
  const corpus: CorpusFile[] = [
    { rel: 'src/a.ts', src: "const x = await invoke(cmd) // history_list 动态名", isRust: false },
    { rel: 'src-tauri/src/m.rs', src: 'pub fn history_list() {}', isRust: true },
    { rel: 'src/b.ts', src: 'export const unrelated = 1', isRust: false },
  ];

  it('suspect：裸检索命中（含注释行的名字仍算线索此处跳过注释）', () => {
    // a.ts 的命中在注释行 → 跳过；但 rust 侧定义存在（side=any 命中）
    const v = verifyAbsence(corpus, 'history_list', 'any');
    expect(v.verdict).toBe('suspect');
  });

  it('confirmed：全库确无引用才允许断言不存在', () => {
    const v = verifyAbsence(corpus, 'ghost_command', 'frontend');
    expect(v.verdict).toBe('confirmed');
  });

  it('camelCase↔snake_case 双形检索', () => {
    const c2: CorpusFile[] = [{ rel: 'src/c.ts', src: "invoke('historyList')", isRust: false }];
    const v = verifyAbsence(c2, 'history_list', 'frontend');
    expect(v.verdict).toBe('suspect');
    if (v.verdict === 'suspect') expect(v.refs[0]).toMatchObject({ file: 'src/c.ts', line: 1 });
  });

  it('排除已知锚点（监听点不是发射证据）', () => {
    const c2: CorpusFile[] = [{ rel: 'src/d.ts', src: "listen('evt-x', () => {})", isRust: false }];
    const v = verifyAbsence(c2, 'evt-x', 'any', [{ file: 'src/d.ts', line: 1 }]);
    expect(v.verdict).toBe('confirmed');
  });

  it('buildSourceCorpus 走 cache 读透', () => {
    const cache = new Map<string, string>();
    const scan: never = {
      productionFiles: [
        { absolutePath: '/tmp/x/src/a.ts', relativePath: 'src/a.ts' },
        { absolutePath: '/tmp/x/src-tauri/src/m.rs', relativePath: 'src-tauri/src/m.rs' },
      ],
    } as never;
    const files = buildSourceCorpus(scan, cache as never);
    // 无 languageDomainOf 命中的文件扩展名由 utils 判定；此处至少验证 cache 回填
    expect(cache.size).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThanOrEqual(0);
    void corpus;
  });
});

describe('mergeGraphSignature（W4 签名口径统一）', () => {
  it('Rust：signature 缺返回类型时补 `-> T`', () => {
    expect(mergeGraphSignature('(path: &Path)', 'Result<bool, String>', 'src-tauri/src/x.rs'))
      .toBe('(path: &Path) -> Result<bool, String>');
  });

  it('TS：补 `: T`；已带返回类型不再追加；字面 \\n 归一', () => {
    expect(mergeGraphSignature('(a: string)', 'Promise<void>', 'src/a.ts')).toBe('(a: string): Promise<void>');
    expect(mergeGraphSignature('(a: string): void', 'void', 'src/a.ts')).toBe('(a: string): void');
    expect(mergeGraphSignature('(a: string,\\n b: number)', null, 'src/a.ts')).toBe('(a: string, b: number)');
    expect(mergeGraphSignature(null, 'X', 'src/a.ts')).toBe('X');
    expect(mergeGraphSignature(null, null, 'src/a.ts')).toBeNull();
  });
});

describe('sanitizer（W3 通道级假边过滤）', () => {
  const deps = {
    sourceCache: new Map<string, string | null>(),
    scanResult: { rootDir: '/tmp/repo' },
  } as unknown as ContextDeps;

  it('跨语言边与非代码 callee 被拦，同域词法佐证边放行', () => {
    resetChannelStats();
    expect(sanitizeEdge(deps, {
      callerFile: 'src/a.ts', calleeFile: 'src-tauri/src/m.rs', calleeName: 'run',
    })).toBe('cross-language');
    expect(sanitizeEdge(deps, {
      callerFile: 'src/a.ts', calleeFile: 'tauri.conf.json', calleeName: 'cfg',
    })).toBe('non-code');
    deps.sourceCache.set('src/a.ts', 'doThing(); run();');
    expect(sanitizeEdge(deps, {
      callerFile: 'src/a.ts', calleeFile: 'src/b.ts', calleeName: 'doThing',
    })).toBe('ok');
    expect(sanitizeEdge(deps, {
      callerFile: 'src/a.ts', calleeFile: 'src/b.ts', calleeName: 'neverMentioned',
    })).toBe('no-lexical-evidence');
    const ef = getChannelStats().edgeFilter;
    expect(ef).toEqual({ crossLanguage: 1, nonCode: 1, noLexicalEvidence: 1 });
  });
});
