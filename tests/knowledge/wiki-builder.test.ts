import { describe, it, expect } from 'vitest';
import { WikiBuilder } from '../../src/knowledge/wiki-builder.js';

describe('WikiBuilder', () => {
  it('should build a document with title and sections', () => {
    const doc = new WikiBuilder()
      .addTitle('My Project')
      .addSection('Overview', 'This is a great project.')
      .addSubSection('Details', 'More info here.')
      .addParagraph('Some extra notes.')
      .build();

    expect(doc).toContain('# My Project');
    expect(doc).toContain('## Overview\n\nThis is a great project.');
    expect(doc).toContain('### Details\n\nMore info here.');
    expect(doc).toContain('Some extra notes.');
    // Verify section ordering
    const titleIdx = doc.indexOf('# My Project');
    const sectionIdx = doc.indexOf('## Overview');
    const subIdx = doc.indexOf('### Details');
    const paraIdx = doc.indexOf('Some extra notes.');
    expect(titleIdx).toBeLessThan(sectionIdx);
    expect(sectionIdx).toBeLessThan(subIdx);
    expect(subIdx).toBeLessThan(paraIdx);
  });

  it('should add code blocks', () => {
    const doc = new WikiBuilder()
      .addTitle('API Reference')
      .addCodeBlock('typescript', 'const x = 42;')
      .build();

    expect(doc).toContain('```typescript\nconst x = 42;\n```');
  });

  it('should add tables', () => {
    const doc = new WikiBuilder()
      .addTitle('Features')
      .addTable(
        ['Feature', 'Status'],
        [
          ['Auth', 'Done'],
          ['Logging', 'WIP'],
        ],
      )
      .build();

    expect(doc).toContain('| Feature | Status |');
    expect(doc).toContain('| --- | --- |');
    expect(doc).toContain('| Auth | Done |');
    expect(doc).toContain('| Logging | WIP |');
  });

  it('should add bullet lists', () => {
    const doc = new WikiBuilder()
      .addTitle('Tasks')
      .addBulletList(['Item A', 'Item B', 'Item C'])
      .build();

    expect(doc).toContain('- Item A\n- Item B\n- Item C');
  });

  it('should add newlines', () => {
    const doc = new WikiBuilder()
      .addParagraph('First')
      .addNewline()
      .addParagraph('Second')
      .build();

    expect(doc).toBe('First\n\n\n\nSecond');
  });

  it('should return an empty string when nothing is added', () => {
    expect(new WikiBuilder().build()).toBe('');
  });

  it('should support method chaining', () => {
    const builder = new WikiBuilder();
    const result = builder.addTitle('Test');
    expect(result).toBe(builder);
  });
});
