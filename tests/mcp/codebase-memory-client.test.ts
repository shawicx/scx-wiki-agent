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
});
