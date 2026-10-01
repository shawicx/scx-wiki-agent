import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileScanner } from '../../src/core/scanner.js';
import { isTestPath, languageDomainOf, getFileLanguage } from '../../src/shared/utils.js';
import { nativeTopLevelDef, nativeDefinedNameOn, nativeDefinitionPatterns } from '../../src/shared/language-patterns.js';
import { NATIVE_CONST_DEF_RE } from '../../src/shared/language-patterns.js';
import { collectCommentEvidence } from '../../src/knowledge/intent/comments.js';
import { detectIoEvents } from '../../src/knowledge/dataflow/io-scan.js';
import { ConfigDetector } from '../../src/knowledge/config-detector.js';

let dir: string;
const write = (rel: string, content: string) => {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
};

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'multilang-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('语言域与测试路径', () => {
  it('扩展扩展名映射到语言/域', () => {
    expect(getFileLanguage('a.py')).toBe('python');
    expect(getFileLanguage('a.go')).toBe('go');
    expect(getFileLanguage('A.java')).toBe('java');
    expect(getFileLanguage('a.kt')).toBe('kotlin');
    expect(languageDomainOf('app.py')).toBe('python');
    expect(languageDomainOf('main.go')).toBe('go');
    expect(languageDomainOf('App.java')).toBe('jvm');
    expect(languageDomainOf('App.kt')).toBe('jvm');
  });

  it('各语言测试路径判定', () => {
    expect(isTestPath('tests/test_app.py')).toBe(true);
    expect(isTestPath('test_app.py')).toBe(true);
    expect(isTestPath('conftest.py')).toBe(true);
    expect(isTestPath('pkg/server_test.go')).toBe(true);
    expect(isTestPath('src/main.go')).toBe(false);
    expect(isTestPath('app.py')).toBe(false);
  });
});

describe('原生语言定义/常量模式', () => {
  it('Python：def/class 顶层定义 + UPPER_SNAKE 常量', () => {
    expect(nativeTopLevelDef('def load_config(path):', 'python')?.name).toBe('load_config');
    expect(nativeTopLevelDef('class UserService:', 'python')?.name).toBe('UserService');
    expect(nativeTopLevelDef('MAX_RETRIES == 3', 'python')).toBeNull();
    const m = 'MAX_RETRIES = 10  # 重试上限'.match(NATIVE_CONST_DEF_RE.python);
    expect(m?.[1]).toBe('MAX_RETRIES');
    expect(nativeDefinedNameOn('TIMEOUT_SECONDS = 30', 'python')).toEqual({ name: 'TIMEOUT_SECONDS', type: 'variable' });
  });

  it('Go：func/type 定义 + const 常量', () => {
    expect(nativeTopLevelDef('func main() {', 'go')?.name).toBe('main');
    expect(nativeTopLevelDef('func (s *Server) Start() error {', 'go')?.name).toBe('Start');
    expect(nativeTopLevelDef('type Config struct {', 'go')?.name).toBe('Config');
    expect('MAX_OPEN_FILES = 512'.match(NATIVE_CONST_DEF_RE.go)).toBeNull();
    expect('const MAX_OPEN_FILES = 512'.match(NATIVE_CONST_DEF_RE.go)?.[1]).toBe('MAX_OPEN_FILES');
    expect('const MaxPageSize = 100'.match(NATIVE_CONST_DEF_RE.go)?.[1]).toBe('MaxPageSize'); // Go 惯用 CamelCase
  });

  it('JVM：class/fun 定义 + static final 常量', () => {
    expect(nativeTopLevelDef('public class Application {', 'jvm')?.name).toBe('Application');
    expect(nativeTopLevelDef('fun refreshToken(): Token {', 'jvm')?.name).toBe('refreshToken');
    expect('static final int MAX_POOL_SIZE = 20;'.match(NATIVE_CONST_DEF_RE.jvm)?.[1]).toBe('MAX_POOL_SIZE');
    expect('const val CACHE_TTL_SECONDS = 60L'.match(NATIVE_CONST_DEF_RE.jvm)?.[1]).toBe('CACHE_TTL_SECONDS');
  });

  it('名字驱动定义探测（data-flow body-range 用）', () => {
    expect(nativeDefinitionPatterns('load_config', 'python')[0].test('def load_config(path):')).toBe(true);
    expect(nativeDefinitionPatterns('Start', 'go')[0].test('func (s *Server) Start() error {')).toBe(true);
  });
});

describe('注释提取：# 注释与 docstring', () => {
  it('Python 模块 docstring 成为文件头自述', () => {
    const src = [
      '#!/usr/bin/env python3',
      '"""',
      '配置加载模块：负责从多来源合并配置并校验。',
      '"""',
      'def load_config():',
      '    pass',
    ].join('\n');
    const evidence = collectCommentEvidence('config.py', src, 'python');
    const header = evidence.find(e => e.kind === 'file-header');
    expect(header?.text).toContain('配置加载模块');
    expect(header?.anchor).toBe('config.py:1');
  });

  it('Go // 文件头 + 符号注释 + why-marker', () => {
    const src = [
      '// Package server 提供多协议接入的统一服务端入口。',
      'package server',
      '',
      '// Start 启动监听循环。',
      '// TODO: 优雅退出尚未实现',
      'func Start() {',
      '}',
    ].join('\n');
    const evidence = collectCommentEvidence('server.go', src, 'go');
    expect(evidence.some(e => e.kind === 'file-header' && e.text.includes('统一服务端入口'))).toBe(true);
    expect(evidence.some(e => e.kind === 'symbol-comment' && e.target.symbol === 'Start')).toBe(true);
    expect(evidence.some(e => e.kind === 'why-marker' && e.text.includes('TODO'))).toBe(true);
  });

  it('Python 常量尾注释（# 形态）提取', () => {
    const src = 'MAX_QPS = 1000  # 网关限流上限\n';
    const evidence = collectCommentEvidence('limits.py', src, 'python');
    expect(evidence.some(e => e.kind === 'const-comment' && e.target.symbol === 'MAX_QPS' && e.text.includes('限流'))).toBe(true);
  });
});

describe('I/O 扫描：原生语言规则', () => {
  it('Python：open/os.environ/subprocess/print', () => {
    const hits = [
      ...detectIoEvents("cfg = open(path, 'r')", 'python'),
      ...detectIoEvents("key = os.environ['API_KEY']", 'python'),
      ...detectIoEvents("out = subprocess.run(['ls'], capture_output=True)", 'python'),
      ...detectIoEvents("print('done')", 'python'),
    ];
    expect(hits.some(h => h.kind === 'fs-read')).toBe(true);
    expect(hits.find(h => h.kind === 'env')?.medium).toBe('process.env.API_KEY');
    expect(hits.some(h => h.kind === 'process')).toBe(true);
    expect(hits.some(h => h.kind === 'stdout')).toBe(true);
  });

  it('Go：os.ReadFile/os.Getenv/fmt.Println', () => {
    const hits = [
      ...detectIoEvents('data, err := os.ReadFile(path)', 'go'),
      ...detectIoEvents('v := os.Getenv("APP_MODE")', 'go'),
      ...detectIoEvents('fmt.Println("ok")', 'go'),
    ];
    expect(hits.some(h => h.kind === 'fs-read')).toBe(true);
    expect(hits.find(h => h.kind === 'env')?.medium).toBe('process.env.APP_MODE');
    expect(hits.some(h => h.kind === 'stdout')).toBe(true);
  });

  it('JVM：Files.readString/System.getenv/println', () => {
    const hits = [
      ...detectIoEvents('var text = Files.readString(path);', 'jvm'),
      ...detectIoEvents('String key = System.getenv("API_KEY");', 'jvm'),
      ...detectIoEvents('System.out.println("done");', 'jvm'),
    ];
    expect(hits.some(h => h.kind === 'fs-read')).toBe(true);
    expect(hits.find(h => h.kind === 'env')?.medium).toBe('process.env.API_KEY');
    expect(hits.some(h => h.kind === 'stdout')).toBe(true);
  });
});

describe('scanner：原生 import 技术栈与项目类型', () => {
  it('Python：fastapi import → backend 项目类型', () => {
    write('pyapp/__main__.py', 'from fastapi import FastAPI\n\napp = FastAPI()\n');
    write('pyapp/test_main.py', 'from fastapi.testclient import TestClient\n');
    const scan = new FileScanner(join(dir, 'pyapp')).scan();
    expect(scan.techStack).toContain('fastapi-py');
    expect(scan.projectType).toBe('backend');
    expect(scan.productionFiles.some(f => f.relativePath === '__main__.py')).toBe(true);
    expect(scan.testFiles.some(f => f.relativePath === 'test_main.py')).toBe(true);
  });

  it('Go：gin import → backend；cobra → cli', () => {
    write('goapp/main.go', 'package main\n\nimport "github.com/gin-gonic/gin"\n\nfunc main() {}\n');
    const scan = new FileScanner(join(dir, 'goapp')).scan();
    expect(scan.techStack).toContain('gin');
    expect(scan.projectType).toBe('backend');
    write('gocli/main.go', 'package main\n\nimport "github.com/spf13/cobra"\n\nfunc main() {}\n');
    const cliScan = new FileScanner(join(dir, 'gocli')).scan();
    expect(cliScan.projectType).toBe('cli');
  });
});

describe('非 node 运行态与 env 提取', () => {
  it('pyproject.toml → Python/poetry；os.environ 提取', () => {
    write('pyenv/pyproject.toml', '[tool.poetry]\nname = "svc"\nversion = "0.3.1"\n');
    write('pyenv/src/app.py', "import os\nkey = os.environ['SVC_TOKEN']\nmode = os.getenv('APP_MODE', 'dev')\n");
    const detector = new ConfigDetector(join(dir, 'pyenv'));
    const env = detector.detectEnvironment();
    expect(env.runtime).toBe('Python');
    expect(env.packageManager).toBe('poetry');
    expect(env.packageName).toBe('svc');
    const names = env.envVars.map(v => v.name);
    expect(names).toContain('SVC_TOKEN');
    expect(names).toContain('APP_MODE');
    expect(env.envVars.find(v => v.name === 'APP_MODE')?.purpose).toBe("缺省值 'dev'");
  });

  it('go.mod → Go/go modules；System.getenv 提取（jvm 由 detector 域分发）', () => {
    write('goenv/go.mod', 'module example.com/svc\n\ngo 1.22\n');
    write('goenv/src/main.go', 'package main\n\nimport "os"\n\nfunc main() {\n\tv := os.Getenv("APP_MODE")\n\t_ = v\n}\n');
    const env = new ConfigDetector(join(dir, 'goenv')).detectEnvironment();
    expect(env.runtime).toBe('Go');
    expect(env.packageManager).toBe('go modules');
    expect(env.packageName).toBe('example.com/svc');
    expect(env.envVars.map(v => v.name)).toContain('APP_MODE');
  });
});
