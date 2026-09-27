import { describe, it, expect } from 'vitest';
import { WikiFallbackBuilder } from '../../src/knowledge/wiki-fallback-builder.js';

describe('WikiFallbackBuilder.buildCalls', () => {
  it('Tauri IPC 跨语言边置前，hotspot 组诚实标注为非应用入口', () => {
    const builder = new WikiFallbackBuilder();
    const content = builder.buildByName('calls', {
      groups: [
        {
          entry: 'main', entryFile: 'src/main.ts', kind: 'entry',
          edges: [{ caller: 'main', callee: 'run', calleeFile: 'src/run.ts', calleeLine: 5 }],
        },
        {
          entry: 'build', entryFile: 'src/core/build.ts', kind: 'hotspot',
          edges: [{ caller: 'build', callee: 'scan', calleeFile: 'src/scan.ts', calleeLine: 8 }],
        },
      ],
      fanIn: [{ symbol: 'scan', file: 'src/scan.ts', inDegree: 4 }],
      ipc: {
        commands: [
          {
            name: 'history_list',
            frontendCalls: [{ file: 'src/store.ts', line: 3 }],
            rustDef: { file: 'src-tauri/src/cmd.rs', line: 10 },
          },
        ],
        events: [],
      },
    } as any);

    // IPC 命令对表（前端调用点 ↔ Rust 定义）
    expect(content).toContain('Tauri IPC 调用边（跨语言）');
    expect(content).toContain('`history_list`');
    expect(content).toContain('src/store.ts:3');
    expect(content).toContain('src-tauri/src/cmd.rs:10');
    // 入口组与热点回填组的副标题区分
    expect(content).toContain('入口文件：src/main.ts');
    expect(content).toContain('高扇入热点锚定（非应用入口）：src/core/build.ts');
  });

  it('无 ipc 数据时不渲染 IPC 章节（非 Tauri 项目）', () => {
    const builder = new WikiFallbackBuilder();
    const content = builder.buildByName('calls', {
      groups: [
        {
          entry: 'main', entryFile: 'src/main.ts',
          edges: [{ caller: 'main', callee: 'run', calleeFile: 'src/run.ts', calleeLine: 5 }],
        },
      ],
      fanIn: [],
    } as any);

    expect(content).not.toContain('Tauri IPC');
    expect(content).toContain('入口文件：src/main.ts');
  });
});
