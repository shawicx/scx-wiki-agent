import { describe, it, expect } from 'vitest';
import { normalizeQualifiedName } from '../../src/shared/utils.js';

describe('normalizeQualifiedName', () => {
  const root = '/Users/scx/Documents/code/scx-terminal';

  it('剥除 `/`→`-` 畸形的绝对路径前缀，再对齐文件路径段', () => {
    expect(
      normalizeQualifiedName(
        'Users-scx-Documents-code-scx-terminal.src-tauri.src.shells.ShellInfo.default',
        root,
        'src-tauri/src/shells.rs',
      ),
    ).toBe('ShellInfo.default');
  });

  it('剥除 `/`→`.` 畸形的绝对路径前缀', () => {
    expect(
      normalizeQualifiedName('Users.scx.Documents.code.scx-terminal.src.lib.util.format', root, 'src/lib/util.ts'),
    ).toBe('format');
  });

  it('无路径前缀的正常限定名不受伤', () => {
    expect(normalizeQualifiedName('Outer.Inner.create', root, 'src/outer.ts')).toBe('Outer.Inner.create');
  });

  it('无点号值原样返回；文件段不匹配时只剥根前缀', () => {
    expect(normalizeQualifiedName('run', root)).toBe('run');
    expect(
      normalizeQualifiedName('Users-scx-Documents-code-scx-terminal.other.Type', root, 'src/x.rs'),
    ).toBe('other.Type');
  });
});
