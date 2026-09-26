import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { findSymbolDefinitions, extractDefinedSymbolNames } from '../../src/knowledge/source-fallback.js';
import type { ScanResult } from '../../src/core/scanner.js';

function makeScanResult(rootDir: string, rels: string[]): ScanResult {
  return {
    rootDir,
    files: rels.map(rel => ({
      absolutePath: join(rootDir, rel),
      relativePath: rel,
      language: 'typescript' as const,
      extension: rel.endsWith('.rs') ? '.rs' : rel.endsWith('.vue') ? '.vue' : '.ts',
      size: 100,
    })),
    techStack: [],
    projectType: 'unknown',
    hasTypeScript: true,
    sourceDirs: [],
  };
}

describe('source-fallback', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'src-fallback-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('解析 TS 函数/常量/类定义（带行号与签名）', () => {
    writeFileSync(join(tmp, 'a.ts'), [
      'import x from "y"',
      '',
      'export function connectHeadless(opts: Opts) {',
      '  return 1',
      '}',
      '',
      'export const MAX_RETRY = 3;',
      '',
      'export class SshSession {}',
    ].join('\n'));

    const found = findSymbolDefinitions(
      ['connectHeadless', 'MAX_RETRY', 'SshSession'],
      makeScanResult(tmp, ['a.ts']),
      new Map(),
    );
    const byName = new Map(found.map(f => [f.name, f]));
    expect(byName.get('connectHeadless')).toMatchObject({ file: 'a.ts', startLine: 3, type: 'function' });
    expect(byName.get('MAX_RETRY')).toMatchObject({ file: 'a.ts', startLine: 7, type: 'variable' });
    expect(byName.get('SshSession')).toMatchObject({ file: 'a.ts', startLine: 9, type: 'class' });
    expect(byName.get('connectHeadless')?.signature).toContain('connectHeadless');
  });

  it('解析 Rust pub async fn / struct / impl', () => {
    writeFileSync(join(tmp, 'main.rs'), [
      'use tauri::Manager;',
      '',
      'pub async fn accept_ssh_connection(id: String) -> Result<(), Error> {',
      '    Ok(())',
      '}',
      '',
      'pub struct PtyHandle {',
      '    pub pid: u32,',
      '}',
      '',
      'impl PtyHandle {',
      '    pub fn new() -> Self { Self { pid: 0 } }',
      '}',
    ].join('\n'));

    const found = findSymbolDefinitions(
      ['accept_ssh_connection', 'PtyHandle'],
      makeScanResult(tmp, ['main.rs']),
      new Map(),
    );
    const byName = new Map(found.map(f => [f.name, f]));
    expect(byName.get('accept_ssh_connection')).toMatchObject({ file: 'main.rs', startLine: 3, type: 'function' });
    expect(byName.get('PtyHandle')).toMatchObject({ file: 'main.rs', startLine: 7, type: 'class' });
  });

  it('跳过测试路径；Vue SFC 内定义可命中；名字去重且全找到提前退出', () => {
    mkdirSync(join(tmp, 'src'));
    writeFileSync(join(tmp, 'src/Comp.vue'), [
      '<script setup lang="ts">',
      'async function reloadMirrorList() {',
      '  await Promise.resolve()',
      '}',
      '</script>',
    ].join('\n'));
    // 测试路径中的同名符号不应被采纳
    mkdirSync(join(tmp, 'src/__tests__'));
    writeFileSync(join(tmp, 'src/__tests__/fake.test.ts'), 'export function reloadMirrorList() {}\n');
    // 提前退出：fooBarOnlyInLateFile 不应再被扫（排在后面的文件含干扰名）
    writeFileSync(join(tmp, 'zz.ts'), 'export function decoy() {}\n');

    const found = findSymbolDefinitions(
      ['reloadMirrorList'],
      makeScanResult(tmp, ['src/Comp.vue', 'src/__tests__/fake.test.ts', 'zz.ts']),
      new Map(),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'src/Comp.vue', startLine: 2, type: 'function' });
  });

  it('extractDefinedSymbolNames 对指定文件全量提取定义名', () => {
    writeFileSync(join(tmp, 'a.ts'), [
      'export function foo() {}',
      'export const bar = 1;',
      'export interface Baz {}',
    ].join('\n'));

    const names = extractDefinedSymbolNames(['a.ts'], makeScanResult(tmp, ['a.ts']), new Map());
    expect([...names].sort()).toEqual(['Baz', 'bar', 'foo']);
  });
});
