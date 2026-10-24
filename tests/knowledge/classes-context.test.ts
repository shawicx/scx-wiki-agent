/**
 * classes 页上下文：Swift 类型口径（Struct/Interface/Actor）+ 行预算 + kind 列。
 * 背景：旧查询只匹配 Class 标签且未提高行预算——实测双端仓库 588 行类×方法对
 * 被客户端默认 100 行截断，字母序靠前的大类吃光配额，整页只剩 1 个类。
 */

import { describe, it, expect } from 'vitest';
import { WikiContextBuilder } from '../../src/knowledge/wiki-context-builder.js';
import { createMockClient } from '../helpers/mock-mcp-client.js';
import type { QueryResult } from '../../src/mcp/types.js';
import { makeScanResult } from './context/helpers.js';

const CLASSES_CYPHER = `MATCH (c)-[:DEFINES_METHOD]->(m:Method)
       WHERE ((c:Class) OR ((c:Struct OR c:Interface OR c:Actor) AND c.file_path ENDS WITH '.swift'))
             AND c.is_test = false
       RETURN c.label AS kind, c.name AS cls, c.qualified_name AS qn, c.file_path AS cfile,
              c.start_line AS cline, m.name AS mname, m.signature AS msig, m.visibility AS mvis,
              m.docstring AS mdoc, m.file_path AS mfile, m.start_line AS mline, m.return_type AS mrt
       ORDER BY c.name, m.start_line LIMIT 2000`;

const row = (kind: string, cls: string, cfile: string, method: string): any[] =>
  [kind, cls, `${cls}QN`, cfile, 10, method, 'sig()', 'public', null, cfile, 20, null];

describe('buildClassesContext', () => {
  it('Swift Struct/Interface/Actor 计入清单并携带 kind；查询行预算 2000', () => {
    const queryResults = new Map<string, QueryResult>([
      [CLASSES_CYPHER, {
        columns: [],
        rows: [
          row('Class', 'AppModel', 'macos/Sources/NexviaApp/AppModel.swift', 'load'),
          row('Struct', 'SubscriptionParser', 'macos/Sources/NexviaCore/SubscriptionParser.swift', 'parse'),
          row('Interface', 'Repository', 'macos/Sources/NexviaCore/Repository.swift', 'fetch'),
          row('Actor', 'CaptureEngine', 'macos/Sources/NexviaCore/CaptureEngine.swift', 'start'),
          // Rust struct（非 .swift 文件）不入选口径：此行仅防御性存在，正常查询不会返回
          row('Class', 'KotlinService', 'android/app/src/main/java/com/scx/nexvia/core/Svc.kt', 'run'),
          // 测试路径文件过滤
          row('Class', 'TestClass', 'macos/Tests/AppTests/AppTests.swift', 'testExample'),
        ],
        total: 6,
      }],
    ]);
    const client = createMockClient({ queryResults });
    const scan = makeScanResult({
      files: [
        { absolutePath: '/t/macos/Sources/NexviaApp/AppModel.swift', relativePath: 'macos/Sources/NexviaApp/AppModel.swift', language: 'swift' as const, extension: '.swift', size: 10 },
        { absolutePath: '/t/macos/Sources/NexviaCore/SubscriptionParser.swift', relativePath: 'macos/Sources/NexviaCore/SubscriptionParser.swift', language: 'swift' as const, extension: '.swift', size: 10 },
        { absolutePath: '/t/macos/Sources/NexviaCore/Repository.swift', relativePath: 'macos/Sources/NexviaCore/Repository.swift', language: 'swift' as const, extension: '.swift', size: 10 },
        { absolutePath: '/t/macos/Sources/NexviaCore/CaptureEngine.swift', relativePath: 'macos/Sources/NexviaCore/CaptureEngine.swift', language: 'swift' as const, extension: '.swift', size: 10 },
        { absolutePath: '/t/android/app/src/main/java/com/scx/nexvia/core/Svc.kt', relativePath: 'android/app/src/main/java/com/scx/nexvia/core/Svc.kt', language: 'kotlin' as const, extension: '.kt', size: 10 },
      ],
    });
    const builder = new WikiContextBuilder(client as any, scan);
    const ctx = builder.buildClassesContext();

    // 行预算：客户端 queryGraph 第二实参（默认 100 会截断大类仓库）
    expect(client.queryGraph).toHaveBeenCalledWith(CLASSES_CYPHER, 2000);
    const byName = new Map(ctx.classes.map(c => [c.name, c]));
    expect(byName.size).toBe(5);
    expect(byName.get('SubscriptionParser')?.kind).toBe('Struct');
    expect(byName.get('Repository')?.kind).toBe('Interface');
    expect(byName.get('CaptureEngine')?.kind).toBe('Actor');
    expect(byName.get('AppModel')?.kind).toBe('Class');
    // 方法行映射（kind 列插入后索引整体右移一位）
    expect(byName.get('AppModel')?.methods[0]?.name).toBe('load');
    expect(byName.get('AppModel')?.methods[0]?.signature).toContain('sig()');
    // 测试路径文件过滤
    expect(byName.has('TestClass')).toBe(false);
  });
});
