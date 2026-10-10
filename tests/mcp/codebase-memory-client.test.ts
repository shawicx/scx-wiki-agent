import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'child_process';
import { CodebaseMemoryClient } from '../../src/mcp/codebase-memory-client.js';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('CodebaseMemoryClient', () => {
  const mockExec = execFileSync as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockExec.mockReset();
  });

  it('项目名转义：路径 → MCP 标识符', () => {
    const client = new CodebaseMemoryClient('/Users/scx/proj/foo');
    expect((client as any)['projectName']).toBe('Users-scx-proj-foo');
  });

  it('getArchitecture 解析 JSON 输出', () => {
    const fakeArch = { total_nodes: 10, packages: [{ name: 'core' }] };
    mockExec.mockReturnValue(JSON.stringify(fakeArch));
    const client = new CodebaseMemoryClient('/proj');
    const result = client.getArchitecture();
    expect(result.total_nodes).toBe(10);
    expect(mockExec).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['cli', 'get_architecture']),
      expect.any(Object),
    );
  });

  it('跳过 stderr 日志行解析 JSON', () => {
    mockExec.mockReturnValue('level=info msg=test\n{"total_nodes":5}\n');
    const client = new CodebaseMemoryClient('/proj');
    const result = client.getArchitecture();
    expect(result.total_nodes).toBe(5);
  });

  it('二进制不存在时抛友好错误', () => {
    mockExec.mockImplementation(() => {
      const err = new Error('spawn ENOENT') as any;
      err.code = 'ENOENT';
      throw err;
    });
    const client = new CodebaseMemoryClient('/proj', '/nonexistent/binary');
    expect(() => client.getArchitecture()).toThrow(/未安装|not.*install/i);
  });

  it('queryGraph 透传 Cypher', () => {
    mockExec.mockReturnValue(JSON.stringify({ columns: ['n'], rows: [['a']], total: 1 }));
    const client = new CodebaseMemoryClient('/proj');
    const result = client.queryGraph('MATCH (n) RETURN n LIMIT 1');
    expect(result.columns).toEqual(['n']);
  });

  it('searchCode 支持提高返回文件数以供调用方做作用域过滤', () => {
    mockExec.mockReturnValue(JSON.stringify({
      files: ['src/index.ts', 'tests/index.test.ts'],
      total_grep_matches: 2,
    }));
    const client = new CodebaseMemoryClient('/proj');
    const result = client.searchCode('demoSymbol', 20);
    expect(result.files).toEqual(['src/index.ts', 'tests/index.test.ts']);
    const args = JSON.parse(mockExec.mock.calls[0][1][2] as string);
    expect(args.limit).toBe(20);
  });
});

describe('S6：parseJsonOutput 括号配对提取（多行 pretty JSON / JSON 日志行）', () => {
  const mockExec = execFileSync as ReturnType<typeof vi.fn>;

  it('多行 pretty-printed JSON 正确解析（按行探测会失败）', () => {
    const pretty = JSON.stringify({ total_nodes: 7, packages: [{ name: 'core', nodes: 3 }] }, null, 2);
    mockExec.mockReturnValue(pretty);
    const client = new CodebaseMemoryClient('/proj');
    expect(client.getArchitecture().total_nodes).toBe(7);
  });

  it('尾部跟随 JSON 格式日志行不被误当结果', () => {
    mockExec.mockReturnValue('{"total_nodes":5}\n{"level":"info","msg":"done","time":"2026-10-11T00:00:00Z"}\n');
    const client = new CodebaseMemoryClient('/proj');
    expect(client.getArchitecture().total_nodes).toBe(5);
  });

  it('logfmt 日志行 + 多行 JSON 混合输出：取真正的结果负载', () => {
    mockExec.mockReturnValue('level=info msg=indexing\n' + JSON.stringify({ total_nodes: 9 }, null, 2));
    const client = new CodebaseMemoryClient('/proj');
    expect(client.getArchitecture().total_nodes).toBe(9);
  });

  it('字符串内的花括号不干扰配对（含 "}" 的 JSON 字符串值）', () => {
    mockExec.mockReturnValue(JSON.stringify({ total_nodes: 1, note: 'literal } brace { inside' }));
    const client = new CodebaseMemoryClient('/proj');
    expect(client.getArchitecture().total_nodes).toBe(1);
  });
});
