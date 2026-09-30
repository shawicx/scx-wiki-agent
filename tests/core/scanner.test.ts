import { describe, it, expect } from 'vitest';
import { FileScanner } from '../../src/core/scanner.js';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';

const fixturesDir = join(process.cwd(), 'tests/fixtures/sample-project');

describe('FileScanner', () => {
  it('should scan all source files', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();
    const paths = result.files.map((f) => f.relativePath);

    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/user.service.ts');
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
  });

  it('should not include node_modules files', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();
    const paths = result.files.map((f) => f.relativePath);

    expect(paths.every((p) => !p.includes('node_modules'))).toBe(true);
  });

  it('should detect correct language for each file', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();
    const tsFile = result.files.find((f) => f.relativePath === 'src/index.ts');

    expect(tsFile?.language).toBe('typescript');
  });

  it('生产源码无 import 时不回退全量声明依赖', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();

    // fixture 的生产源码没有外部 import：不得因测试/配置存在而回退到全量声明依赖
    expect(result.techStack).toEqual([]);
  });

  it('should detect project type', () => {
    const scanner = new FileScanner(fixturesDir);
    const result = scanner.scan();

    expect(result.projectType).toBe('unknown');
  });

  it('统一划分生产/测试文件，并拆分生产与测试技术栈', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'scanner-scope-'));
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        name: 'scope-demo',
        dependencies: { commander: '^12.0.0' },
        devDependencies: { vitest: '^4.0.0' },
      }));
      mkdirSync(join(tmp, 'src'), { recursive: true });
      mkdirSync(join(tmp, 'tests'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'cli.ts'), "import { Command } from 'commander'\n");
      writeFileSync(join(tmp, 'tests', 'cli.test.ts'), "import { describe } from 'vitest'\n");

      const result = new FileScanner(tmp).scan();
      const production = result.files.find(f => f.relativePath === 'src/cli.ts');
      const test = result.files.find(f => f.relativePath === 'tests/cli.test.ts');

      expect(production?.scope).toBe('production');
      expect(test?.scope).toBe('test');
      expect(result.productionFiles.map(f => f.relativePath)).toContain('src/cli.ts');
      expect(result.testFiles.map(f => f.relativePath)).toContain('tests/cli.test.ts');
      expect(result.fileCounts).toEqual({ total: 3, production: 2, test: 1 });
      expect(result.techStack).toContain('commander');
      expect(result.techStack).not.toContain('vitest');
      expect(result.testTechStack).toContain('vitest');
      expect(result.sourceDirs).toEqual(['src']);
      expect(result.projectType).toBe('cli');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('仅含 allowBuilds 的 pnpm-workspace.yaml 不判为 monorepo（审批配置 ≠ workspace）', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'scanner-ws-'));
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        name: 'cli-demo',
        dependencies: { commander: '^12.0.0' },
      }));
      writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n');
      mkdirSync(join(tmp, 'src'));
      writeFileSync(join(tmp, 'src', 'cli.ts'), "import { Command } from 'commander'\n");

      const result = new FileScanner(tmp).scan();
      expect(result.projectType).toBe('cli');

      // 声明 packages 后才判为 monorepo
      writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
      const result2 = new FileScanner(tmp).scan();
      expect(result2.projectType).toBe('monorepo');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('扫描 .vue/.rs/.css 文件；import 提取覆盖 Vue SFC 与 CSS @import（不再误报死依赖）', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'scanner-'));
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        dependencies: {
          vue: '^3.4.0',
          'lucide-vue-next': '^0.4.0',
          'tw-animate-css': '^4.0.0',
          'unused-dep': '^1.0.0',
        },
      }));
      mkdirSync(join(tmp, 'src'));
      writeFileSync(join(tmp, 'src/Comp.vue'),
        '<script setup>\nimport { Icon } from \'lucide-vue-next\'\nimport { ref } from \'vue\'\n</script>\n');
      writeFileSync(join(tmp, 'src/style.css'),
        '@import "tailwindcss";\n@import "tw-animate-css";\n');
      mkdirSync(join(tmp, 'src-tauri'));
      writeFileSync(join(tmp, 'src-tauri/main.rs'), 'fn main() {}\n');

      const result = new FileScanner(tmp).scan();
      const paths = result.files.map(f => f.relativePath);

      expect(paths).toContain('src/Comp.vue');
      expect(paths).toContain('src/style.css');
      expect(paths).toContain('src-tauri/main.rs');

      // .vue 里的 import 与 CSS @import 计入已用依赖；未引用的仍被过滤
      expect(result.techStack).toContain('vue');
      expect(result.techStack).toContain('lucide-vue-next');
      expect(result.techStack).toContain('tw-animate-css');
      expect(result.techStack).not.toContain('unused-dep');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('动态 import()、副作用导入（后跟 from 行）、node_modules 相对引用均可提取包名', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'scanner-'));
    try {
      writeFileSync(join(tmp, 'package.json'), JSON.stringify({
        dependencies: {
          '@tauri-apps/plugin-dialog': '^2',
          'tw-animate-css': '^4',
          'side-effect-pkg': '^1',
          'unused-dep': '^1',
        },
      }));
      mkdirSync(join(tmp, 'src'));
      // 动态 import（.vue 内）+ 副作用导入后紧跟 from 行（防跨行吞并）
      writeFileSync(join(tmp, 'src/Comp.vue'),
        '<script setup>\n'
        + "const { save } = await import('@tauri-apps/plugin-dialog')\n"
        + "import 'side-effect-pkg'\n"
        + "import { ref } from 'vue'\n"
        + '</script>\n');
      // 经 node_modules 的相对路径引用
      writeFileSync(join(tmp, 'src/main.ts'),
        "import '../node_modules/tw-animate-css/dist/tw-animate.css'\n");

      const result = new FileScanner(tmp).scan();
      expect(result.techStack).toContain('@tauri-apps/plugin-dialog');
      expect(result.techStack).toContain('side-effect-pkg');
      expect(result.techStack).toContain('tw-animate-css');
      expect(result.techStack).not.toContain('unused-dep');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
