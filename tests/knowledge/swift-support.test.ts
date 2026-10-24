/**
 * Swift 实验性语言支持测试：定义/常量模式、注释意图证据、I/O 扫描、
 * scanner 原生 import 指标、SPM/CocoaPods 运行态与 env 提取。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileScanner } from '../../src/core/scanner.js';
import {
  nativeTopLevelDef,
  nativeDefinedNameOn,
  nativeDefinitionPatterns,
  NATIVE_CONST_DEF_RE,
} from '../../src/shared/language-patterns.js';
import { collectCommentEvidence } from '../../src/knowledge/intent/comments.js';
import { detectIoEvents } from '../../src/knowledge/dataflow/io-scan.js';
import { ConfigDetector } from '../../src/knowledge/config-detector.js';

let dir: string;
const write = (rel: string, content: string) => {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
};

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'swift-support-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Swift 定义与常量模式', () => {
  it('class/struct/func 顶层定义（含修饰符与属性前缀）', () => {
    expect(nativeTopLevelDef('public struct ApiClient {', 'swift')?.name).toBe('ApiClient');
    expect(nativeTopLevelDef('func loadConfig(path: String) throws {', 'swift')?.name).toBe('loadConfig');
    expect(nativeTopLevelDef('final class UserService {', 'swift')?.name).toBe('UserService');
    expect(nativeTopLevelDef('@MainActor class AppModel {', 'swift')?.name).toBe('AppModel');
    expect(nativeTopLevelDef('extension UserDefaults {', 'swift')?.name).toBe('UserDefaults');
    expect(nativeTopLevelDef('// func commentedOut() {', 'swift')).toBeNull();
  });

  it('lowerCamelCase 限制常量（static let / 带类型注解 / 全大写顶层）', () => {
    expect('static let maxRetryCount = 3'.match(NATIVE_CONST_DEF_RE.swift)?.[1]).toBe('maxRetryCount');
    expect('let TIMEOUT_SECONDS: TimeInterval = 30'.match(NATIVE_CONST_DEF_RE.swift)?.[1]).toBe('TIMEOUT_SECONDS');
    expect('private static var cacheSizeLimit: Int = 512'.match(NATIVE_CONST_DEF_RE.swift)?.[1]).toBe('cacheSizeLimit');
    expect('let greeting = "hi"'.match(NATIVE_CONST_DEF_RE.swift)).toBeNull();
  });

  it('定义行分类（source-fallback 符号回落用；注释/局部 let 不产幽灵符号）', () => {
    expect(nativeDefinedNameOn('func parseConfig() -> Config', 'swift')).toEqual({ name: 'parseConfig', type: 'function' });
    expect(nativeDefinedNameOn('private func refreshTokens()', 'swift')).toEqual({ name: 'refreshTokens', type: 'function' });
    expect(nativeDefinedNameOn('class UserService: ObservableObject', 'swift')).toEqual({ name: 'UserService', type: 'class' });
    expect(nativeDefinedNameOn('protocol Repository {', 'swift')).toEqual({ name: 'Repository', type: 'interface' });
    expect(nativeDefinedNameOn('extension UserDefaults {', 'swift')).toEqual({ name: 'UserDefaults', type: 'class' });
    expect(nativeDefinedNameOn('static let shared = ApiClient()', 'swift')).toEqual({ name: 'shared', type: 'variable' });
    expect(nativeDefinedNameOn('// func fakeMethod()', 'swift')).toBeNull();
    expect(nativeDefinedNameOn(' * class DocOnly', 'swift')).toBeNull();
    expect(nativeDefinedNameOn('let localValue = 42', 'swift')).toBeNull();
  });

  it('名字驱动定义探测（data-flow body-range 用）', () => {
    expect(nativeDefinitionPatterns('parseConfig', 'swift')[0].test('func parseConfig() throws {')).toBe(true);
    expect(nativeDefinitionPatterns('UserService', 'swift')[1].test('final class UserService {')).toBe(true);
  });
});

describe('Swift 注释意图证据', () => {
  it('// 文件头 + 符号注释 + 常量尾注释', () => {
    const src = [
      '// 网络层客户端：统一处理请求重试与鉴权。',
      'import Foundation',
      '',
      '// 加载远程配置并合并本地缺省值。',
      'func loadRemoteConfig() throws -> Config {',
      '    return Config()',
      '}',
      '',
      'static let maxRetryCount = 3  // 重试上限',
    ].join('\n');
    const evidence = collectCommentEvidence('Sources/ApiClient.swift', src, 'swift');
    expect(evidence.some(e => e.kind === 'file-header' && e.text.includes('请求重试'))).toBe(true);
    expect(evidence.some(e => e.kind === 'symbol-comment' && e.target.symbol === 'loadRemoteConfig')).toBe(true);
    expect(evidence.some(e => e.kind === 'const-comment' && e.target.symbol === 'maxRetryCount' && e.text.includes('重试上限'))).toBe(true);
  });
});

describe('Swift I/O 扫描', () => {
  it('String(contentsOf:)/FileManager/ProcessInfo.environment/Process()/print/write(to:)', () => {
    const hits = [
      ...detectIoEvents('let text = try String(contentsOf: configURL, encoding: .utf8)', 'swift'),
      ...detectIoEvents('let data = FileManager.default.contents(atPath: path)', 'swift'),
      ...detectIoEvents('let key = ProcessInfo.processInfo.environment["API_KEY"]', 'swift'),
      ...detectIoEvents('let mode = Environment.get("APP_MODE")', 'swift'),
      ...detectIoEvents('let task = Process()', 'swift'),
      ...detectIoEvents('print("done")', 'swift'),
      ...detectIoEvents('try data.write(to: cacheURL)', 'swift'),
    ];
    expect(hits.some(h => h.kind === 'fs-read')).toBe(true);
    // 标签实参形态下 medium 含 label 前缀（contentsOf: …），表达式范围正确
    const labelRead = hits.find(h => h.kind === 'fs-read' && h.medium?.startsWith('contentsOf:'));
    expect(labelRead?.expression).toContain('String(contentsOf: configURL');
    expect(hits.find(h => h.kind === 'env' && h.medium === 'process.env.API_KEY')).toBeTruthy();
    expect(hits.find(h => h.kind === 'env' && h.medium === 'process.env.APP_MODE')).toBeTruthy();
    expect(hits.some(h => h.kind === 'process')).toBe(true);
    expect(hits.some(h => h.kind === 'stdout')).toBe(true);
    expect(hits.some(h => h.kind === 'fs-write')).toBe(true);
  });
});

describe('Swift scanner 与运行态', () => {
  it('Vapor import → backend；ArgumentParser → cli；SPM 测试路径归测试口径', () => {
    write('swiftapp/Sources/main.swift', 'import Vapor\n\nlet app = try await Application.make()\n');
    write('swiftapp/Tests/AppTests/AppTests.swift', '@testable import App\n');
    const scan = new FileScanner(join(dir, 'swiftapp')).scan();
    expect(scan.techStack).toContain('vapor');
    expect(scan.projectType).toBe('backend');
    expect(scan.sourceDirs).toContain('Sources');
    expect(scan.productionFiles.some(f => f.relativePath === 'Sources/main.swift')).toBe(true);
    expect(scan.testFiles.some(f => f.relativePath === 'Tests/AppTests/AppTests.swift')).toBe(true);
    write('swiftcli/Sources/main.swift', 'import ArgumentParser\n\n@main struct Cli: AsyncCommand {}\n');
    const cliScan = new FileScanner(join(dir, 'swiftcli')).scan();
    expect(cliScan.projectType).toBe('cli');
  });

  it('Package.swift → Swift/spm（name + swift-tools-version）；ProcessInfo.environment / Environment.get 提取', () => {
    write('swiftenv/Package.swift', '// swift-tools-version:5.9\nimport PackageDescription\n\nlet package = Package(name: "SvcKit")\n');
    write('swiftenv/Sources/main.swift', [
      'import Foundation',
      'let key = ProcessInfo.processInfo.environment["API_KEY"]',
      'let mode = ProcessInfo.processInfo.environment["APP_MODE"] ?? "dev"',
      'let region = Environment.get("AWS_REGION")',
    ].join('\n'));
    const env = new ConfigDetector(join(dir, 'swiftenv')).detectEnvironment();
    expect(env.runtime).toBe('Swift');
    expect(env.packageManager).toBe('swift package manager');
    expect(env.packageName).toBe('SvcKit');
    expect(env.version).toBe('5.9');
    const names = env.envVars.map(v => v.name);
    expect(names).toContain('API_KEY');
    expect(names).toContain('APP_MODE');
    expect(names).toContain('AWS_REGION');
    expect(env.envVars.find(v => v.name === 'API_KEY')?.sensitive).toBe(true);
    expect(env.envVars.find(v => v.name === 'APP_MODE')?.purpose).toBe('缺省值 "dev"');
  });

  it('Podfile（无 Package.swift）→ Swift/cocoapods', () => {
    write('podsrepo/Podfile', "platform :ios, '17.0'\ntarget 'App' do\n  pod 'Alamofire'\nend\n");
    const env = new ConfigDetector(join(dir, 'podsrepo')).detectEnvironment();
    expect(env.runtime).toBe('Swift');
    expect(env.packageManager).toBe('cocoapods');
  });
});
