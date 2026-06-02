import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDatabase, closeDatabase } from '../../src/core/database.js';
import { UpdateService } from '../../src/services/update-service.js';

describe('UpdateService', () => {
  let tempDir: string;
  let db: ReturnType<typeof createDatabase>;
  let service: UpdateService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wiki-update-test-'));
    db = createDatabase(join(tempDir, '.scx-wiki-agent', 'index.db'));
    service = new UpdateService(db, tempDir);

    // Initialize a git repo in temp dir
    execSync('git init', { cwd: tempDir });
    execSync('git config user.email "test@test.com"', { cwd: tempDir });
    execSync('git config user.name "Test"', { cwd: tempDir });

    // Create and commit an initial file
    writeFileSync(join(tempDir, 'initial.txt'), 'hello');
    execSync('git add initial.txt', { cwd: tempDir });
    execSync('git commit -m "initial"', { cwd: tempDir });
  });

  afterEach(() => {
    closeDatabase(db);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects changed files via git diff', () => {
    // Create a new file and stage it
    writeFileSync(join(tempDir, 'new-file.txt'), 'new content');
    execSync('git add new-file.txt', { cwd: tempDir });

    const changed = service.detectChangedFiles();
    expect(changed).toContain('new-file.txt');
  });

  it('returns empty array when no changes', () => {
    const changed = service.detectChangedFiles();
    expect(changed).toEqual([]);
  });

  it('detects changed files since a specific commit', () => {
    // Get the initial commit hash
    const initialCommit = execSync('git rev-parse HEAD', {
      cwd: tempDir,
      encoding: 'utf-8',
    }).trim();

    // Create and commit a new file
    writeFileSync(join(tempDir, 'added-later.txt'), 'later content');
    execSync('git add added-later.txt', { cwd: tempDir });
    execSync('git commit -m "add later"', { cwd: tempDir });

    const changed = service.detectChangedFilesSince(initialCommit);
    expect(changed).toContain('added-later.txt');
  });

  it('incrementalUpdate removes entries for changed files', async () => {
    // Insert a parent document first to satisfy foreign key constraints
    db.prepare(
      "INSERT INTO documents (id, path, content, language, hash, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run('doc-1', 'src/foo.ts', 'file content', 'typescript', 'abc123', Date.now());

    // Insert data for a file that will be "updated"
    db.prepare(
      "INSERT INTO chunks (id, document_id, file_path, content, start_line, end_line, chunk_type) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run('chunk-1', 'doc-1', 'src/foo.ts', 'content', 1, 5, 'code');

    db.prepare(
      "INSERT INTO symbols (id, name, type, file_path, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)"
    ).run('sym-1', 'foo', 'function', 'src/foo.ts', 1, 5);

    db.prepare(
      "INSERT INTO relations (id, source, target, type, file_path) VALUES (?, ?, ?, ?, ?)"
    ).run('rel-1', 'foo', 'bar', 'calls', 'src/foo.ts');

    const result = await service.incrementalUpdate(['src/foo.ts']);

    expect(result.deleted).toBe(1);
    expect(result.updated).toBe(0);

    // Verify data was removed
    const chunks = db.prepare("SELECT * FROM chunks WHERE file_path = 'src/foo.ts'").all();
    const symbols = db.prepare("SELECT * FROM symbols WHERE file_path = 'src/foo.ts'").all();
    const relations = db.prepare("SELECT * FROM relations WHERE file_path = 'src/foo.ts'").all();

    expect(chunks).toHaveLength(0);
    expect(symbols).toHaveLength(0);
    expect(relations).toHaveLength(0);
  });
});
