import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const tmpDir = join(process.cwd(), '.test-tmp');

describe('CLI commands', () => {
  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('wiki --help should show available commands', () => {
    const output = execSync('node dist/bin.js --help', { encoding: 'utf-8' });
    expect(output).toContain('scan');
    expect(output).toContain('index');
    expect(output).toContain('init');
  });

  it('wiki init should create .scx-wiki-agent and .wiki directories', () => {
    execSync(`node dist/bin.js init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(existsSync(join(tmpDir, '.scx-wiki-agent'))).toBe(true);
    expect(existsSync(join(tmpDir, '.wiki'))).toBe(true);
  });
});
