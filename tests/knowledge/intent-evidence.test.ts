import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import {
  IntentEvidenceProvider,
  countIntentEvidence,
} from '../../src/knowledge/intent-evidence.js';
import type { GitRunner } from '../../src/knowledge/intent-evidence.js';
import type { ScanResult, ScannedFile } from '../../src/core/scanner.js';

/** 在真实 root 下写文件并生成对应的扫描清单项（absolutePath 必须指向真实文件） */
function file(root: string, rel: string, content: string): ScannedFile {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  return {
    absolutePath: abs,
    relativePath: rel,
    language: 'typescript' as const,
    extension: rel.endsWith('.rs') ? '.rs' : rel.endsWith('.md') ? '.md' : '.ts',
    size: content.length,
  };
}

function makeScanResult(files: ScannedFile[], rootDir = '/fake-root'): ScanResult {
  const scopedFiles = files.map(f => ({
    ...f,
    scope: f.scope ?? ('production' as const),
  }));
  return {
    rootDir,
    files: scopedFiles,
    techStack: [],
    testTechStack: [],
    projectType: 'cli',
    hasTypeScript: true,
    sourceDirs: ['src'],
    productionFiles: scopedFiles.filter(f => f.scope === 'production'),
    testFiles: scopedFiles.filter(f => f.scope === 'test'),
    fileCounts: {
      total: scopedFiles.length,
      production: scopedFiles.filter(f => f.scope === 'production').length,
      test: scopedFiles.filter(f => f.scope === 'test').length,
    },
  };
}

/** 无 git 环境（fail-open：全部 git 通道返回 null） */
const noGit: GitRunner = () => null;

describe('IntentEvidenceProvider 注释挖掘', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'intent-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('提取文件头自述 / 符号紧邻注释 / why-marker / 常量注释（TS）', () => {
    const scan = file(root, 'src/core/scanner.ts', [
      '/**',
      ' * 文件扫描器：递归遍历项目目录，识别技术栈。',
      ' * 为什么不用 glob：需要 gitignore 感知。',
      ' */',
      'export class Scanner {',
      '  // TODO: 处理 symlink 循环',
      '  scan() {}',
      '}',
      '',
      '// 防止超大仓库把内存打爆',
      'export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 单文件上限 100MB',
    ].join('\n'));
    const provider = new IntentEvidenceProvider(makeScanResult([scan], root), { runGit: noGit });

    const comments = provider.fileComments(['src/core/scanner.ts']);
    const kinds = comments.map(c => c.kind);

    expect(kinds).toContain('file-header');
    expect(comments.find(c => c.kind === 'file-header')!.text).toContain('gitignore 感知');
    expect(comments.find(c => c.kind === 'file-header')!.anchor).toBe('src/core/scanner.ts:1');

    const marker = comments.find(c => c.kind === 'why-marker');
    expect(marker?.text).toContain('TODO');
    expect(marker?.text).toContain('symlink');

    const constComment = comments.find(c => c.kind === 'const-comment');
    expect(constComment?.target.symbol).toBe('MAX_FILE_SIZE');
    expect(constComment?.text).toContain('100MB');
  });

  it('Rust 文件头与顶层定义注释可提取', () => {
    const scan = file(root, 'src-tauri/src/main.rs', [
      '// prevented deadlocks by bounding the channel',
      'pub fn run() {}',
    ].join('\n'));
    const provider = new IntentEvidenceProvider(makeScanResult([scan], root), { runGit: noGit });

    const comments = provider.fileComments(['src-tauri/src/main.rs']);
    expect(comments.some(c => c.kind === 'file-header' && c.text.includes('deadlocks'))).toBe(true);
  });

  it('长令牌脱敏 + 文本截断到预算', () => {
    const secret = 'a'.repeat(64);
    const long = 'x'.repeat(400);
    const scan = file(root, 'src/a.ts', `// ${secret} ${long}\nexport const A = 1;`);
    const provider = new IntentEvidenceProvider(makeScanResult([scan], root), { runGit: noGit });

    const header = provider.fileComments(['src/a.ts']).find(c => c.kind === 'file-header')!;
    expect(header.text).toContain('[REDACTED]');
    expect(header.text.length).toBeLessThanOrEqual(240);
    expect(header.text).not.toContain(secret);
  });

  it('版权/shebang 头被跳过，过短注释不算文件头', () => {
    const scan = file(root, 'src/b.ts', [
      '#!/usr/bin/env node',
      '// Copyright 2026 Acme',
      'export const B = 1;',
    ].join('\n'));
    const provider = new IntentEvidenceProvider(makeScanResult([scan], root), { runGit: noGit });

    expect(provider.fileComments(['src/b.ts']).some(c => c.kind === 'file-header')).toBe(false);
  });

  it('constComments 只保留常量注释；whyMarkers 全仓采样限额', () => {
    const files = [
      file(root, 'src/limit.ts', '// 上限：接口限流\nexport const MAX_QPS = 1000;'),
      file(root, 'src/a.ts', '// NOTE: a\nexport const A = 1;'),
      file(root, 'src/b.ts', '// FIXME: b\nexport const B = 1;'),
    ];
    const provider = new IntentEvidenceProvider(makeScanResult(files, root), { runGit: noGit });

    expect(provider.constComments(['src/limit.ts'])).toHaveLength(1);
    expect(provider.whyMarkers(1)).toHaveLength(1);
  });
});

describe('IntentEvidenceProvider git 挖掘', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'intent-git-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const LOG_A = [
    'hash1111111111111111111111111111111111111111\t2026-09-01\tfeat: support global config',
    'hash2222222222222222222222222222222222222222\t2026-06-01\tinit scanner',
  ].join('\n');
  const LOG_B = 'hash3333333333333333333333333333333333333333\t2026-07-15\tfeat: support tauri ipc\n';

  function gitRunner(logs: Record<string, string>, repoLog = ''): GitRunner {
    return args => {
      if (args[0] === 'rev-parse') return 'HEADSHA\n';
      if (args[0] === 'log') {
        const target = args[args.length - 1];
        if (target in logs) return logs[target];
        return repoLog;
      }
      return null;
    };
  }

  it('gitForFile 解析首末提交；runner 失败后整通道静默', () => {
    const f = file(root, 'src/a.ts', 'export const A = 1;');
    const provider = new IntentEvidenceProvider(makeScanResult([f], root), {
      runGit: gitRunner({ 'src/a.ts': LOG_A }),
    });
    const info = provider.gitForFile('src/a.ts')!;
    expect(info.count).toBe(2);
    expect(info.last!.subject).toBe('feat: support global config');
    expect(info.first!.subject).toBe('init scanner');

    const broken = new IntentEvidenceProvider(makeScanResult([f], root), { runGit: () => null });
    expect(broken.gitForFile('src/a.ts')).toBeNull();
  });

  it('prepareModules 聚合模块时间线/高频主题/生产模块 intent，测试行为不混入主叙事', () => {
    const src = file(root, 'src/core/scanner.ts', '// 扫描器：递归遍历目录并识别技术栈\nexport const A = 1;');
    const test = file(root, 'tests/core/scanner.test.ts', "describe('scanner', () => {\n  it('skips gitignored dirs', () => {});\n});");
    const provider = new IntentEvidenceProvider(makeScanResult([src, test], root), {
      runGit: gitRunner({
        'src/core/scanner.ts': LOG_A,
        'tests/core/scanner.test.ts': LOG_B,
      }),
    });
    provider.prepareModules(['core'], ['src/core/scanner.ts', 'tests/core/scanner.test.ts']);

    const timeline = provider.gitTimeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0].module).toBe('core');
    expect(timeline[0].commitCount).toBe(2);
    expect(timeline[0].first!.subject).toBe('init scanner');

    const intent = provider.moduleIntent('core')!;
    const kinds = intent.map(e => e.kind);
    expect(kinds).toContain('file-header');
    expect(kinds).toContain('git-commit');
    expect(kinds).not.toContain('test-spec');
    // testSpecs 仍是可独立消费的测试证据通道，但锚点保留在测试文件
    const spec = provider.testSpecs().find(e => e.target.file === 'src/core/scanner.ts')!;
    expect(spec.anchor).toBe('tests/core/scanner.test.ts:1');
    expect(spec.text).toContain('skips gitignored dirs');
  });

  it('高频主题：conventional 前缀归一后频次 ≥2 才入选', () => {
    const root = mkdtempSync(join(tmpdir(), 'intent-theme-'));
    const f1 = file(root, 'src/core/a.ts', 'export const A = 1;');
    const f2 = file(root, 'src/core/b.ts', 'export const B = 1;');
    const provider = new IntentEvidenceProvider(makeScanResult([f1, f2], root), {
      runGit: gitRunner({
        'src/core/a.ts': 'h1\t2026-01-01\tfeat: ipc pairing\nh2\t2026-02-01\tfix: ipc pairing\n',
        'src/core/b.ts': 'h3\t2026-03-01\trefactor table render\n',
      }),
    });
    provider.prepareModules(['core'], ['src/core/a.ts', 'src/core/b.ts']);
    const themes = provider.gitTimeline()[0].themes.join('');
    expect(themes).toContain('ipc pairing');
    expect(themes).toContain('×2');
  });

  it('depCommitEvidence 从仓库级提交池匹配依赖名（词边界）', () => {
    const f = file(root, 'src/a.ts', 'export const A = 1;');
    const provider = new IntentEvidenceProvider(makeScanResult([f], root), {
      runGit: gitRunner({}, 'h1\t2026-05-01\tchore: add yaml parser\nh2\t2026-05-02\tfeat: use ai sdk streaming\n'),
    });
    const evidence = provider.depCommitEvidence(['yaml', 'ai']);
    expect(evidence).toHaveLength(2);
    expect(evidence[0].anchor).toMatch(/^commit:h[12] \(2026-05-0[12]\)$/);
  });

  it('churnEvidence 渲染高频变更信号', () => {
    const f = file(root, 'src/core/a.ts', 'export const A = 1;');
    const provider = new IntentEvidenceProvider(makeScanResult([f], root), {
      runGit: gitRunner({ 'src/core/a.ts': LOG_A }),
    });
    provider.prepareModules(['core'], ['src/core/a.ts']);
    const churn = provider.churnEvidence(5);
    expect(churn).toHaveLength(1);
    expect(churn[0].kind).toBe('git-churn');
    expect(churn[0].text).toContain('2 次提交');
  });

  it('git 磁盘缓存：HEAD 一致复用，无需重复子进程', () => {
    const agentDir = mkdtempSync(join(tmpdir(), 'intent-cache-'));
    try {
      const f = file(agentDir, 'src/a.ts', 'export const A = 1;');
      const scan = makeScanResult([f], agentDir);
      let calls = 0;
      const counting: GitRunner = args => {
        calls++;
        if (args[0] === 'rev-parse') return 'HEAD\n';
        if (args[0] === 'log') return LOG_A;
        return null;
      };
      const p1 = new IntentEvidenceProvider(scan, { runGit: counting, agentDir });
      p1.gitForFile('src/a.ts');
      const afterFirst = calls;

      const p2 = new IntentEvidenceProvider(scan, { runGit: counting, agentDir });
      expect(p2.gitForFile('src/a.ts')!.count).toBe(2);
      // 第二个实例：rev-parse（缓存校验）之外不应再跑文件 log
      expect(calls).toBe(afterFirst + 1);
    } finally {
      rmSync(agentDir, { recursive: true, force: true });
    }
  });
});

describe('IntentEvidenceProvider 文档与 overview', () => {
  let root: string;

  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'intent-doc-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('docEvidence 切节：README + docs，设计文档整篇、普通文档前 3 节', () => {
    const readme = file(root, 'README.md', [
      '# Proj',
      '',
      '# 安装',
      '运行 pnpm install 即可。',
      '',
      '# 使用',
      '见文档。',
    ].join('\n'));
    const design = file(root, 'docs/design/adr-001.md', [
      '# ADR-001',
      '',
      '## 背景',
      '旧索引管线维护成本高。',
      '',
      '## 决策',
      '改用 MCP 子进程取数。',
    ].join('\n'));
    const provider = new IntentEvidenceProvider(makeScanResult([readme, design], root), { runGit: noGit });

    const docs = provider.docEvidence();
    const anchors = docs.map(d => d.anchor);
    expect(anchors).toContain('README.md#安装');
    // adr 路径命中 design → 两节都进
    expect(anchors).toContain('docs/design/adr-001.md#背景');
    expect(anchors).toContain('docs/design/adr-001.md#决策');
    expect(docs.find(d => d.anchor === 'docs/design/adr-001.md#决策')!.text).toContain('MCP 子进程');
  });

  it('overviewIntent：文档小节 + 入口文件头 + 仓库主题/首提交', () => {
    const entry = file(root, 'src/index.ts', '// CLI 入口：注册三个命令并装配流式输出\nexport const main = 1;');
    const repoLog = [
      'h1\t2026-01-01\tinit: scaffold cli',
      'h2\t2026-02-01\tfeat: wiki pages',
      'h3\t2026-03-01\tfix: wiki pages',
    ].join('\n');
    const provider = new IntentEvidenceProvider(makeScanResult([entry], root), {
      runGit: args => (args[0] === 'rev-parse' ? 'HEAD\n' : args[0] === 'log' ? `${repoLog}\n` : null),
    });

    const intent = provider.overviewIntent(['src/index.ts']);
    const kinds = intent.map(e => e.kind);
    expect(kinds).toContain('file-header');
    expect(kinds).toContain('git-theme');
    expect(kinds).toContain('git-commit');
    expect(intent.find(e => e.kind === 'git-commit')!.text).toContain('scaffold cli');
  });

  it('intentForFiles：文件集证据带首提交锚点并封顶', () => {
    const f = file(root, 'src/a.ts', '// 模块说明：负责扫描与技术栈识别\nexport const A = 1;');
    const provider = new IntentEvidenceProvider(makeScanResult([f], root), {
      runGit: args => {
        if (args[0] === 'rev-parse') return 'HEAD\n';
        if (args[0] === 'log') return 'h1\t2026-06-01\tinit scanner\n';
        return null;
      },
    });
    const intent = provider.intentForFiles(['src/a.ts']);
    expect(intent.some(e => e.kind === 'file-header')).toBe(true);
    expect(intent.some(e => e.kind === 'git-commit' && e.text.includes('首次提交'))).toBe(true);
    expect(intent.length).toBeLessThanOrEqual(14);
  });
});

describe('countIntentEvidence', () => {
  it('递归统计 context 内的证据种类（不误报普通对象）', () => {
    const ctx = {
      modules: [
        { name: 'a', intent: [{ kind: 'file-header', text: 't', anchor: 'a.ts:1', target: {} }] },
        { name: 'b', intent: [{ kind: 'git-commit', text: 't', anchor: 'commit:h1 (2026-01-01)', target: {} }] },
      ],
      docDecisions: [{ kind: 'doc-section', text: 't', anchor: 'README.md#x', target: {} }],
      notEvidence: [{ kind: 'custom', text: 't', anchor: 'x', target: {} }],
    };
    expect(countIntentEvidence(ctx)).toEqual({ 'file-header': 1, 'git-commit': 1, 'doc-section': 1 });
    expect(countIntentEvidence({ plain: 'string' })).toEqual({});
  });
});
