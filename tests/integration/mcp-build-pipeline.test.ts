import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { CodebaseMemoryClient } from '../../src/mcp/codebase-memory-client.js';

const BINARY = process.env.CODEBASE_MEMORY_MCP_BINARY
  ?? '/Users/scx/.local/bin/codebase-memory-mcp';
const binaryExists = existsSync(BINARY);

/**
 * 真实 MCP 集成测试。需要本机安装 codebase-memory-mcp。
 * 无二进制时自动跳过（CI 环境友好）。
 */
describe.skipIf(!binaryExists)('MCP 集成测试（需真实 codebase-memory-mcp）', () => {
  // 真实二进制的索引/查询是重操作，放宽到 60s（客户端 exec 超时为 120s）
  it('ensureIndexed + getArchitecture 端到端', { timeout: 60_000 }, () => {
    const client = new CodebaseMemoryClient(process.cwd(), BINARY);
    const idx = client.ensureIndexed('fast');
    expect(idx.status).toBe('indexed');
    expect(idx.nodes).toBeGreaterThan(0);

    const arch = client.getArchitecture();
    expect(arch.packages.length).toBeGreaterThan(0);
    expect(arch.entry_points.length).toBeGreaterThan(0);
  });

  it('queryGraph Cypher 返回符号', { timeout: 60_000 }, () => {
    const client = new CodebaseMemoryClient(process.cwd(), BINARY);
    const q = client.queryGraph('MATCH (n:Class) RETURN n.name AS name LIMIT 3');
    expect(q.rows.length).toBeGreaterThan(0);
  });

  it('tracePath 返回调用链', { timeout: 60_000 }, () => {
    const client = new CodebaseMemoryClient(process.cwd(), BINARY);
    const trace = client.tracePath('registerBuildCommand', 'outbound', 3);
    expect(trace.callees?.length ?? 0).toBeGreaterThan(0);
  });
});
