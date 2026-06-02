import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const tmpDir = join(process.cwd(), '.test-edge-tmp');
const binPath = 'node dist/bin.js';

describe('Edge Cases', () => {
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should handle empty project', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'package.json'), '{"name": "empty"}');
    execSync(`${binPath} init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    const output = execSync(`${binPath} scan --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(output).toBeDefined();
    expect(output).toContain('Project:');
    expect(output).toContain('unknown');
  });

  it('should handle project without package.json', () => {
    mkdirSync(tmpDir, { recursive: true });
    const output = execSync(`${binPath} scan --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(output).toBeDefined();
    expect(output).toContain('Project:');
  });

  it('should handle ask when no index exists', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'package.json'), '{"name": "test"}');
    execSync(`${binPath} init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    const output = execSync(`${binPath} ask "test" --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(output).toBeDefined();
  });

  it('should handle build on empty project with no index', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'package.json'), '{"name": "empty-build-test"}');
    execSync(`${binPath} init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    const output = execSync(`${binPath} build --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(output).toContain('Wiki generated');
    // Should still generate basic pages even with no indexed data
    expect(existsSync(join(tmpDir, '.wiki', 'overview.md'))).toBe(true);
  });

  it('should handle re-init without error', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'package.json'), '{"name": "reinit-test"}');
    execSync(`${binPath} init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    // Running init again should succeed (idempotent)
    const output = execSync(`${binPath} init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(output).toContain('Wiki agent initialized');
    expect(existsSync(join(tmpDir, '.scx-wiki-agent'))).toBe(true);
  });

  it('should handle scan with only non-code files', () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'package.json'), '{"name": "docs-only"}');
    writeFileSync(join(tmpDir, 'README.md'), '# My Project\n\nSome docs.');
    writeFileSync(join(tmpDir, 'config.json'), '{"key": "value"}');
    const output = execSync(`${binPath} scan --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(output).toBeDefined();
    expect(output).toContain('Files Scanned:');
  });
});
