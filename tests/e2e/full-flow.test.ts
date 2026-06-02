import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const tmpDir = join(process.cwd(), '.test-e2e-tmp');
const binPath = 'node dist/bin.js';

describe('Full E2E Flow', () => {
  beforeEach(() => {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-app',
      dependencies: { express: '^4.18.0' },
    }));
    writeFileSync(
      join(tmpDir, 'src', 'app.ts'),
      `import express from 'express';\nconst app = express();\napp.get('/users', (req, res) => res.json([]));\napp.listen(3000);`
    );
    writeFileSync(
      join(tmpDir, 'src', 'user.service.ts'),
      `export class UserService {\n  getUsers() { return []; }\n  createUser(name: string) { return { name }; }\n}`
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should complete full init -> scan -> index -> ask -> build flow', () => {
    // Step 1: Init
    execSync(`${binPath} init --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(existsSync(join(tmpDir, '.scx-wiki-agent'))).toBe(true);
    expect(existsSync(join(tmpDir, '.wiki'))).toBe(true);

    // Step 2: Scan
    const scanOutput = execSync(`${binPath} scan --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(scanOutput).toContain('backend');
    expect(scanOutput).toContain('express');

    // Step 3: Index
    const indexOutput = execSync(`${binPath} index --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(indexOutput).toContain('Indexing complete');
    expect(indexOutput).toContain('Documents:');
    expect(indexOutput).toContain('Chunks:');
    expect(indexOutput).toContain('Symbols:');

    // Step 4: Ask
    const askOutput = execSync(`${binPath} ask "UserService" --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(askOutput).toContain('UserService');

    // Step 5: Build
    const buildOutput = execSync(`${binPath} build --project-root ${tmpDir}`, { encoding: 'utf-8' });
    expect(buildOutput).toContain('Wiki generated');

    // Verify wiki output files
    expect(existsSync(join(tmpDir, '.wiki', 'overview.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.wiki', 'architecture.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.wiki', 'modules.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.wiki', 'glossary.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.wiki', 'api.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.wiki', 'business.md'))).toBe(true);

    // Verify overview content
    const overview = readFileSync(join(tmpDir, '.wiki', 'overview.md'), 'utf-8');
    expect(overview).toContain('Project Overview');
    expect(overview).toContain('backend');

    // Verify architecture content
    const architecture = readFileSync(join(tmpDir, '.wiki', 'architecture.md'), 'utf-8');
    expect(architecture).toContain('Architecture');

    // Verify glossary content
    const glossary = readFileSync(join(tmpDir, '.wiki', 'glossary.md'), 'utf-8');
    expect(glossary).toContain('Key Concepts');
  });
});
